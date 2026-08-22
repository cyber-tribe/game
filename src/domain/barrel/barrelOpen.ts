import { chebyshev, dirFromDelta } from "../../core/grid";
import type { Dir, Vec2 } from "../../core/grid";
import type { Actor, FloorState } from "../../core/types";
import { TILE_WALL, actorAt, barrelAt, tileAt, walkableAt } from "../../core/types";
import type { GameEvent } from "../../core/events";
import type { EffectContext } from "../item/effects";
import { addStatus } from "../item/effects";
import { STATUS_SLEEP } from "../../core/types";

/** あける(周囲を水びたしにする)の範囲(半径、マス)。強化版は+1 */
export const WATER_BARREL_OPEN_RADIUS = 1;
/** あける(周囲1マスの敵に眠りをばらまく)の持続ターン */
export const SLEEP_BARREL_OPEN_TURNS = 3;
/** あける(部屋全体を明るくする)の視界拡張・持続ターン。強化版は視界+1 */
export const LIGHT_BARREL_OPEN_TURNS = 5;

/** 水タルをあける: 周囲を水びたしの床(深みタイルと同じ扱い)にする */
export function openWaterBarrel(
  floor: FloorState,
  center: Vec2,
  enhanced: boolean,
  events: GameEvent[],
): void {
  const radius = enhanced ? WATER_BARREL_OPEN_RADIUS + 1 : WATER_BARREL_OPEN_RADIUS;
  for (let y = center.y - radius; y <= center.y + radius; y++) {
    for (let x = center.x - radius; x <= center.x + radius; x++) {
      const tile = tileAt(floor, { x, y });
      if (tile && walkableAt(floor, { x, y })) tile.quagmire = true;
    }
  }
  events.push({ type: "message", text: "周囲が水びたしになった。" });
}

export interface OpenWindBarrelArgs {
  floor: FloorState;
  center: Vec2;
  events: GameEvent[];
  pushMonster(dir: Dir, target: Actor, events: GameEvent[]): boolean;
}

/** 風タルをあける: 隣接する敵全員を1マス押し出す */
export function openWindBarrel(args: OpenWindBarrelArgs): void {
  const { floor, center, events, pushMonster } = args;
  for (const other of floor.actors) {
    if (!other.alive || other.kind !== "monster") continue;
    if (chebyshev(center, other.pos) !== 1) continue;
    const dir = dirFromDelta(other.pos.x - center.x, other.pos.y - center.y);
    pushMonster(dir, other, events);
  }
}

/** 石タルをあける: 正面(足元)に岩の壁を1マス作る(壊せる仕掛けは今回実装せず、恒久の壁とする) */
export function openStoneBarrel(floor: FloorState, front: Vec2, events: GameEvent[]): void {
  const tile = tileAt(floor, front);
  if (!tile || tile.kind === TILE_WALL || actorAt(floor, front) || barrelAt(floor, front)) {
    events.push({ type: "message", text: "しかし、壁を作る場所がなかった。" });
    return;
  }
  tile.kind = TILE_WALL;
  events.push({ type: "message", text: "岩の壁ができた!" });
}

export interface OpenSleepBarrelArgs {
  floor: FloorState;
  center: Vec2;
  enhanced: boolean;
  effectCtx: EffectContext;
}

/** ねむタルをあける: 周囲1マスの敵に眠りをばらまく */
export function openSleepBarrel(args: OpenSleepBarrelArgs): void {
  const { floor, center, enhanced, effectCtx } = args;
  const turns = enhanced ? SLEEP_BARREL_OPEN_TURNS + 1 : SLEEP_BARREL_OPEN_TURNS;
  for (const other of floor.actors) {
    if (!other.alive || other.kind !== "monster") continue;
    if (chebyshev(center, other.pos) > 1) continue;
    addStatus(effectCtx, other, STATUS_SLEEP, turns, "眠ってしまった");
  }
}
