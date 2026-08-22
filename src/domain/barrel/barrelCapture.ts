import type { Vec2 } from "../../core/grid";
import type { Actor, Barrel, FloorState, RunSkillId, TargetActor } from "../../core/types";
import type { GameEvent } from "../../core/events";
import type { Rng } from "../../core/rng";
import type { Inventory } from "../item/inventory";
import { hasEquipEffect } from "../item/inventory";
import { computeDamage } from "../combat/damageCalculation";
import { t } from "../../i18n";
import { dropBarrelNear } from "./barrelDrop";

/** つれさりの心得: 捕獲確率への加算 */
export const CAPTURE_MASTERY_BONUS = 0.15;

/**
 * 空のタルでモンスターを吸い込める確率。
 * 満タンの相手にはめったに効かず、瀕死ならほぼ確実に入る。
 * 「弱らせてから捕まえる」が自然な手順になるように振ってある。
 */
export function captureChance(target: Actor): number {
  return captureChanceAt(target.hp, target.maxHp);
}

/** captureChanceの中身。見込み表示(captureOutlook)が「当てた後のHP」で試算するために切り出してある */
function captureChanceAt(hp: number, maxHp: number): number {
  const wounded = 1 - hp / maxHp;
  return Math.min(0.85, 0.12 + 0.68 * wounded);
}

/**
 * 入りやすさの3段階(plan/game/barrel-capture-clarity.md)。
 * design/balance-philosophy.md の「数値を見せすぎない」方針に沿って、
 * 厳密な%は出さずにこの3つへ丸めてHUDに出す。
 */
export type CaptureTier = "likely" | "even" | "hard";

/** 3段階のしきい値。計画書の未決事項への回答として、例示された0.6/0.3をそのまま採る */
const CAPTURE_TIER_LIKELY = 0.6;
const CAPTURE_TIER_EVEN = 0.3;

export function captureTier(chance: number): CaptureTier {
  if (chance >= CAPTURE_TIER_LIKELY) return "likely";
  if (chance >= CAPTURE_TIER_EVEN) return "even";
  return "hard";
}

/** 捕獲の見込み(HUD表示用)。相手の名前と3段階だけを渡し、確率そのものは見せない */
export interface CaptureOutlook {
  name: string;
  tier: CaptureTier;
}

/**
 * 捕獲の見込み(HUD表示用)。見込みは「タルを当てた直後のHP」で試算する。
 * 空のタルの命中ダメージは相手を倒さない(HP1で止まる)ので、低HP種に投げれば
 * 実際に高確率で入る。現在のHPのまま見せると、この仕様の主目的である低HP種で
 * かえって実態と食い違うため。ダメージの乱数・会心は見込みに織り込まない
 */
export function captureOutlookFor(
  target: Actor,
  currentHp: number,
  inventory: Inventory,
  throwDamage: number,
): CaptureOutlook | null {
  if (!target.alive || target.kind !== "monster") return null;
  if (target.speciesId === undefined) return null;

  const expected = Math.max(1, Math.floor(throwDamage - target.def / 2));
  const hpAfter = Math.max(1, currentHp - expected);
  const bonus = target.captureBonus ?? 0;
  const charmBonus = hasEquipEffect(inventory, "barrelKinship") ? 0.1 : 0;
  const chance = Math.min(0.9, captureChanceAt(hpAfter, target.maxHp) + bonus + charmBonus);
  return { name: target.name, tier: captureTier(chance) };
}

export interface ResolveEmptyBarrelArgs {
  floor: FloorState;
  rng: Rng;
  playerInventory: Inventory;
  playerPos: Vec2;
  runSkills: RunSkillId[];
  alliesCount: number;
  barrel: Barrel;
  landing: Vec2;
  hit: Actor | null;
  hitCurrentHp: number;
  throwDamage: number;
  events: GameEvent[];
  critForced?: boolean;
  resolveTarukurabeHit(hit: TargetActor): void;
  damageActor(target: Actor, damage: number, critical: boolean): void;
}

const MAX_ALLIES = 2;

