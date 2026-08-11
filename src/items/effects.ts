import type { Rng } from "../core/rng";
import { ALL_DIRS, type Dir, type Vec2, dirDelta } from "../core/grid";
import type { GameEvent } from "../core/events";
import {
  STATUS_CONFUSE,
  STATUS_FEAR,
  STATUS_INVISIBLE,
  STATUS_POISON,
  STATUS_SLEEP,
  type Actor,
  type FloorState,
  type StatusKind,
  actorAt,
  hasStatus,
  roomOf,
  tileAt,
  walkableAt,
} from "../core/types";
import { buildDistanceField } from "../entities/ai";
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
    case "cureSleepConfuse":
      return cureStatuses(ctx, [STATUS_SLEEP, STATUS_CONFUSE], "すっきりした");
    case "curePoison":
      return cureStatuses(ctx, [STATUS_POISON], "毒が抜けた");
    case "defenseUp":
      ctx.player.def += power;
      ctx.events.push({ type: "message", text: `体が引きしまった! defense+${power}` });
      return true;
    case "senseStairs":
      return senseStairs(ctx);
    case "invisibility":
      addStatus(ctx, ctx.player, STATUS_INVISIBLE, power, "透明になった");
      return true;
    case "fearRoom":
      return affectRoom(ctx, STATUS_FEAR, power, "おびえた");
    case "pull":
      return pullTarget(ctx, dir);
    case "sealTarget":
      return targetStatus(ctx, dir, "seal", power, "封じられた");
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

/**
 * みちしるべの葉。地図の巻物(全地形判明)の下位互換として、階段までの
 * 最短経路だけをたどって「探索済み」にし、階段のまわりも少し照らす。
 */
function senseStairs(ctx: EffectContext): boolean {
  const { floor, player } = ctx;
  const field = buildDistanceField(floor, floor.stairs);
  let here = { ...player.pos };
  if (field[here.y * floor.width + here.x] === -1) {
    ctx.events.push({ type: "message", text: "しかし何も感じなかった。" });
    return true;
  }

  for (let steps = 0; steps < floor.width * floor.height; steps++) {
    const tile = tileAt(floor, here);
    if (tile) tile.explored = true;
    if (here.x === floor.stairs.x && here.y === floor.stairs.y) break;

    let next = here;
    let bestValue = field[here.y * floor.width + here.x]!;
    for (const dir of ALL_DIRS) {
      const delta = dirDelta(dir);
      const candidate = { x: here.x + delta.x, y: here.y + delta.y };
      if (
        candidate.x < 0 ||
        candidate.y < 0 ||
        candidate.x >= floor.width ||
        candidate.y >= floor.height
      ) {
        continue;
      }
      const value = field[candidate.y * floor.width + candidate.x]!;
      if (value >= 0 && value < bestValue) {
        bestValue = value;
        next = candidate;
      }
    }
    if (next.x === here.x && next.y === here.y) break;
    here = next;
  }

  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const tile = tileAt(floor, { x: floor.stairs.x + dx, y: floor.stairs.y + dy });
      if (tile) tile.explored = true;
    }
  }

  ctx.events.push({ type: "message", text: "階段までの道筋がうっすら分かった。" });
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

/** 引き寄せの杖。場所替えの杖の逆方向版で、モンスターを1マスだけ引き寄せる */
function pullTarget(ctx: EffectContext, dir: Dir): boolean {
  const target = firstMonsterInLine(ctx.floor, ctx.player.pos, dir);
  if (!target) {
    ctx.events.push({ type: "message", text: "しかし何も起こらなかった。" });
    return false;
  }
  const delta = dirDelta(dir);
  const from = { ...target.pos };
  const pulled = { x: target.pos.x - delta.x, y: target.pos.y - delta.y };
  if (!walkableAt(ctx.floor, pulled) || actorAt(ctx.floor, pulled)) {
    ctx.events.push({ type: "message", text: "しかし引き寄せられなかった。" });
    return false;
  }
  target.pos = pulled;
  ctx.events.push({ type: "move", actorId: target.id, from, to: pulled });
  ctx.events.push({ type: "message", text: `${target.name}を引き寄せた!` });
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
  if (target.id === ctx.player.id) ctx.events.push({ type: "tutorialTip", id: "status" });
}

/**
 * プレイヤーから指定した状態異常を即座に取り除く(めざめ草・毒消しの実)。
 * 対象の状態でなくても失敗にはしない(草は使えば消費される、という
 * 既存の挙動に合わせる)。
 */
function cureStatuses(ctx: EffectContext, kinds: StatusKind[], verb: string): boolean {
  const player = ctx.player;
  const hadAny = kinds.some((kind) => hasStatus(player, kind));
  for (const kind of kinds) {
    if (!hasStatus(player, kind)) continue;
    player.statuses = player.statuses.filter((s) => s.kind !== kind);
    ctx.events.push({ type: "statusEnd", actorId: player.id, kind });
  }
  ctx.events.push({
    type: "message",
    text: hadAny ? `${verb}!` : "しかし何ともなかった。",
  });
  return true;
}
