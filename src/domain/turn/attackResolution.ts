import { dirFromDelta } from "../../core/grid";
import type { Actor, CombatantActor, FloorState, RunSkillId, StatusKind } from "../../core/types";
import { STATUS_CONFUSE, STATUS_SEAL, STATUS_SLEEP, hasStatus, roomOf } from "../../core/types";
import type { GameEvent } from "../../core/events";
import type { Rng } from "../../core/rng";
import type { OncePerRunTracker } from "../../core/oncePerRunTracker";
import type { PlayerState } from "../../entities/player";
import { totalDefense } from "../../entities/player";
import { hasSkill } from "../../entities/skills";
import { hasEquipEffect } from "../../items/inventory";
import { addStatus } from "../../items/effects";
import { speciesById } from "../../entities/species";
import { t } from "../../i18n";
import { displayActorName } from "../../entities/naming";
import { KODAMA_NO_OTAKEBI_ECHO_MULTIPLIER } from "../../systems/dreamArtEffects";
import { computeDamage } from "../combat/damageCalculation";
import { resolveAttackModifiers } from "../combat/criticalHit";
import { tryEvade } from "../combat/evasion";
import { effectiveAttackPower, effectiveDefense, mitigateIncomingDamage, pickMutualGuardCoverer } from "../combat/damageModifier";

/** スリガラス(plan/shops-and-thieves.md)が盗みを成功させる確率 */
const THIEF_STEAL_CHANCE = 0.4;
/** 特技「みだしのつめ」が混乱を付与する確率 */
const CONFUSING_CLAW_CHANCE = 0.15;
/** 特技「ふうじのキバ」が封じを付与する確率 */
const SEAL_BITE_CHANCE = 0.15;
/** 夢あわせで得た付与系特技(みだしのつめ・ふうじのキバ)が状態異常を持続させるターン数 */
const INHERITED_INFLICT_TURNS = 3;
/** 地方ごとの成熟系統(こだまぎつね系)の追加攻撃、最大反響回数 */
const ECHO_ATTACK_MAX = 2;

/** attacker.inflicts で状態異常を付与したときのメッセージ */
const STATUS_INFLICT_MESSAGES: Partial<Record<StatusKind, string>> = {
  [STATUS_SLEEP]: "眠ってしまった",
  [STATUS_CONFUSE]: "混乱した",
  [STATUS_SEAL]: "封じられた",
};

export interface AttemptStealArgs {
  thief: CombatantActor;
  target: Actor;
  player: PlayerState;
  rng: Rng;
  events: GameEvent[];
}

/** スリガラス(plan/shops-and-thieves.md)の盗み。成功率は控えめにし、盗む額もほどほどに留める */
export function attemptSteal(args: AttemptStealArgs): void {
  const { thief, target, player, rng, events } = args;
  thief.facing = dirFromDelta(target.pos.x - thief.pos.x, target.pos.y - thief.pos.y);
  events.push({ type: "attack", attackerId: thief.id, targetId: target.id });
  const gold = player.gold;
  if (gold <= 0 || !rng.chance(THIEF_STEAL_CHANCE)) {
    events.push({ type: "message", text: `${displayActorName(thief)}は何も盗めなかった。` });
    return;
  }
  const stolen = Math.max(1, Math.round(gold * rng.float(0.2, 0.5)));
  player.gold -= stolen;
  thief.stolenGold = stolen;
  events.push({ type: "message", text: `${displayActorName(thief)}に${stolen}ゴールド盗まれた!` });
}

export interface AttackArgs {
  attacker: Actor;
  target: Actor;
  attackPower: number;
  events: GameEvent[];
  combatOpts?: { critBonus?: number; forceCrit?: boolean };
  rng: Rng;
  floor: FloorState;
  player: PlayerState;
  allies: readonly Actor[];
  runSkills: readonly RunSkillId[];
  oncePerRun: OncePerRunTracker;
  echoAttackTurns: number;
  /** ゆめわざ「ゆめのかけぶとん」の残りターン数。Game.partyGuardTurnsをそのまま渡す */
  partyGuardTurns: number;
  damageActor(target: Actor, damage: number, critical: boolean): void;
}

