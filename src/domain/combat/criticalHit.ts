import type { OncePerRunTracker } from "../../core/oncePerRunTracker";
import type { GameEvent } from "../../core/events";
import type { Rng } from "../../core/rng";
import type { Actor, RunSkillId } from "../../core/types";
import type { Inventory } from "../../items/inventory";
import { hasEquipEffect } from "../../items/inventory";
import { hasSkill } from "../../entities/skills";
import type { DamageOptions } from "./types";

/** 会心の一撃が出る基本確率(1/32) */
const CRITICAL_ONE_IN = 32;
/**
 * 会心率の合計の上限(plan/game/archive/combat-mechanics.md)。武器・印・
 * 特技などの会心率ボーナスをいくら積んでも、この値を超えない。会心が
 * 戦闘の主軸になりすぎないための歯止め。不意打ち・強制会心(forceCrit)
 * はこの上限の対象外(そもそも確率ではなく確定なので)。
 */
export const MAX_CRIT_RATE = 0.2;

export function rollCritical(rng: Rng, opts?: DamageOptions): boolean {
  const rate = Math.min(MAX_CRIT_RATE, 1 / CRITICAL_ONE_IN + (opts?.critBonus ?? 0));
  return opts?.forceCrit || rng.chance(rate);
}

/**
 * スキル「とどめのさき」(plan/game/archive/run-build-skills.md):
 * HP1/4以下の敵への攻撃が必ず急所に当たる
 */
export const FINISHER_HP_RATIO = 0.25;

export interface AttackModifierArgs {
  attacker: Actor;
  target: Actor;
  events: GameEvent[];
  /** すてみ・がまんのかまえ等と同じ、Game.runSkillsをそのまま渡す */
  runSkills: readonly RunSkillId[];
  /** ガジリねずみの印(quickStrike)判定に使う、Game.player.inventoryをそのまま渡す */
  playerInventory: Inventory;
  /** ふいうち・ふいのいちげきの「1ラン1回」消費を、判定と同じ関数内で行うために渡す */
  oncePerRun: OncePerRunTracker;
}

/**
 * attackの前半: 会心を強制するかどうかに関わる特技・状態を判定し、
 * 消費が必要なもの(1ラン1回・予兆的中で解除するもの)はここで消費する。
 * ambushStrike(ダメージ+50%)は会心強制には関わらないが、同じタイミングで
 * 消費判定するため、呼び出し側の実効威力計算に使えるよう一緒に返す
 */
export function resolveAttackModifiers(
  args: AttackModifierArgs,
): { forceCrit: boolean; ambushStrike: boolean } {
  const { attacker, target, events, runSkills, playerInventory, oncePerRun } = args;

  // 不意打ち: まだ気づいていないモンスターへの攻撃は必ず会心になる
  const sneakAttack = target.kind === "monster" && !target.aware;
  if (sneakAttack) events.push({ type: "message", text: "不意打ち!" });

  // 特技「ふいうち」(plan/monster-fusion.md)、またはガジリねずみの印
  // (plan/equipment-forging.md): そのダイブで最初の1手は必ず会心
  const hasQuickStartEffect =
    (attacker.kind === "ally" && hasSkill(attacker, "quickStart")) ||
    (attacker.kind === "player" && hasEquipEffect(playerInventory, "quickStrike"));
  const quickStart = hasQuickStartEffect && !oncePerRun.hasUsed("quickStart", attacker.id);
  if (hasQuickStartEffect) oncePerRun.markUsed("quickStart", attacker.id);

  // ambush・mimic AI(plan/monster-compendium.md): 隣接されるまで潜んでいた
  // モンスターが、気づいた直後の1撃で会心になる(ambushReadyを持てるのはmonster/allyだけ)
  const ambushSurprise = attacker.kind === "monster" || attacker.kind === "ally" ? attacker.ambushReady === true : false;
  if (attacker.kind === "monster" || attacker.kind === "ally") {
    if (attacker.ambushReady) attacker.ambushReady = false;
  }

  // 特技「ふいのいちげき」(ambushStrike、plan/monster-compendium.md):
  // そのランの最初の1撃のダメージ+50%
  const hasAmbushStrikeEffect = attacker.kind === "ally" && hasSkill(attacker, "ambushStrike");
  const ambushStrike = hasAmbushStrikeEffect && !oncePerRun.hasUsed("ambushStrike", attacker.id);
  if (hasAmbushStrikeEffect) oncePerRun.markUsed("ambushStrike", attacker.id);

  // スキル「とどめのさき」(plan/game/archive/run-build-skills.md):
  // HP1/4以下の敵への攻撃が必ず急所に当たる
  const finisherCrit =
    attacker.kind === "player" &&
    runSkills.includes("finisher") &&
    target.maxHp > 0 &&
    target.hp / target.maxHp <= FINISHER_HP_RATIO;

  return { forceCrit: sneakAttack || quickStart || ambushSurprise || finisherCrit, ambushStrike };
}
