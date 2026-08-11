import type { Vec2 } from "../core/grid";
import { type FloorState, roomOf, tileAt } from "../core/types";

/** 「くらやみの階」ギミック中、部屋にいても viewer からこの距離までしか見えない */
const DARKNESS_RADIUS = 2;

/**
 * 不思議のダンジョン系の視界規則。
 *
 *  - 部屋にいるときは、その部屋全体と部屋を囲む外周1マス(壁と出入口)が見える
 *  - 通路にいるときは、周囲8マスだけが見える
 *  - 一度見えたタイルは「探索済み」として記憶され、見えなくなっても地形は表示される
 *
 * 明かりの届かない通路を手探りで進む緊張感がこのジャンルの肝なので、
 * 視線計算(レイキャスト)ではなくこの部屋単位の規則をそのまま採用する。
 * 「くらやみの階」ギミック(plan/floor-gimmicks.md)が乗っている間は、
 * 部屋にいても全体は見えず、viewer 周辺だけに絞る。
 */
export function updateVisibility(floor: FloorState, viewer: Vec2): void {
  for (const tile of floor.tiles) tile.visible = false;

  const room = roomOf(floor, viewer);
  if (room && floor.gimmick === "darkness") {
    for (let dy = -DARKNESS_RADIUS; dy <= DARKNESS_RADIUS; dy++) {
      for (let dx = -DARKNESS_RADIUS; dx <= DARKNESS_RADIUS; dx++) {
        reveal(floor, viewer.x + dx, viewer.y + dy);
      }
    }
  } else if (room) {
    // 外周1マスまで含めるので、部屋から出ている通路の1マス目もここで見える
    for (let y = room.y - 1; y <= room.y + room.h; y++) {
      for (let x = room.x - 1; x <= room.x + room.w; x++) {
        reveal(floor, x, y);
      }
    }
  } else {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        reveal(floor, viewer.x + dx, viewer.y + dy);
      }
    }
  }
}

function reveal(floor: FloorState, x: number, y: number): void {
  const tile = tileAt(floor, { x, y });
  if (!tile) return;
  tile.visible = true;
  tile.explored = true;
}

/** そのマスが今見えているか(モンスターやアイテムを描くかの判定に使う) */
export function isVisible(floor: FloorState, p: Vec2): boolean {
  return tileAt(floor, p)?.visible ?? false;
}

/**
 * from にいる者から to が見えるか。
 * 同じ部屋にいるか、隣接していれば気づく。モンスターの索敵に使う。
 */
export function canSee(floor: FloorState, from: Vec2, to: Vec2): boolean {
  if (Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y)) <= 1) return true;
  const roomA = roomOf(floor, from);
  return roomA !== undefined && roomA === roomOf(floor, to);
}