/**
 * 攻撃1回の解決フロー。かばいあいでの対象差し替え→命中判定・回避→
 * 実効攻撃力/防御力の決定→ダメージ算出・適用→追加効果(状態異常・こだま)
 * の順で進む(Phase 2で計算部分をdomain/combatへ切り出し済み、ここは
 * そのオーケストレーション)
 */
export function attack(args: AttackArgs): void {
  const { attacker, events, rng, floor, player, allies, runSkills, oncePerRun, echoAttackTurns, partyGuardTurns, damageActor } =
    args;
  let { target } = args;
  const { attackPower, combatOpts } = args;

  target =
    pickMutualGuardCoverer({
      attacker,
      target,
      events,
      rng,
      runSkills,
      party: [player, ...allies],
    }) ?? target;
  attacker.facing = dirFromDelta(target.pos.x - attacker.pos.x, target.pos.y - attacker.pos.y);
  events.push({ type: "attack", attackerId: attacker.id, targetId: target.id });
  events.push({ type: "message", text: `${displayActorName(attacker)}のこうげき!` });
  if (attacker.kind === "player" && target.kind === "monster") {
    events.push({ type: "tutorialTip", id: "weakenThenThrow" });
  }

  const { forceCrit, ambushStrike } = resolveAttackModifiers({
    attacker,
    target,
    events,
    runSkills,
    playerInventory: player.inventory,
    oncePerRun,
  });
  if (tryEvade(rng, target, events)) return;

  const defense = effectiveDefense({ attacker, target, events, player });
  const effectivePower = effectiveAttackPower({
    attacker,
    attackPower,
    ambushStrike,
    sporedRoom: roomOf(floor, attacker.pos)?.spored === true,
    runSkills,
    consumeBraced: () => {
      if (player.bracedReady) {
        player.bracedReady = false;
        return true;
      }
      return false;
    },
  });
  const { damage, critical } = computeDamage(rng, effectivePower, defense, {
    ...combatOpts,
    forceCrit: combatOpts?.forceCrit || forceCrit,
  });
  if (critical) events.push({ type: "message", text: "会心の一撃!" });

  applyAttackDamage({
    attacker,
    target,
    damage,
    critical,
    events,
    rng,
    runSkills,
    player,
    oncePerRun,
    partyGuardTurns,
    damageActor,
  });

  // 攻撃してきた相手には気づく
  if (target.kind === "monster") target.aware = true;

  applyOnHitStatuses({ attacker, target, events, rng, player, floor });
  applyEchoAttacks({
    attacker,
    target,
    effectivePower,
    events,
    rng,
    runSkills,
    player,
    oncePerRun,
    partyGuardTurns,
    echoAttackTurns,
    damageActor,
  });
}

interface ApplyAttackDamageArgs {
  attacker: Actor;
  target: Actor;
  damage: number;
  critical: boolean;
  events: GameEvent[];
  rng: Rng;
  runSkills: readonly RunSkillId[];
  player: PlayerState;
  oncePerRun: OncePerRunTracker;
  partyGuardTurns: number;
  damageActor(target: Actor, damage: number, critical: boolean): void;
}

/**
 * attackの本体: 確定した基礎ダメージを実際に適用する。オイテケボシ
 * (drainsSatiety)は例外で、HPではなくプレイヤーの満腹度を削って終わる
 * (ヨロイオイテケの反撃ダメージも適用しない)
 */