export function resolveEmptyBarrel(args: ResolveEmptyBarrelArgs): boolean {
  const {
    floor,
    rng,
    playerInventory,
    playerPos,
    runSkills,
    alliesCount,
    barrel,
    landing,
    hit,
    hitCurrentHp,
    throwDamage,
    events,
    critForced = false,
    resolveTarukurabeHit,
    damageActor,
  } = args;

  if (!hit) {
    dropBarrelNear({ floor, rng, barrel, preferred: landing, events });
    return true;
  }

  // 樽比べ(plan/tarukurabe-minigame.md): 的はダメージ計算にも捕獲判定にも
  // 乗らない、得点処理だけの専用フロー
  if (hit.kind === "target") {
    resolveTarukurabeHit(hit);
    return true;
  }

  const rolled = computeDamage(rng, throwDamage, hit.def, critForced ? { forceCrit: true } : undefined);
  // 空のタルは捕獲道具であって武器ではない(plan/game/barrel-capture-clarity.md)。
  // 捕獲判定に進む相手(=最後に当たった1体)だけは、命中ダメージでHPが1未満に
  // ならないよう止める。まぶたむしのような低HP種が「弱らせる前に死ぬ」ために
  // 捕獲が事実上不可能になっていた矛盾を、仕様として取り除く。
  // 貫通(抱え投げの奥義)の通過ダメージは従来どおり倒してよい(上の呼び出し元)
  //
  // スキル「いたわり投げ」(plan/game/archive/run-build-skills.md): 上の保険を
  // 強化し、余らせずに必ずHP1ちょうどまで削る(通常はロール次第でそれより残る)
  const damage = runSkills.includes("gentleThrow")
    ? Math.max(0, hitCurrentHp - 1)
    : Math.max(0, Math.min(rolled.damage, hitCurrentHp - 1));
  if (damage > 0) {
    events.push({ type: "message", text: `${hit.name}に${damage}のダメージ!` });
    damageActor(hit, damage, rolled.critical);
  }

  // 仲間にできるのはモンスターだけ。すでに手一杯なら吸い込まない
  if (hit.kind !== "monster" || hit.speciesId === undefined) {
    dropBarrelNear({ floor, rng, barrel, preferred: landing, events });
    return true;
  }
  if (alliesCount >= MAX_ALLIES) {
    events.push({ type: "message", text: "これ以上は連れて歩けない。" });
    dropBarrelNear({ floor, rng, barrel, preferred: landing, events });
    return true;
  }

  // 「なだめの手つき」で受けた弱らせ(captureBonus)は、この判定で消費する
  const bonus = hit.captureBonus ?? 0;
  hit.captureBonus = 0;
  // 樽なじみの腕輪(plan/protagonist-equipment.md): 捕獲確率+10%
  const charmBonus = hasEquipEffect(playerInventory, "barrelKinship") ? 0.1 : 0;
  // スキル「つれさりの心得」(plan/game/archive/run-build-skills.md): 捕獲確率+15%
  const captureSkillBonus = runSkills.includes("captureMastery") ? CAPTURE_MASTERY_BONUS : 0;
  const captured =
    critForced || rng.chance(Math.min(0.9, captureChance(hit) + bonus + charmBonus + captureSkillBonus));
  if (!captured) {
    // 失敗の演出(plan/game/barrel-capture-clarity.md): 相手がタルを弾く
    // ノックバックと専用SFXのために、弾かれた向き(投げた側)も渡す。
    // 文言は「タルが落ちて拾い直せる」ところまで伝えるが、置き場所が
    // 無くて砕けた場合(dropBarrelNearがfalseを返す)は嘘にならない側を出す
    events.push({
      type: "captureFailed",
      actorId: hit.id,
      name: hit.name,
      from: playerPos,
    });
    const dropped = dropBarrelNear({ floor, rng, barrel, preferred: landing, events });
    events.push({
      type: "message",
      text: t(dropped ? "msg.captureFailed" : "msg.captureFailedBarrelLost", { name: hit.name }),
    });
    return true;
  }

  // 吸い込み成功。モンスターは盤面から消え、タルが中身入りになって落ちる
  hit.alive = false;
  floor.actors = floor.actors.filter((a) => a.id !== hit.id);
  barrel.kind = "caught";
  barrel.speciesId = hit.speciesId;
  events.push({ type: "capture", actorId: hit.id, barrelId: barrel.id, name: hit.name });
  events.push({ type: "message", text: t("msg.captureSuccess", { name: hit.name }) });
  dropBarrelNear({ floor, rng, barrel, preferred: hit.pos, events });
  return true;
}
