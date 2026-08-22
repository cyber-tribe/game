import type { OncePerRunTracker } from "../../core/oncePerRunTracker";
import type { GameEvent } from "../../core/events";
import { chebyshev } from "../../core/grid";
import type { Rng } from "../../core/rng";
import { type Actor, type AllyActor, type RunSkillId, isHostile } from "../../core/types";
import type { Inventory } from "../item/inventory";
import { hasEquipEffect } from "../item/inventory";
import { displayActorName } from "../../entities/naming";
import type { PlayerState } from "../../entities/player";
import { totalDefense } from "../../entities/player";
import { hasSkill } from "../../entities/skills";
import { speciesById } from "../../entities/species";
import { HONE_TSUYOSHI_MULTIPLIER, YUME_NO_KAKEBUTON_DAMAGE_REDUCTION } from "../party/dreamArtEffects";

/** がまんのかまえ: 足踏み直後の1撃の与ダメージ倍率 */
const BRACED_DAMAGE_MULTIPLIER = 2;
/** すてみ: 与ダメージの倍率(常時) */
const ALL_IN_DAMAGE_MULTIPLIER = 1.5;
/** すてみ: 被ダメージの倍率(常時) */
const ALL_IN_TAKEN_MULTIPLIER = 1.25;
/** 身構え(足踏み直後)による被ダメージ軽減率 */
const GUARD_DAMAGE_REDUCTION = 0.2;
/** 特技「はねひらり」が被弾を完全にかわす確率 */
const FLUTTER_DODGE_CHANCE = 0.2;
/** かばいあい: 身代わりが発動する確率 */
const MUTUAL_GUARD_CHANCE = 0.4;
/** タルをぶつけたときの基本ダメージ */
const BARREL_DAMAGE = 8;

export interface EffectiveAttackPowerArgs {
  attacker: Actor;
  attackPower: number;
  /** 特技「ふいのいちげき」(plan/monster-compendium.md): ダメージ+50% */
  ambushStrike: boolean;
  /** 60種化・追加種族(plan/monster-roster-expansion-species.md): 攻撃者のいる部屋が
   * 眠りの胞子で満ちているか(Room.spored)。Domainにfloor全体を渡さないため呼び出し側で判定する */
  sporedRoom: boolean;
  runSkills: readonly RunSkillId[];
  /** がまんのかまえ(bracedReady)の判定と消費を1回で行う。attacker.kind==="player"のときだけ呼ぶ */
  consumeBraced: () => boolean;
}

/**
 * attack()内のeffectivePower計算ブロック(ambush 1.5倍 / lowHpBonus /
 * spore倍率 / がまんのかまえ / すてみ)。
 */
export function effectiveAttackPower(args: EffectiveAttackPowerArgs): number {
  const { attacker, attackPower, ambushStrike, sporedRoom, runSkills, consumeBraced } = args;
  // 地方ごとの成熟系統(plan/companion-evolution-expansion.md): なみだぐまは
  // HPが減るほど攻撃力が上がる(HP満タンで+0%、HP0近くで最大値に近づく)
  const attackerSpeciesId = attacker.kind === "monster" || attacker.kind === "ally" ? attacker.speciesId : undefined;
  const lowHpBonusMax = attackerSpeciesId ? speciesById(attackerSpeciesId).lowHpAtkBonusMax ?? 0 : 0;
  const hpRatio = attacker.maxHp > 0 ? Math.max(0, attacker.hp) / attacker.maxHp : 1;
  const lowHpMultiplier = 1 + lowHpBonusMax * (1 - hpRatio);
  // 60種化・追加種族(plan/monster-roster-expansion-species.md): きのこおとこは
  // 眠りの胞子で満ちた部屋(Room.spored)にいる間、攻撃力に倍率が乗る
  const sporeBonusMax = attackerSpeciesId ? speciesById(attackerSpeciesId).atkMulInSporedRoom ?? 0 : 0;
  const sporeMultiplier = sporeBonusMax > 0 && sporedRoom ? 1 + sporeBonusMax : 1;
  // スキル「がまんのかまえ」(plan/game/archive/run-build-skills.md): 足踏み直後の1撃だけ2倍
  const bracedActive = attacker.kind === "player" && consumeBraced();
  const bracedMultiplier = bracedActive ? BRACED_DAMAGE_MULTIPLIER : 1;
  // スキル「すてみ」: 与ダメージ+50%(常時)
  const allInMultiplier =
    attacker.kind === "player" && runSkills.includes("allIn") ? ALL_IN_DAMAGE_MULTIPLIER : 1;
  return Math.round(
    (ambushStrike ? attackPower * 1.5 : attackPower) *
      lowHpMultiplier *
      sporeMultiplier *
      bracedMultiplier *
      allInMultiplier,
  );
}

