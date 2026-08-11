import type { Rng } from "../core/rng";
import { type Dir, type Vec2, dirDelta } from "../core/grid";
import type { GameEvent } from "../core/events";
import {
  type Actor,
  type FloorState,
  type StatusKind,
  actorAt,
  roomOf,
  walkableAt,
} from "../core/types";
import { MAX_SATIETY, type PlayerState } from "../entities/player";

/**
 * アイテム効果を適用するのに必要な最小限の文脈。
 * Game クラスをそのまま渡すと循環参照になるので、必要なものだけを受け取る。
 */
export interface EffectContext {
  rng: Rng;
  floor: FloorState;
  player: PlayerState;
  events: GameEvent[];
}

/** 効果を適用できたか。できなかった場合、杖の使用回数は減らさない */
export function applyEffect(ctx: EffectContext, effect: string, power: number, dir: Dir): boolean {
  switch (effect) {
    case "heal":
      return healPlayer(ctx, power);
    case "power":
      ctx.player.atk += power;
      ctx.events.push({ type: "message", text: `ちからがみなぎってきた! attack+${power}` });
      return true;
    case "eat":
      return eat(ctx, power);
    case "revealMap":
      return revealMap(ctx);
    case "sleepRoom":
      return affectRoom(ctx, "sleep", power, "眠りに落ちた");
    case "confuseRoom":
      return affectRoom(ctx, "confuse", power, "混乱した");
    case "swap":
      return swapPlaces(ctx, dir);
    case "sleepTarget":
      return targetStatus(ctx, dir, "sleep", power, "眠りに落ちた");
    default:
      ctx.events.push({ type: "message", text: "しかし何も起こらなかった。" });
      return false;
  }
}

function healPlayer(ctx: EffectContext, power: number): boolean {
  const { player } = ctx;
  const before = player.hp;
  player.hp = Math.min(player.maxHp, player.hp + power);
  const healed = player.hp - before;
  ctx.events.push({ type: "heal", actorId: player.id, amount: healed, hpAfter: player.hp });
  if (healed > 0) {
    ctx.events.push({ type: "message", text: `HPが${healed}回復した。` });
  } else {
    ctx.events.push({ type: "message", text: "HPは満タンだ。" });
  }
  return true;
}

function eat(ctx: EffectContext, power: number): boolean {
  const { player } = ctx;
  const before = player.satiety;
  player.satiety = Math.min(MAX_SATIETY, player.satiety + power);
  const gained = Math.round(player.satiety - before);
  ctx.events.push({ type: "message", text: `おなかがふくれた。(満腹度 +${gained})` });
  return true;
}

function revealMap(ctx: EffectContext): boolean {
  for (const tile of ctx.floor.tiles) tile.explored = true;
  for (const trap of ctx.floor.traps) trap.revealed = true;
  ctx.events.push({ type: "message", text: "このフロアの地形が頭に入った!" });
  return true;
}

/** プレイヤーと同じ部屋にいるモンスター全員に状態異常を与える */
function affectRoom(
  ctx: EffectContext,
  kind: StatusKind,
  turns: number,
  verb: string,
): boolean {
  const room = roomOf(ctx.floor, ctx.player.pos);
  const targets = ctx.floor.actors.filter((a) => {
    if (!a.alive || a.kind !== "monster") return false;
    if (!room) return Math.max(Math.abs(a.pos.x - ctx.player.pos.x), Math.abs(a.pos.y - ctx.player.pos.y)) <= 1;
    return roomOf(ctx.floor, a.pos) === room;
  });
  if (targets.length === 0) {
    ctx.events.push({ type: "message", text: "しかし誰もいなかった。" });
    return true;
  }
  for (const target of targets) addStatus(ctx, target, kind, turns, verb);
  return true;
}

/** 向いている方向の直線上で、最初に見つかったモンスターを返す */
function firstMonsterInLine(floor: FloorState, from: Vec2, dir: Dir, maxRange = 12): Actor | null {
  const delta = dirDelta(dir);
  let p = { x: from.x + delta.x, y: from.y + delta.y };
  for (let i = 0; i < maxRange; i++) {
    if (!walkableAt(floor, p)) return null;
    const actor = actorAt(floor, p);
    if (actor && actor.kind === "monster") return actor;
    p = { x: p.x + delta.x, y: p.y + delta.y };
  }
  return null;
}

function swapPlaces(ctx: EffectContext, dir: Dir): boolean {
  const target = firstMonsterInLine(ctx.floor, ctx.player.pos, dir);
  if (!target) {
    ctx.events.push({ type: "message", text: "しかし何も起こらなかった。" });
    return false;
  }
  const playerPos = ctx.player.pos;
  ctx.player.pos = target.pos;
  target.pos = playerPos;
  ctx.events.push({ type: "swap", aId: ctx.player.id, bId: target.id });
  ctx.events.push({ type: "message", text: `${target.name}と場所を入れ替えた!` });
  return true;
}

function targetStatus(
  ctx: EffectContext,
  dir: Dir,
  kind: StatusKind,
  turns: number,
  verb: string,
): boolean {
  const target = firstMonsterInLine(ctx.floor, ctx.player.pos, dir);
  if (!target) {
    ctx.events.push({ type: "message", text: "しかし何も起こらなかった。" });
    return false;
  }
  addStatus(ctx, target, kind, turns, verb);
  return true;
}

export function addStatus(
  ctx: EffectContext,
  target: Actor,
  kind: StatusKind,
  turns: number,
  verb: string,
): void {
  const existing = target.statuses.find((s) => s.kind === kind);
  if (existing) existing.turns = Math.max(existing.turns, turns);
  else target.statuses.push({ kind, turns });
  ctx.events.push({ type: "status", actorId: target.id, kind, turns });
  ctx.events.push({ type: "message", text: `${target.name}は${verb}!` });
}
