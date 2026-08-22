import type { Rng } from "../../core/rng";
import { type Vec2, vec } from "../../core/grid";
import {
  TILE_CORRIDOR,
  TILE_ROOM,
  TILE_WALL,
  type FloorGimmickKind,
  type FloorState,
  type Room,
  type Tile,
  isWalkable,
  roomCenter,
} from "../../core/types";

export interface GenerateOptions {
  depth: number;
  width?: number;
  height?: number;
  /** そのフロアに乗るギミック。plan/floor-gimmicks.md 参照 */
  gimmick?: FloorGimmickKind;
  /** 難易度モード(plan/difficulty-modes.md)による、モンスターハウス出現率の倍率。省略時は1 */
  monsterHouseChanceMultiplier?: number;
  /** ダンジョンごと(plan/multiple-dungeons.md)の、近道屋の出店出現率の倍率。省略時は1 */
  shopChanceMultiplier?: number;
  /** trueなら確率を無視して出店を必ず出す(候補の部屋が無ければ出せない) */
  forceShop?: boolean;
}

const DEFAULT_WIDTH = 48;
const DEFAULT_HEIGHT = 36;

/** 区画の中で部屋の周りに最低これだけ余白を空ける。通路を通す隙間になる */
const SECTION_MARGIN = 1;
const MIN_ROOM_W = 4;
const MIN_ROOM_H = 3;
const MAX_ROOM_W = 11;
const MAX_ROOM_H = 8;

interface Section {
  col: number;
  row: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * ローグライクの定番である区画分割方式でフロアを作る。
 *
 *   1. マップを cols × rows の区画に切る
 *   2. 各区画に余白を残して部屋を置く
 *   3. 隣り合う区画を全域木で結び、さらに数本だけ辺を足して回り道を作る
 *   4. 結んだ辺どおりに通路を掘る
 *   5. フラッドフィルで全部屋・階段への到達可能性を検証し、駄目なら作り直す
 *
 * 5 があるので、この関数が返すフロアは必ず「どの部屋にも歩いて行ける」。
 */
export function generateFloor(rng: Rng, opts: GenerateOptions): FloorState {
  const width = opts.width ?? DEFAULT_WIDTH;
  const height = opts.height ?? DEFAULT_HEIGHT;

  // 検証に落ちたら作り直す。区画分割方式なら普通は一発で通るが、
  // 乱数の巡り合わせで妙な形になる可能性を潰しておく。
  for (let attempt = 0; attempt < 50; attempt++) {
    const floor = tryGenerate(
      rng,
      opts.depth,
      width,
      height,
      opts.gimmick,
      opts.monsterHouseChanceMultiplier ?? 1,
      opts.shopChanceMultiplier ?? 1,
      opts.forceShop ?? false,
    );
    if (floor && validate(floor)) return floor;
  }
  throw new Error(`フロア生成に失敗しました (depth=${opts.depth})`);
}

function tryGenerate(
  rng: Rng,
  depth: number,
  width: number,
  height: number,
  gimmick?: FloorGimmickKind,
  monsterHouseChanceMultiplier = 1,
  shopChanceMultiplier = 1,
  forceShop = false,
): FloorState | null {
  const tiles: Tile[] = new Array(width * height);
  for (let i = 0; i < tiles.length; i++) {
    tiles[i] = { kind: TILE_WALL, roomId: -1, explored: false, visible: false };
  }

  const cols = rng.int(2, 3);
  const rows = rng.int(2, 3);
  const sections = splitSections(width, height, cols, rows);

  const rooms: Room[] = [];
  const sectionRoom = new Map<string, Room>();
  for (const sec of sections) {
    const room = placeRoom(rng, sec, rooms.length);
    if (!room) return null; // 区画が小さすぎた。分割数を変えて再挑戦
    rooms.push(room);
    sectionRoom.set(`${sec.col},${sec.row}`, room);
    paintRoom(tiles, width, room);
  }

  // 区画の隣接グラフを作る
  const edges: Array<[Section, Section]> = [];
  for (const sec of sections) {
    const right = sections.find((s) => s.col === sec.col + 1 && s.row === sec.row);
    if (right) edges.push([sec, right]);
    const below = sections.find((s) => s.col === sec.col && s.row === sec.row + 1);
    if (below) edges.push([sec, below]);
  }

  // 全域木を作って必ず連結にし、そのあと余った辺を少しだけ足して回り道を作る
  const chosen = spanningTree(rng, sections, edges);
  for (const edge of rng.shuffled(edges)) {
    if (chosen.includes(edge)) continue;
    if (rng.chance(0.35)) chosen.push(edge);
  }

  for (const [a, b] of chosen) {
    const roomA = sectionRoom.get(`${a.col},${a.row}`)!;
    const roomB = sectionRoom.get(`${b.col},${b.row}`)!;
    if (a.row === b.row) carveHorizontal(rng, tiles, width, roomA, roomB);
    else carveVertical(rng, tiles, width, roomA, roomB);
  }

  const stairsRoom = chooseStairsRoom(rng, sections, rooms, sectionRoom, chosen, gimmick);
  const stairs = randomTileInRoom(rng, stairsRoom);

  designateMonsterHouse(rng, depth, rooms, stairsRoom, monsterHouseChanceMultiplier);
  designateShop(rng, depth, rooms, stairsRoom, shopChanceMultiplier, forceShop);

  return {
    depth,
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
    gimmick,
    fieldObstacles: [],
    secretPassages: [],
  };
}

function splitSections(width: number, height: number, cols: number, rows: number): Section[] {
  const sections: Section[] = [];
  // 外周1マスは必ず壁として残す
  const usableW = width - 2;
  const usableH = height - 2;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = 1 + Math.floor((usableW * col) / cols);
      const y = 1 + Math.floor((usableH * row) / rows);
      const nextX = 1 + Math.floor((usableW * (col + 1)) / cols);
      const nextY = 1 + Math.floor((usableH * (row + 1)) / rows);
      sections.push({ col, row, x, y, w: nextX - x, h: nextY - y });
    }
  }
  return sections;
}

