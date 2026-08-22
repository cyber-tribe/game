import type { Actor, FloorState, StatusKind } from "../../core/types";
import {
  STATUS_CONFUSE,
  STATUS_FEAR,
  STATUS_FLINCH,
  STATUS_INVISIBLE,
  STATUS_POISON,
  STATUS_RECOVER,
  STATUS_ROOT,
  STATUS_SEAL,
  STATUS_SLEEP,
  hasStatus,
} from "../../core/types";
import type { GameEvent } from "../../core/events";
import type { PlayerState } from "../../entities/player";
import { SATIETY_RATE_MULTIPLIER, type DifficultyMode } from "../../entities/difficulty";
import { speciesById } from "../../entities/species";
import { hasSkill } from "../../entities/skills";
import { hasEquipEffect } from "../item/inventory";

/** 毒が1ターンごとに削るHP */
const POISON_DAMAGE_PER_TURN = 2;
/** 満腹度が1ターンごとに減る量 */
const SATIETY_PER_TURN = 0.2;
/** 自然回復・仲間の自然回復の間隔(ターン) */
export const REGEN_INTERVAL = 8;
/** regenIfUnhit(うるみぐま)・特技「しずけさのいやし」が回復させるHP */
const REGEN_IF_UNHIT_AMOUNT = 2;

/** 状態異常が明けたときにプレイヤーへ表示するメッセージ */
const STATUS_END_MESSAGES: Record<StatusKind, string> = {
  [STATUS_SLEEP]: "目が覚めた。",
  [STATUS_CONFUSE]: "混乱がおさまった。",
  [STATUS_SEAL]: "封じが解けた。",
  [STATUS_RECOVER]: "体勢を立て直した。",
  [STATUS_POISON]: "毒が抜けた。",
  [STATUS_INVISIBLE]: "透明が解けた。",
  [STATUS_FEAR]: "おびえがおさまった。",
  // ゆめわざ(plan/game/archive/companion-leveling-and-arts.md)。この2つは
  // 常にモンスター側にしか乗らないため、実際に読まれることはない想定だが、
  // Record<StatusKind, string>の網羅性のために埋めておく
  [STATUS_ROOT]: "うごけるようになった。",
  [STATUS_FLINCH]: "怯みがおさまった。",
};

export interface TickStatusesArgs {
  floor: FloorState;
  events: GameEvent[];
  damageActor(target: Actor, damage: number, critical: boolean): void;
  isPlaying(): boolean;
}

/** 毒はターン経過でじわじわHPを削り、すべての状態異常の残りターンを1減らす */
export function tickStatuses(args: TickStatusesArgs): void {
  const { floor, events, damageActor, isPlaying } = args;

  for (const actor of floor.actors) {
    if (!actor.alive || !hasStatus(actor, STATUS_POISON)) continue;
    damageActor(actor, POISON_DAMAGE_PER_TURN, false);
    if (!isPlaying()) return;
  }

  for (const actor of floor.actors) {
    if (!actor.alive) continue;
    for (const status of actor.statuses) {
      if (status.turns <= 0) continue;
      status.turns--;
      if (status.turns === 0) {
        events.push({ type: "statusEnd", actorId: actor.id, kind: status.kind });
        if (actor.kind === "player") {
          events.push({ type: "message", text: STATUS_END_MESSAGES[status.kind] });
        }
      }
    }
    actor.statuses = actor.statuses.filter((s) => s.turns > 0);
  }
}

export interface TickHungerArgs {
  player: PlayerState;
  floor: FloorState;
  dungeonSatietyDrainMul: number | undefined;
  difficulty: DifficultyMode;
  turnCount: number;
  events: GameEvent[];
  isPlaying(): boolean;
  damageActor(target: Actor, damage: number, critical: boolean): void;
}

