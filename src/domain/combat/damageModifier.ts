import type { GameEvent } from "../../core/events";
import type { Actor, AllyActor, RunSkillId } from "../../core/types";
import type { PlayerState } from "../../entities/player";
import { totalDefense } from "../../entities/player";
import { speciesById } from "../../entities/species";
import { HONE_TSUYOSHI_MULTIPLIER } from "../../systems/dreamArtEffects";

/** がまんのかまえ: 足踏み直後の1撃の与ダメージ倍率 */
const BRACED_DAMAGE_MULTIPLIER = 2;
/** すてみ: 与ダメージの倍率(常時) */
const ALL_IN_DAMAGE_MULTIPLIER = 1.5;

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