function placeRoom(rng: Rng, sec: Section, id: number): Room | null {
  const availW = sec.w - SECTION_MARGIN * 2;
  const availH = sec.h - SECTION_MARGIN * 2;
  if (availW < MIN_ROOM_W || availH < MIN_ROOM_H) return null;

  const w = rng.int(MIN_ROOM_W, Math.min(MAX_ROOM_W, availW));
  const h = rng.int(MIN_ROOM_H, Math.min(MAX_ROOM_H, availH));
  const x = sec.x + SECTION_MARGIN + rng.int(0, availW - w);
  const y = sec.y + SECTION_MARGIN + rng.int(0, availH - h);
  return { id, x, y, w, h };
}

function paintRoom(tiles: Tile[], width: number, room: Room): void {
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      const t = tiles[y * width + x]!;
      t.kind = TILE_ROOM;
      t.roomId = room.id;
    }
  }
}

function spanningTree(
  rng: Rng,
  sections: Section[],
  edges: Array<[Section, Section]>,
): Array<[Section, Section]> {
  const key = (s: Section) => `${s.col},${s.row}`;
  const parent = new Map<string, string>();
  for (const s of sections) parent.set(key(s), key(s));

  const find = (k: string): string => {
    let root = k;
    while (parent.get(root) !== root) root = parent.get(root)!;
    // 経路圧縮
    let cur = k;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };

  const tree: Array<[Section, Section]> = [];
  for (const edge of rng.shuffled(edges)) {
    const ra = find(key(edge[0]));
    const rb = find(key(edge[1]));
    if (ra === rb) continue;
    parent.set(ra, rb);
    tree.push(edge);
  }
  return tree;
}

/**
 * 階段を置く部屋を選ぶ。
 *
 * 通常は完全ランダム。「しじまの階」ギミックのときだけ、区画の隣接グラフ
 * (通路として繋がっている辺の数=次数)が最小の区画を優先する。繋がりが
 * 少ない区画ほど素通りしにくく、初期状態では階段が視界に入りにくい
 * 配置になる(plan/floor-gimmicks.md「しじまの階」)。
 */
function chooseStairsRoom(
  rng: Rng,
  sections: Section[],
  rooms: Room[],
  sectionRoom: Map<string, Room>,
  chosen: Array<[Section, Section]>,
  gimmick: FloorGimmickKind | undefined,
): Room {
  if (gimmick !== "silence") return rng.pick(rooms);

  const key = (s: Section) => `${s.col},${s.row}`;
  const degree = new Map<string, number>();
  for (const sec of sections) degree.set(key(sec), 0);
  for (const [a, b] of chosen) {
    degree.set(key(a), (degree.get(key(a)) ?? 0) + 1);
    degree.set(key(b), (degree.get(key(b)) ?? 0) + 1);
  }

  const minDegree = Math.min(...sections.map((sec) => degree.get(key(sec)) ?? 0));
  const candidates = sections
    .filter((sec) => (degree.get(key(sec)) ?? 0) === minDegree)
    .map((sec) => sectionRoom.get(key(sec))!);
  return rng.pick(candidates);
}

/** モンスターハウスの対象になる部屋の最低面積 */
const MIN_MONSTER_HOUSE_AREA = 24;
/** 3階から出現し、深いフロアほど確率が上がる(plan/monster-house.md) */
function monsterHouseChance(depth: number): number {
  if (depth < 3) return 0;
  return Math.min(0.35, 0.08 + (depth - 3) * 0.015);
}

/**
 * 一定確率で、広さのある部屋を1つだけモンスターハウスに指定する。
 * 階段の部屋は安全地帯として除外する。地形(通路)には一切手を入れないので、
 * 退路(既存のフラッドフィル到達可能性)は自動的に保たれる。
 */
function designateMonsterHouse(
  rng: Rng,
  depth: number,
  rooms: Room[],
  stairsRoom: Room,
  chanceMultiplier = 1,
): void {
  if (!rng.chance(monsterHouseChance(depth) * chanceMultiplier)) return;
  const candidates = rooms.filter(
    (room) => room !== stairsRoom && room.w * room.h >= MIN_MONSTER_HOUSE_AREA,
  );
  if (candidates.length === 0) return;
  rng.pick(candidates).kind = "monsterHouse";
}

