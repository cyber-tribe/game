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
export function updateVisibility(floor: FloorState, viewer: Vec2, extraRange = 0): void {
  for (const tile of floor.tiles) tile.visible = false;

  const room = roomOf(floor, viewer);
  if (room && floor.gimmick === "darkness") {
    const radius = DARKNESS_RADIUS + extraRange;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        reveal(floor, viewer.x + dx, viewer.y + dy);
      }
    }
  } else if (room) {
    // 外周1マス(+見晴らしのはちまきぶん)まで含めるので、部屋から出ている通路の
    // 1マス目もここで見える
    const margin = 1 + extraRange;
    for (let y = room.y - margin; y <= room.y + room.h - 1 + margin; y++) {
      for (let x = room.x - margin; x <= room.x + room.w - 1 + margin; x++) {
        reveal(floor, x, y);
      }
    }
  } else {
    const radius = 1 + extraRange;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
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
