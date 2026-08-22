import type { Vec2 } from "../../src/core/grid";
import {
  type BarrelKind,
  type FieldSkillId,
  type FloorGimmickKind,
  type FloorState,
  type Room,
  type Tile,
  type TrapKind,
  TILE_CORRIDOR,
  TILE_ROOM,
  TILE_WALL,
} from "../../src/core/types";
import { createBarrel, createItem, createMonster } from "../../src/domain/dungeon/populate";
import { speciesById } from "../../src/entities/species";

/**
 * 箱庭ダンジョン(plan/game/test-dungeon-harness.md)のASCIIマップ記号が
 * 意味するものの一覧。1文字につき1エントリ、`FloorState`の対応する配列に
 * 変換される。既定の記号(`#` `.` `>` `@`)は指定不要
 */
export type LegendEntry =
  | { actor: string; hp?: number }
  | { barrel: BarrelKind; speciesId?: string }
  | { item: string; charges?: number }
  | { trap: TrapKind; revealed?: boolean }
  | { gold: number }
  | { obstacle: FieldSkillId };

export interface BuildTestFloorOptions {
  legend?: Record<string, LegendEntry>;
  /** 省略時は連結した床の矩形領域を自動検出する。視界処理の部屋依存ロジックを試すときだけ明示指定する */
  rooms?: Room[];
  gimmick?: FloorGimmickKind;
  /** 省略時は1 */
  depth?: number;
}

export interface BuiltTestFloor {
  floor: FloorState;
  /** 記号からその最初の出現マスを引く。アサーションで座標をハードコードしないために使う */
  at: (symbol: string) => Vec2;
}

const DEFAULT_WALKABLE = new Set([".", ">", "@"]);

/** テンプレートリテラルの共通インデントと前後の空行を取り除き、記号の2次元配列にする */
function parseRows(asciiMap: string): string[] {
  const rawLines = asciiMap.split("\n");
  while (rawLines.length > 0 && rawLines[0]!.trim() === "") rawLines.shift();
  while (rawLines.length > 0 && rawLines[rawLines.length - 1]!.trim() === "") rawLines.pop();
  if (rawLines.length === 0) throw new Error("buildTestFloor: 空のASCIIマップ");

  const indent = Math.min(
    ...rawLines.filter((line) => line.trim() !== "").map((line) => line.length - line.trimStart().length),
  );
  const rows = rawLines.map((line) => line.slice(indent).trimEnd());

  const width = rows[0]!.length;
  rows.forEach((row, y) => {
    if (row.length !== width) {
      throw new Error(`buildTestFloor: ${y}行目の幅が揃っていない("${row}" は${row.length}文字、期待は${width}文字)`);
    }
  });
  return rows;
}

/**
 * ASCIIマップから`FloorState`を宣言的に組み立てる
 * (plan/game/test-dungeon-harness.md の2番目の変更内容)。乱数を一切使わない
 */
export function buildTestFloor(asciiMap: string, opts: BuildTestFloorOptions = {}): BuiltTestFloor {
  const legend = opts.legend ?? {};
  const rows = parseRows(asciiMap);
  const height = rows.length;
  const width = rows[0]!.length;

  for (const symbol of Object.keys(legend)) {
    if (DEFAULT_WALKABLE.has(symbol) || symbol === "#") {
      throw new Error(`buildTestFloor: legendの記号 "${symbol}" は既定の記号と衝突している`);
    }
  }

  const isWalkableSymbol = (c: string): boolean => DEFAULT_WALKABLE.has(c) || c in legend;

  let playerStart: Vec2 | undefined;
  let stairs: Vec2 | undefined;
  const positions = new Map<string, Vec2>();

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = rows[y]![x]!;
      if (c === "#") continue;
      if (!isWalkableSymbol(c)) {
        throw new Error(`buildTestFloor: 未知の記号 "${c}" (${x},${y})。legendに追加するか既定の記号を使う`);
      }
      if (!positions.has(c)) positions.set(c, { x, y });
      if (c === "@") {
        if (playerStart) throw new Error('buildTestFloor: "@"(プレイヤー初期位置)が複数ある');
        playerStart = { x, y };
      }
      if (c === ">") {
        if (stairs) throw new Error('buildTestFloor: ">"(階段)が複数ある');
        stairs = { x, y };
      }
    }
  }
  if (!playerStart) throw new Error('buildTestFloor: "@"(プレイヤー初期位置)が無い');
  if (!stairs) throw new Error('buildTestFloor: ">"(階段)が無い');

  const tiles: Tile[] = Array.from({ length: width * height }, () => ({
    kind: TILE_WALL,
    roomId: -1,
    explored: true,
    visible: true,
  }));
  const tileAt = (p: Vec2): Tile => tiles[p.y * width + p.x]!;

  const rooms: Room[] = opts.rooms ?? detectRooms(rows, width, height, isWalkableSymbol);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isWalkableSymbol(rows[y]![x]!)) continue;
      const room = rooms.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
      const t = tileAt({ x, y });
      t.kind = room ? TILE_ROOM : TILE_CORRIDOR;
      t.roomId = room ? room.id : -1;
    }
  }

  const floor: FloorState = {
    depth: opts.depth ?? 1,
    width,
    height,
    tiles,
    rooms,
    stairs,
    actors: [],
    items: [],
    traps: [],
    barrels: [],
    goldPiles: [],
    fieldObstacles: [],
    secretPassages: [],
    gimmick: opts.gimmick,
  };

  let nextActorId = 1;
  let nextItemUid = 1;
  let nextBarrelId = 1;
  let nextGoldId = 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = rows[y]![x]!;
      const entry = legend[c];
      if (!entry) continue;
      const pos = { x, y };

      if ("actor" in entry) {
        const monster = createMonster(nextActorId++, speciesById(entry.actor), pos);
        if (entry.hp !== undefined) monster.hp = entry.hp;
        floor.actors.push(monster);
      } else if ("barrel" in entry) {
        floor.barrels.push(createBarrel(nextBarrelId++, entry.barrel, pos, entry.speciesId));
      } else if ("item" in entry) {
        floor.items.push({ item: createItem(nextItemUid++, entry.item, entry.charges), pos });
      } else if ("trap" in entry) {
        floor.traps.push({ pos, kind: entry.trap, revealed: entry.revealed ?? false });
      } else if ("gold" in entry) {
        floor.goldPiles.push({ id: nextGoldId++, pos, amount: entry.gold });
      } else {
        floor.fieldObstacles.push({ pos, requires: entry.obstacle, opened: false });
      }
    }
  }

  const at = (symbol: string): Vec2 => {
    const p = positions.get(symbol);
    if (!p) throw new Error(`buildTestFloor: at("${symbol}") はマップ上に見つからない`);
    return p;
  };

  return { floor, at };
}

