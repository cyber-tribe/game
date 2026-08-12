import type { FloorState, Room } from "../../src/core/types";

/**
 * 中身のないフロアを組み立てる。地方ボステスト等で個別に手書きされていた
 * `FloorState` の骨組み(部屋・在庫系フィールドはすべて空)を集約した。
 *
 * 呼び出し側の型チェックをすり抜けるため、元の各ファイルの実装もタイルの
 * `kind` に `TileKind`(0|1|2)ではなく `"floor"` という文字列を使うなど、
 * 実際の `FloorState` とは厳密には一致しない形を `as unknown as FloorState`
 * でキャストして使っていた。挙動を変えないため、その形をそのまま踏襲する。
 */
export function makeEmptyFloor(opts: {
  depth: number;
  width?: number;
  height?: number;
  rooms?: Room[];
  /** 元の各ファイルの実装は "floor" という文字列や TILE_ROOM(1) など様々だった */
  tileKind?: unknown;
  /** 指定したファイルだけ、タイルに roomId を持たせていた */
  roomId?: number;
}): FloorState {
  const width = opts.width ?? 12;
  const height = opts.height ?? 12;
  const tileKind = opts.tileKind ?? "floor";
  return {
    depth: opts.depth,
    width,
    height,
    rooms: opts.rooms ?? [],
    stairs: { x: 0, y: 0 },
    actors: [],
    items: [],
    traps: [],
    barrels: [],
    goldPiles: [],
    fieldObstacles: [],
    secretPassages: [],
    tiles: Array.from({ length: width * height }, () => ({
      kind: tileKind,
      explored: true,
      visible: true,
      ...(opts.roomId !== undefined ? { roomId: opts.roomId } : {}),
    })),
  } as unknown as FloorState;
}