export interface EffectiveDefenseArgs {
  attacker: Actor;
  target: Actor;
  events: GameEvent[];
  /** target.kind==="player"のときのtotalDefense()計算に使う */
  player: PlayerState;
}

/**
 * attack()内のdefense決定ブロック(かたやぶり / ホネつよし / totalDefense)。
 */
export function effectiveDefense(args: EffectiveDefenseArgs): number {
  const { attacker, target, events, player } = args;
  // ゆめわざ「かたやぶり」(plan/game/archive/companion-leveling-and-arts.md):
  // 消費型の自己強化なので、使ったらここで1回だけ効かせて消す
  const ignoresDefense = attacker.kind === "ally" && attacker.ignoreDefenseNextHit === true;
  if (ignoresDefense) {
    (attacker as AllyActor).ignoreDefenseNextHit = false;
    events.push({ type: "message", text: "防御を破った!" });
  }
  const baseDefense = target.kind === "player" ? totalDefense(player) : target.def;
  // ゆめわざ「ホネつよし」: defにだけ掛かる一時倍率
  const defBuff = target.kind === "ally" && (target.defBuffTurns ?? 0) > 0 ? HONE_TSUYOSHI_MULTIPLIER : 1;
  return ignoresDefense ? 0 : Math.round(baseDefense * defBuff);
}

export interface PickMutualGuardCovererArgs {
  attacker: Actor;
  target: Actor;
  events: GameEvent[];
  rng: Rng;
  runSkills: readonly RunSkillId[];
  /** [player, ...allies] をそのまま渡す */
  party: readonly Actor[];
}

/**
 * スキル「かばいあい」(plan/game/archive/run-build-skills.md): 隣接する
 * 仲間・自分への攻撃を、確率でどちらかが代わりに受ける。ダメージ計算より
 * 前(防御力を確定する前)に対象を差し替えるので、身代わり側の防御力で
 * 正しく計算される
 */
export function pickMutualGuardCoverer(args: PickMutualGuardCovererArgs): Actor | null {
  const { attacker, target, events, rng, runSkills, party } = args;
  if (!runSkills.includes("mutualGuard")) return null;
  if (!isHostile(attacker, target)) return null;
  if (target.kind !== "player" && target.kind !== "ally") return null;
  if (!rng.chance(MUTUAL_GUARD_CHANCE)) return null;
  const coverer = party.find((a) => a.alive && a.id !== target.id && chebyshev(a.pos, target.pos) === 1);
  if (!coverer) return null;
  events.push({ type: "message", text: `${displayActorName(coverer)}が身代わりになった!` });
  return coverer;
}

export interface MitigateIncomingDamageArgs {
  target: Actor;
  damage: number;
  events: GameEvent[];
  rng: Rng;
  runSkills: readonly RunSkillId[];
  player: PlayerState;
  oncePerRun: OncePerRunTracker;
  /** ゆめわざ「ゆめのかけぶとん」の残りターン数。Game.partyGuardTurnsをそのまま渡す */
  partyGuardTurns: number;
}