function applyAttackDamage(args: ApplyAttackDamageArgs): void {
  const { attacker, target, damage, critical, events, rng, runSkills, player, oncePerRun, partyGuardTurns, damageActor } =
    args;

  // オイテケボシ(drainsSatiety、plan/monster-compendium.md): HPではなく
  // プレイヤーの満腹度を削る特殊効果。防御・軽減の計算はそのまま流用する
  const attackerSpeciesId = attacker.kind === "monster" || attacker.kind === "ally" ? attacker.speciesId : undefined;
  const drainsSatiety =
    target.kind === "player" && attackerSpeciesId !== undefined && speciesById(attackerSpeciesId).drainsSatiety;
  if (drainsSatiety) {
    const drained = Math.max(1, Math.round(damage / 2));
    player.satiety = Math.max(0, player.satiety - drained);
    events.push({ type: "message", text: t("msg.satietyDrained", { amount: drained }) });
    return;
  }

  const finalDamage = mitigateIncomingDamage({
    target,
    damage,
    events,
    rng,
    runSkills,
    player,
    oncePerRun,
    partyGuardTurns,
  });
  events.push({ type: "message", text: `${displayActorName(target)}に${finalDamage}のダメージ!` });
  damageActor(target, finalDamage, critical);

  // 地方ごとの成熟系統(plan/companion-evolution-expansion.md): ヨロイオイテケは
  // 被弾するたび、受けたダメージの一部を攻撃者に返す。プランの原案は
  // 「相手の満腹度を削り返す」だったが、満腹度はプレイヤー専用のステータスで
  // 攻撃者(モンスター)には存在しないため、ダメージ反射に差し替えた
  const targetSpeciesId = target.kind === "monster" || target.kind === "ally" ? target.speciesId : undefined;
  const counterRatio = targetSpeciesId ? speciesById(targetSpeciesId).counterDamageRatio ?? 0 : 0;
  if (counterRatio > 0 && attacker.alive) {
    const counter = Math.max(1, Math.round(finalDamage * counterRatio));
    events.push({ type: "message", text: `${displayActorName(target)}が身を固めて${counter}のダメージを返した!` });
    damageActor(attacker, counter, false);
  }

  // ゆめわざ「こだまがえし」(plan/game/archive/companion-leveling-and-arts.md):
  // 消費型の自己強化。counterDamageRatioと同じ仕組みで、受けた1撃の半分を返す
  if (target.kind === "ally" && target.reflectNextHit) {
    target.reflectNextHit = false;
    if (attacker.alive && finalDamage > 0) {
      const reflected = Math.max(1, Math.round(finalDamage * 0.5));
      events.push({
        type: "message",
        text: `${displayActorName(target)}が『こだまがえし』で${reflected}のダメージを返した!`,
      });
      damageActor(attacker, reflected, false);
    }
  }
}

interface ApplyOnHitStatusesArgs {
  attacker: Actor;
  target: Actor;
  events: GameEvent[];
  rng: Rng;
  player: PlayerState;
  floor: FloorState;
}

/** attackの後半: 命中した攻撃者側の特技による状態異常の追加付与を判定する */
function applyOnHitStatuses(args: ApplyOnHitStatusesArgs): void {
  const { attacker, target, events, rng, player, floor } = args;
  const effectCtx = { rng, floor, player, events };

  // 特技「ねむりごな」、またはマドロミダケの印(plan/equipment-forging.md):
  // 隣接する敵への攻撃に、眠り付与の確率+10%を上乗せする
  const hasDrowsyEffect =
    (attacker.kind === "ally" && hasSkill(attacker, "drowsyBreath")) ||
    (attacker.kind === "player" && hasEquipEffect(player.inventory, "drowsyBonus"));
  const drowsyBonus = hasDrowsyEffect ? 0.1 : 0;
  const inflicts = attacker.kind === "monster" || attacker.kind === "ally" ? attacker.inflicts : undefined;
  const inflictChance = (inflicts?.chance ?? 0) + drowsyBonus;
  // かなしばりの杖で封じられている間は、特技(状態異常の追加付与)が出せない
  const sealed = hasStatus(attacker, STATUS_SEAL);
  if (target.alive && inflictChance > 0 && !sealed && rng.chance(inflictChance)) {
    const kind = inflicts?.kind ?? STATUS_SLEEP;
    const turns = inflicts?.turns ?? 4;
    addStatus(effectCtx, target, kind, turns, STATUS_INFLICT_MESSAGES[kind] ?? "様子がおかしくなった");
  }

  // 特技「みだしのつめ」「ふうじのキバ」(plan/monster-compendium.md): 種族の
  // 素の inflicts を持たない個体でも、夢あわせで得た特技ぶんは独立して付与を狙える
  if (target.alive && !sealed) {
    if (hasSkill(attacker, "confusingClaw") && rng.chance(CONFUSING_CLAW_CHANCE)) {
      addStatus(effectCtx, target, STATUS_CONFUSE, INHERITED_INFLICT_TURNS, "混乱した");
    }
    if (target.alive && hasSkill(attacker, "sealBite") && rng.chance(SEAL_BITE_CHANCE)) {
      addStatus(effectCtx, target, STATUS_SEAL, INHERITED_INFLICT_TURNS, "封じられた");
    }
  }
}