/** 満腹度を減らし、空腹なら被ダメージ、満腹なら間隔ごとの自然回復を行う */
export function tickHunger(args: TickHungerArgs): void {
  const { player, floor, dungeonSatietyDrainMul, difficulty, turnCount, events, isPlaying, damageActor } = args;
  // 毒などですでにこのターン力尽きていれば、満腹度の処理は行わない
  if (!isPlaying()) return;
  const before = player.satiety;
  const feastMultiplier = floor.gimmick === "feast" ? 0.5 : 1;
  // 満たされ石(plan/protagonist-equipment.md): 満腹度の減りが2割ゆるやかになる
  const charmMultiplier = hasEquipEffect(player.inventory, "satietyEase") ? 0.8 : 1;
  // 忘れ物蔵(plan/lost-and-found-vault.md): 満腹度の減りがやや早い(長居できない蔵)
  const dungeonMultiplier = dungeonSatietyDrainMul ?? 1;
  const rate = SATIETY_PER_TURN * feastMultiplier * charmMultiplier * dungeonMultiplier * SATIETY_RATE_MULTIPLIER[difficulty];
  player.satiety = Math.max(0, player.satiety - rate);

  if (before > 20 && player.satiety <= 20) {
    events.push({ type: "hungerWarning", level: "low" });
    events.push({ type: "message", text: "おなかがへってきた……" });
    events.push({ type: "tutorialTip", id: "hunger" });
  }
  if (before > 0 && player.satiety === 0) {
    events.push({ type: "hungerWarning", level: "empty" });
    events.push({ type: "message", text: "おなかがすいて目がまわる!" });
  }

  if (player.satiety <= 0) {
    damageActor(player, 1, false);
  } else if (turnCount % REGEN_INTERVAL === 0 && player.hp < player.maxHp) {
    player.hp = Math.min(player.maxHp, player.hp + 1);
  }
}

export interface TickRegenArgs {
  floor: FloorState;
  turnCount: number;
  hitThisTurn: Set<number>;
}

/**
 * regenIfUnhit(うるみぐま)・特技「しずけさのいやし」(slowMend、
 * plan/monster-compendium.md): このターン被弾しなかった対象を少しだけ回復する。
 * さらに仲間全員は、プレイヤーと同じ間隔・同じ量で自然回復する
 * (plan/ally-natural-regen.md)。仲間には満腹度が無いので、プレイヤーの
 * ような「空腹で回復停止」の条件は付けない。敵モンスターは従来どおり
 * regenIfUnhit種のみ
 */
export function tickRegen(args: TickRegenArgs): void {
  const { floor, turnCount, hitThisTurn } = args;
  for (const actor of floor.actors) {
    if (!actor.alive || actor.kind === "player" || actor.kind === "target") continue;
    // 仲間の自然回復はプレイヤーの回復と同じ扱いなので、被弾した
    // ターンでも止まらない(unhit条件が付くのは特性・特技の側だけ)
    if (actor.kind === "ally" && turnCount % REGEN_INTERVAL === 0 && actor.hp < actor.maxHp) {
      actor.hp = Math.min(actor.maxHp, actor.hp + 1);
    }
    if (hitThisTurn.has(actor.id)) continue;
    if (actor.hp >= actor.maxHp) continue;
    const nativeRegen = actor.speciesId !== undefined && speciesById(actor.speciesId).regenIfUnhit === true;
    const skillRegen = actor.kind === "ally" && hasSkill(actor, "slowMend");
    if (!nativeRegen && !skillRegen) continue;
    actor.hp = Math.min(actor.maxHp, actor.hp + REGEN_IF_UNHIT_AMOUNT);
  }
}

/** 松明(plan/region-darkness.md)。残りターンを減らし、切れた瞬間だけ知らせる。新しい残りターン数を返す */
export function tickTorch(torchTurnsLeft: number, events: GameEvent[]): number {
  if (torchTurnsLeft <= 0) return torchTurnsLeft;
  const next = torchTurnsLeft - 1;
  if (next === 0) {
    events.push({ type: "message", text: "松明の火が消えた。" });
  }
  return next;
}

/**
 * 技のクールダウンを1ターンぶん減らす。「樽受け身」は発動から1ターンだけ
 * 有効な予約なので、被弾で消費されなければここで期限切れにする。
 */
export function tickArtCooldowns(player: PlayerState): void {
  for (const id of Object.keys(player.artCooldowns) as (keyof typeof player.artCooldowns)[]) {
    if (player.artCooldowns[id] > 0) player.artCooldowns[id]--;
  }
  player.ukemiReady = false;
}