/** 近道屋の出店の対象になる部屋の最低面積 */
const MIN_SHOP_AREA = 12;
/** 4階から出現する(plan/shops-and-thieves.md) */
function shopChance(depth: number): number {
  if (depth < 4) return 0;
  return 0.2;
}

/**
 * 一定確率で、部屋を1つだけ近道屋の出店に指定する。モンスターハウス・
 * 階段の部屋とは重ねない(すでにどちらかの用途があれば対象から外れる)。
 */
function designateShop(
  rng: Rng,
  depth: number,
  rooms: Room[],
  stairsRoom: Room,
  chanceMultiplier = 1,
  force = false,
): void {
  if (!force && !rng.chance(shopChance(depth) * chanceMultiplier)) return;
  const candidates = rooms.filter(
    (room) => room !== stairsRoom && room.kind === undefined && room.w * room.h >= MIN_SHOP_AREA,
  );
  if (candidates.length === 0) return;
  rng.pick(candidates).kind = "shop";
}

function digCorridor(tiles: Tile[], width: number, p: Vec2): void {
  const t = tiles[p.y * width + p.x];
  if (!t) return;
  if (t.kind === TILE_WALL) {
    t.kind = TILE_CORRIDOR;
    t.roomId = -1;
  }
}

/** 左右に並んだ2部屋を、いったん中間の縦線を経由して繋ぐ */
function carveHorizontal(rng: Rng, tiles: Tile[], width: number, left: Room, right: Room): void {
  const [a, b] = left.x < right.x ? [left, right] : [right, left];
  const ay = rng.int(a.y, a.y + a.h - 1);
  const by = rng.int(b.y, b.y + b.h - 1);
  const startX = a.x + a.w;
  const endX = b.x - 1;
  if (startX > endX) return; // 隙間がない(区画の余白があるので通常起きない)
  const midX = rng.int(startX, endX);

  for (let x = startX; x <= midX; x++) digCorridor(tiles, width, vec(x, ay));
  const [y0, y1] = ay <= by ? [ay, by] : [by, ay];
  for (let y = y0; y <= y1; y++) digCorridor(tiles, width, vec(midX, y));
  for (let x = midX; x <= endX; x++) digCorridor(tiles, width, vec(x, by));
}

/** 上下に並んだ2部屋を、いったん中間の横線を経由して繋ぐ */
function carveVertical(rng: Rng, tiles: Tile[], width: number, top: Room, bottom: Room): void {
  const [a, b] = top.y < bottom.y ? [top, bottom] : [bottom, top];
  const ax = rng.int(a.x, a.x + a.w - 1);
  const bx = rng.int(b.x, b.x + b.w - 1);
  const startY = a.y + a.h;
  const endY = b.y - 1;
  if (startY > endY) return;
  const midY = rng.int(startY, endY);

  for (let y = startY; y <= midY; y++) digCorridor(tiles, width, vec(ax, y));
  const [x0, x1] = ax <= bx ? [ax, bx] : [bx, ax];
  for (let x = x0; x <= x1; x++) digCorridor(tiles, width, vec(x, midY));
  for (let y = midY; y <= endY; y++) digCorridor(tiles, width, vec(bx, y));
}

export function randomTileInRoom(rng: Rng, room: Room): Vec2 {
  return vec(rng.int(room.x, room.x + room.w - 1), rng.int(room.y, room.y + room.h - 1));
}

/**
 * 階段から4方向のフラッドフィルを流し、すべての歩けるタイルに届くことを確かめる。
 * 斜め移動は角抜けを禁じているため、連結性の判定は4方向で行う必要がある。
 */
export function reachableFrom(floor: FloorState, start: Vec2): boolean[] {
  const { width, height, tiles } = floor;
  const seen = new Array<boolean>(width * height).fill(false);
  const startIdx = start.y * width + start.x;
  if (!isWalkable(tiles[startIdx]!.kind)) return seen;

  const queue: number[] = [startIdx];
  seen[startIdx] = true;
  while (queue.length > 0) {
    const idx = queue.pop()!;
    const x = idx % width;
    const y = (idx - x) / width;
    const neighbours = [
      [x, y - 1],
      [x + 1, y],
      [x, y + 1],
      [x - 1, y],
    ] as const;
    for (const [nx, ny] of neighbours) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const nIdx = ny * width + nx;
      if (seen[nIdx]) continue;
      if (!isWalkable(tiles[nIdx]!.kind)) continue;
      seen[nIdx] = true;
      queue.push(nIdx);
    }
  }
  return seen;
}

/** 全部屋の中心と全歩行可能タイルが階段から到達可能であることを確かめる */
export function validate(floor: FloorState): boolean {
  const seen = reachableFrom(floor, floor.stairs);
  for (const room of floor.rooms) {
    const c = roomCenter(room);
    if (!seen[c.y * floor.width + c.x]) return false;
  }
  for (let i = 0; i < floor.tiles.length; i++) {
    if (isWalkable(floor.tiles[i]!.kind) && !seen[i]) return false;
  }
  return true;
}