/**
 * 連結した床の矩形領域を部屋として自動検出する。4方向で連結した床の
 * 集合(壁と`@`/`>`/legend記号も含む「歩けるマス」全部が対象)のうち、
 * 外接矩形が完全に歩けるマスで埋まっているものだけを部屋とみなす
 * (埋まっていなければ、通路など非矩形の形なので部屋にしない)
 */
function detectRooms(
  rows: string[],
  width: number,
  height: number,
  isWalkableSymbol: (c: string) => boolean,
): Room[] {
  const walkable = (x: number, y: number) => isWalkableSymbol(rows[y]![x]!);
  const assigned = new Array(width * height).fill(false) as boolean[];

  // 「まだ部屋に属していない歩けるマス」から、縦横とも2マス以上ある
  // 最大の矩形を1つ切り出す→部屋として確定→残りから同じことを繰り返す。
  // 最後まで残った(細い通路だけの)マスは部屋を持たない(roomId=-1)
  const rooms: Room[] = [];
  for (;;) {
    const best = largestUnassignedRect(width, height, walkable, assigned);
    if (!best || best.w < 2 || best.h < 2) break;
    rooms.push({ id: rooms.length, x: best.x, y: best.y, w: best.w, h: best.h });
    for (let ry = best.y; ry < best.y + best.h; ry++) {
      for (let rx = best.x; rx < best.x + best.w; rx++) {
        assigned[ry * width + rx] = true;
      }
    }
  }
  return rooms;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  area: number;
}

/** まだ部屋に属していない歩けるマスの中から、面積最大の矩形を1つ探す */
function largestUnassignedRect(
  width: number,
  height: number,
  walkable: (x: number, y: number) => boolean,
  assigned: readonly boolean[],
): Rect | null {
  const heights = new Array(width).fill(0) as number[];
  let best: Rect | null = null;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const free = walkable(x, y) && !assigned[y * width + x];
      heights[x] = free ? heights[x]! + 1 : 0;
    }
    const rowBest = maxRectInHistogram(heights, y, width);
    if (rowBest && (!best || rowBest.area > best.area)) best = rowBest;
  }
  return best;
}

/** 1行分のヒストグラム(各列の連続高さ)の中で最大の矩形を求める定番アルゴリズム */
function maxRectInHistogram(heights: readonly number[], bottomY: number, width: number): Rect | null {
  const stack: number[] = [];
  let best: Rect | null = null;
  for (let i = 0; i <= width; i++) {
    const h = i < width ? heights[i]! : 0;
    while (stack.length > 0 && heights[stack[stack.length - 1]!]! >= h) {
      const top = stack.pop()!;
      const barHeight = heights[top]!;
      const left = stack.length === 0 ? 0 : stack[stack.length - 1]! + 1;
      const w = i - left;
      const area = barHeight * w;
      if (barHeight > 0 && (!best || area > best.area)) {
        best = { x: left, y: bottomY - barHeight + 1, w, h: barHeight, area };
      }
    }
    stack.push(i);
  }
  return best;
}