/**
 * 被ダメージへの軽減を適用する。プレイヤーには樽受け身(全無効・最優先)、
 * 身構え(2割軽減)、ぷるんの印(plan/equipment-forging.md、5割の確率で1割軽減)、
 * 仲間には特技「みをまもる」(5割の確率で1割軽減)を適用する。
 */
export function mitigateIncomingDamage(args: MitigateIncomingDamageArgs): number {
  const { target, damage, events, rng, runSkills, player, oncePerRun, partyGuardTurns } = args;

  if (target.kind === "player") {
    // スキル「すてみ」(plan/game/archive/run-build-skills.md): 被ダメージ+25%
    // (常時。他の軽減より先に、素の被弾量に掛ける)
    const incoming = runSkills.includes("allIn") ? Math.round(damage * ALL_IN_TAKEN_MULTIPLIER) : damage;
    if (player.ukemiReady) {
      player.ukemiReady = false;
      events.push({ type: "message", text: "樽受け身で衝撃を受け流した!" });
      return 0;
    }
    if (player.guarding) {
      player.guarding = false;
      events.push({ type: "message", text: "身構えていたので、ダメージをおさえた!" });
      return Math.max(1, Math.floor(incoming * (1 - GUARD_DAMAGE_REDUCTION)));
    }
    if (hasEquipEffect(player.inventory, "damageReduction") && rng.chance(0.5)) {
      events.push({ type: "message", text: "印の力で衝撃をやわらげた!" });
      return Math.max(1, Math.floor(incoming * 0.9));
    }
    return incoming;
  }

  if (target.kind === "ally") {
    // 特技「はねひらり」(flutterDodge、plan/monster-compendium.md): 確率で被弾を完全にかわす
    if (hasSkill(target, "flutterDodge") && rng.chance(FLUTTER_DODGE_CHANCE)) {
      events.push({ type: "message", text: `${displayActorName(target)}はひらりとかわした!` });
      return 0;
    }
    // 特技「とんずら」(burrowEscape、plan/monster-compendium.md): 瀕死になる一撃を
    // 1ラン1回だけ、とっさに離脱して避ける
    if (
      hasSkill(target, "burrowEscape") &&
      !oncePerRun.hasUsed("burrowEscape", target.id) &&
      target.hp - damage <= target.maxHp * 0.3
    ) {
      oncePerRun.markUsed("burrowEscape", target.id);
      events.push({ type: "message", text: `${displayActorName(target)}はとっさに離脱してダメージを避けた!` });
      return 0;
    }
  }

  if (target.kind === "ally" && hasSkill(target, "steadfastBody")) {
    // 特技「ゆるがぬからだ」(plan/companion-evolution.md): 「みをまもる」の常時発動版
    events.push({ type: "message", text: `${displayActorName(target)}は衝撃をやわらげた!` });
    return Math.max(1, Math.floor(damage * 0.9));
  }
  if (target.kind === "ally" && hasSkill(target, "softBody") && rng.chance(0.5)) {
    // 特技「みをまもる」: 確率5割で被弾ダメージを1割軽減する
    events.push({ type: "message", text: `${displayActorName(target)}は衝撃をやわらげた!` });
    return Math.max(1, Math.floor(damage * 0.9));
  }
  // ゆめわざ「ゆめのかけぶとん」(plan/game/archive/companion-leveling-and-arts.md):
  // 仲間全員の被弾を1ターンだけ1割軽減する(誰が使ったかによらず一律)
  if (target.kind === "ally" && partyGuardTurns > 0) {
    return Math.max(1, Math.floor(damage * (1 - YUME_NO_KAKEBUTON_DAMAGE_REDUCTION)));
  }
  return damage;
}

/** タルを投げたときの基礎ダメージ。ツブテガエルの印(plan/equipment-forging.md)で+2 */
export function barrelThrowDamage(inventory: Inventory): number {
  return BARREL_DAMAGE + (hasEquipEffect(inventory, "barrelDamageBonus") ? 2 : 0);
}
