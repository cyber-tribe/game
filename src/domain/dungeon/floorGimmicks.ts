import { type Dir, dirDelta } from "../../core/grid";
import type { Vec2 } from "../../core/grid";
import type { Actor, CombatantActor, FloorState, StatusKind, Tile } from "../../core/types";
import {
  STATUS_SLEEP,
  TILE_CORRIDOR,
  TILE_WALL,
  actorAt,
  barrelAt,
  isFree,
  roomContains,
  tileAt,
} from "../../core/types";
import type { GameEvent } from "../../core/events";
import type { Rng } from "../../core/rng";
import type { PlayerState } from "../../entities/player";
import { addStatus, type EffectContext } from "../item/effects";
import { SPORE_SLEEP_CHANCE, SPORE_SLEEP_TURNS } from "./bossMoves";

/** 胞子部屋(plan/spore-grove.md)。在室者が居続けたターン数がこれに達するとパルスが起きる */
const SPORE_PULSE_INTERVAL = 8;

/**
 * 部屋の在室者全員(敵味方問わず)に状態異常を判定する。plan/spore-grove.md の
 * 胞子部屋パルス、plan/region-boss-oomadoromi.md の大技(aoeSleep)、
 * plan/region-boss-honezuka.md の大技(aoeSeal)で共有する
 */
export function applyRoomWideStatus(
  ctx: EffectContext,
  occupants: readonly Actor[],
  kind: StatusKind,
  chance: number,
  turns: number,
  verb: string,
): void {
  for (const actor of occupants) {
    if (!actor.alive || !ctx.rng.chance(chance)) continue;
    addStatus(ctx, actor, kind, turns, verb);
  }
}

/**
 * 第三地方(まどろみの茸林)固有ギミック(plan/spore-grove.md): 胞子部屋に
 * 誰か(敵味方問わず)が居続けると、8ターンごとに部屋全体へ睡眠を判定する。
 * 誰もいないターンはカウントしない
 */
export function tickSporeRooms(floor: FloorState, rng: Rng, player: PlayerState, events: GameEvent[]): void {
  for (const room of floor.rooms) {
    if (!room.spored) continue;
    const occupants = floor.actors.filter((a) => a.alive && roomContains(room, a.pos));
    if (occupants.length === 0) continue;
    room.sporeTimer = (room.sporeTimer ?? 0) + 1;
    if (room.sporeTimer < SPORE_PULSE_INTERVAL) continue;
    room.sporeTimer = 0;
    events.push({ type: "message", text: "むわっと、胞子が満ちた……" });
    applyRoomWideStatus(
      { rng, floor, player, events },
      occupants,
      STATUS_SLEEP,
      SPORE_SLEEP_CHANCE,
      SPORE_SLEEP_TURNS,
      "眠ってしまった",
    );
  }
}

/**
 * 地方ボス(plan/region-boss-fuchinonushi.md): 大技(summonTorrent)で一時的に
 * 設置した奔流タイルを、毎ターンexpiresInぶん減らし、0になったら元に戻す
 */
export function tickSummonedTorrentTiles(floor: FloorState): void {
  for (const actor of floor.actors) {
    if (actor.kind !== "monster" && actor.kind !== "ally") continue;
    if (!actor.summonedTorrentTiles || actor.summonedTorrentTiles.length === 0) continue;
    const remaining: { pos: Vec2; expiresIn: number }[] = [];
    for (const entry of actor.summonedTorrentTiles) {
      entry.expiresIn--;
      if (entry.expiresIn <= 0) {
        const tile = tileAt(floor, entry.pos);
        if (tile) tile.torrent = undefined;
      } else {
        remaining.push(entry);
      }
    }
    actor.summonedTorrentTiles = remaining;
  }
}

/**
 * ぬしのゆめわざ「ホネのとりで」(plan/game/archive/boss-dream-arts.md)で
 * 一時的に壁化したタイルを、毎ターンexpiresInぶん減らし、0になったら
 * 元のTileKindに戻す。tickSummonedTorrentTilesと同じ形
 */
export function tickBoneWalls(floor: FloorState): void {
  for (const actor of floor.actors) {
    if (actor.kind !== "monster" && actor.kind !== "ally") continue;
    if (!actor.boneWallTiles || actor.boneWallTiles.length === 0) continue;
    const remaining: { pos: Vec2; expiresIn: number; originalKind: Tile["kind"] }[] = [];
    for (const entry of actor.boneWallTiles) {
      entry.expiresIn--;
      if (entry.expiresIn <= 0) {
        const tile = tileAt(floor, entry.pos);
        if (tile) tile.kind = entry.originalKind;
      } else {
        remaining.push(entry);
      }
    }
    actor.boneWallTiles = remaining;
  }
}

/**
 * 地方ボス(plan/region-boss-misemonononushi.md): 幻影を呼び出してから
 * 一定ターン(既定5)経過しても本体を当てられない場合、幻影が自然に消えて
 * 通常状態へ戻る(膠着状態を防ぐ安全弁)
 */
export function tickMirrors(floor: FloorState, events: GameEvent[]): void {
  for (const actor of floor.actors) {
    if (actor.kind !== "monster") continue;
    if (actor.mirrorTurnsLeft === undefined) continue;
    actor.mirrorTurnsLeft--;
    if (actor.mirrorTurnsLeft > 0) continue;
    actor.mirrorTurnsLeft = undefined;
    const hadMirrors = floor.actors.some((a) => a.kind === "monster" && a.mirrorOf === actor.id);
    floor.actors = floor.actors.filter((a) => a.kind !== "monster" || a.mirrorOf !== actor.id);
    if (hadMirrors) events.push({ type: "message", text: "幻影が薄れて消えていった……" });
  }
}

/**
 * 隣接する歩行可能マスを、上下左右→斜めの順で最初に見つかったものを返す。
 * actor-overlap-failsafe(plan/actor-overlap-failsafe.md)・
 * barrel-stairs-safeguard(plan/barrel-stairs-safeguard.md)で使う
 */
const ADJACENT_ESCAPE_DIRS: readonly Dir[] = [0, 2, 4, 6, 1, 3, 5, 7];

export function adjacentFreeSpot(floor: FloorState, center: Vec2): Vec2 | null {
  for (const dir of ADJACENT_ESCAPE_DIRS) {
    const delta = dirDelta(dir);
    const p = { x: center.x + delta.x, y: center.y + delta.y };
    if (isFree(floor, p)) return p;
  }
  return null;
}

/**
 * ぬしのゆめわざ「ホネのとりで」。指定マスを一時的に壁化する。既に壁・
 * アクター・タルがあるマスには置けない(actorのboneWallTilesに記録し、
 * tickBoneWallsが元に戻す)
 */
export function placeTemporaryWall(floor: FloorState, actor: CombatantActor, pos: Vec2, turns: number): boolean {
  const tile = tileAt(floor, pos);
  if (!tile || tile.kind === TILE_WALL) return false;
  if (actorAt(floor, pos) || barrelAt(floor, pos)) return false;
  actor.boneWallTiles ??= [];
  actor.boneWallTiles.push({ pos: { ...pos }, expiresIn: turns, originalKind: tile.kind });
  tile.kind = TILE_WALL;
  return true;
}

/**
 * ぬしのゆめわざ「つらぬき掘り」。壁タイルを通路に変える。
 * plan/lost-and-found-vault.mdの隠し通路が崩れる処理と同じ形
 */
export function digWall(floor: FloorState, pos: Vec2): void {
  const tile = tileAt(floor, pos);
  if (tile) tile.kind = TILE_CORRIDOR;
}