interface ApplyEchoAttacksArgs {
  attacker: Actor;
  target: Actor;
  effectivePower: number;
  events: GameEvent[];
  rng: Rng;
  runSkills: readonly RunSkillId[];
  player: PlayerState;
  oncePerRun: OncePerRunTracker;
  partyGuardTurns: number;
  echoAttackTurns: number;
  damageActor(target: Actor, damage: number, critical: boolean): void;
}

/**
 * 地方ごとの成熟系統(plan/companion-evolution-expansion.md): こだまぎつねは
 * 命中のたび確率で追加の1撃を同じ相手に放つ(最大2回まで反響)
 */
function applyEchoAttacks(args: ApplyEchoAttacksArgs): void {
  const {
    attacker,
    target,
    effectivePower,
    events,
    rng,
    runSkills,
    player,
    oncePerRun,
    partyGuardTurns,
    echoAttackTurns,
    damageActor,
  } = args;
  const echoArgs = { events, rng, runSkills, player, oncePerRun, partyGuardTurns, damageActor };

  // ぬしのゆめわざ「こだまのおたけび」(plan/game/archive/boss-dream-arts.md):
  // 次の数ターン、仲間全員の攻撃に確率に関わらず半減ダメージの追加1撃を保証する。
  // 種族特性echoAttackChance(確率式・こだまぎつね系)とは別枠で、両方乗りうる
  if (attacker.kind === "ally" && echoAttackTurns > 0 && target.alive) {
    echoHit({ attacker, target, power: Math.round(effectivePower * KODAMA_NO_OTAKEBI_ECHO_MULTIPLIER), ...echoArgs });
  }
  const attackerSpeciesId = attacker.kind === "monster" || attacker.kind === "ally" ? attacker.speciesId : undefined;
  const echoChance = attackerSpeciesId ? speciesById(attackerSpeciesId).echoAttackChance ?? 0 : 0;
  if (echoChance <= 0) return;
  for (let echo = 0; echo < ECHO_ATTACK_MAX && target.alive && rng.chance(echoChance); echo++) {
    echoHit({ attacker, target, power: effectivePower, ...echoArgs });
  }
}

interface EchoHitArgs {
  attacker: Actor;
  target: Actor;
  power: number;
  events: GameEvent[];
  rng: Rng;
  runSkills: readonly RunSkillId[];
  player: PlayerState;
  oncePerRun: OncePerRunTracker;
  partyGuardTurns: number;
  damageActor(target: Actor, damage: number, critical: boolean): void;
}

/** applyEchoAttacksの1回ぶんの追加攻撃(種族特性・こだまのおたけびで共有) */
function echoHit(args: EchoHitArgs): void {
  const { attacker, target, power, events, rng, runSkills, player, oncePerRun, partyGuardTurns, damageActor } = args;
  events.push({ type: "message", text: `${displayActorName(attacker)}のこうげきがこだました!` });
  const echoDefense = target.kind === "player" ? totalDefense(player) : target.def;
  const { damage, critical } = computeDamage(rng, power, echoDefense);
  const finalDamage = mitigateIncomingDamage({
    target,
    damage,
    events,
    rng,
    runSkills,
    player,
    oncePerRun,
    partyGuardTurns,
  });
  events.push({ type: "message", text: `${displayActorName(target)}に${finalDamage}のダメージ!` });
  damageActor(target, finalDamage, critical);
}
