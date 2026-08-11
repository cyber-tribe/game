import type { Dir, Vec2 } from "./grid";

export const TILE_WALL = 0;
export const TILE_ROOM = 1;
export const TILE_CORRIDOR = 2;
export type TileKind = typeof TILE_WALL | typeof TILE_ROOM | typeof TILE_CORRIDOR;

export interface Tile {
  kind: TileKind;
  /** 部屋タイルなら所属する部屋の番号。通路と壁は -1 */
  roomId: number;
  /** 一度でも見えたか。見えなくなっても地形は記憶され、暗く描かれる */
  explored: boolean;
  /** 今この瞬間に見えているか */
  visible: boolean;
}

export function isWalkable(kind: TileKind): boolean {
  return kind !== TILE_WALL;
}

export interface Room {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export function roomContains(room: Room, p: Vec2): boolean {
  return p.x >= room.x && p.x < room.x + room.w && p.y >= room.y && p.y < room.y + room.h;
}

export function roomCenter(room: Room): Vec2 {
  return { x: room.x + (room.w >> 1), y: room.y + (room.h >> 1) };
}

// ---------------------------------------------------------------- 状態異常

export const STATUS_SLEEP = "sleep";
export const STATUS_CONFUSE = "confuse";
export const STATUS_SEAL = "seal";
export type StatusKind = typeof STATUS_SLEEP | typeof STATUS_CONFUSE | typeof STATUS_SEAL;

export interface Status {
  kind: StatusKind;
  /** 残りターン数 */
  turns: number;
}

// ---------------------------------------------------------------- アクター

export type ActorKind = "player" | "monster" | "ally";

/**
 * 陣営。プレイヤーと仲間が 0、モンスターが 1。
 * 追跡AIも攻撃判定も「相手が別の陣営か」だけを見るので、
 * 仲間が増えても分岐は増えない。
 */
export function teamOf(actor: Actor): 0 | 1 {
  return actor.kind === "monster" ? 1 : 0;
}

export function isHostile(a: Actor, b: Actor): boolean {
  return teamOf(a) !== teamOf(b);
}

/** モンスターの行動傾向 */
export type AiKind =
  /** まっすぐ近づいて殴る */
  | "melee"
  /** 距離を取って遠隔攻撃してくる */
  | "ranged"
  /** 体力が減ると逃げる */
  | "coward";

export interface Species {
  id: string;
  name: string;
  /** 3Dモデルのファイル名(public/models/<model>.glb) */
  model: string;
  maxHp: number;
  atk: number;
  def: number;
  exp: number;
  ai: AiKind;
  /** 出現しはじめる階層 */
  minFloor: number;
  /** 出現しなくなる階層(含む)。無指定なら無制限 */
  maxFloor?: number;
  /** 抽選の重み */
  weight: number;
  /** 攻撃時に確率で付与する状態異常 */
  inflicts?: { kind: StatusKind; chance: number; turns: number };
  /** ranged 用の射程 */
  range?: number;
}

export interface Actor {
  id: number;
  kind: ActorKind;
  name: string;
  /** monster のみ */
  speciesId?: string;
  model: string;
  pos: Vec2;
  facing: Dir;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  level: number;
  statuses: Status[];
  alive: boolean;

  // ---- 以下はモンスターのみ ----
  /** 行動傾向 */
  aiKind?: AiKind;
  /** 遠隔攻撃の射程。持たないなら undefined */
  rangedRange?: number;
  /** 攻撃時に確率で付与する状態異常 */
  inflicts?: { kind: StatusKind; chance: number; turns: number };
  /** 倒したときに得られる経験値 */
  exp?: number;
  /** プレイヤーの位置を把握しているか */
  aware?: boolean;
  /** 徘徊中の進行方向 */
  wanderDir?: Dir;
}

export function hasStatus(actor: Actor, kind: StatusKind): boolean {
  return actor.statuses.some((s) => s.kind === kind && s.turns > 0);
}

// ---------------------------------------------------------------- アイテム

export type ItemCategory = "herb" | "scroll" | "staff" | "food" | "weapon" | "shield";

export interface ItemDef {
  id: string;
  name: string;
  category: ItemCategory;
  model: string;
  /** 使用/投擲時の効果 id。effects.ts が解釈する */
  effect?: string;
  /** 効果の強さ(回復量・ダメージ量・ターン数など、効果ごとに意味が変わる) */
  power?: number;
  /** 武器なら攻撃力、盾なら守備力の加算値 */
  bonus?: number;
  /** 杖の初期使用回数 */
  charges?: number;
  /** 出現しはじめる階層 */
  minFloor: number;
  /** 抽選の重み */
  weight: number;
  /** 一行説明 */
  description: string;
}

export interface Item {
  /** 個体を識別する連番。同じ定義でも別個体は別 id */
  uid: number;
  defId: string;
  /** 杖の残り使用回数 */
  charges?: number;
}

export interface GroundItem {
  item: Item;
  pos: Vec2;
}

// ---------------------------------------------------------------- 罠

export type TrapKind = "damage" | "sleep" | "alarm" | "pitfall";

export interface Trap {
  pos: Vec2;
  kind: TrapKind;
  /** 踏むまでは見えない */
  revealed: boolean;
}

// ---------------------------------------------------------------- タル

export type BarrelKind =
  /** 空。ぶつけるとモンスターを吸い込むことがある */
  | "empty"
  /** 爆発する。当たった場所の周囲もろとも吹き飛ばす */
  | "bomb"
  /** モンスターが入っている。投げて開けると仲間になる */
  | "caught";

export interface Barrel {
  id: number;
  kind: BarrelKind;
  pos: Vec2;
  /** caught のとき、中にいるモンスターの種族 */
  speciesId?: string;
}

export const BARREL_NAMES: Record<BarrelKind, string> = {
  empty: "からのタル",
  bomb: "ばくはつタル",
  caught: "モンスター入りのタル",
};

// ---------------------------------------------------------------- フロア

export interface FloorState {
  depth: number;
  width: number;
  height: number;
  tiles: Tile[];
  rooms: Room[];
  stairs: Vec2;
  actors: Actor[];
  items: GroundItem[];
  traps: Trap[];
  barrels: Barrel[];
}

export function tileAt(floor: FloorState, p: Vec2): Tile | undefined {
  if (p.x < 0 || p.y < 0 || p.x >= floor.width || p.y >= floor.height) return undefined;
  return floor.tiles[p.y * floor.width + p.x];
}

export function walkableAt(floor: FloorState, p: Vec2): boolean {
  const t = tileAt(floor, p);
  return t !== undefined && isWalkable(t.kind);
}

export function actorAt(floor: FloorState, p: Vec2): Actor | undefined {
  return floor.actors.find((a) => a.alive && a.pos.x === p.x && a.pos.y === p.y);
}

export function barrelAt(floor: FloorState, p: Vec2): Barrel | undefined {
  return floor.barrels.find((b) => b.pos.x === p.x && b.pos.y === p.y);
}

/** 誰かが立てるマスか。壁でなく、アクターもタルも載っていないこと */
export function isFree(floor: FloorState, p: Vec2): boolean {
  return walkableAt(floor, p) && !actorAt(floor, p) && !barrelAt(floor, p);
}

export function roomOf(floor: FloorState, p: Vec2): Room | undefined {
  const t = tileAt(floor, p);
  if (!t || t.roomId < 0) return undefined;
  return floor.rooms[t.roomId];
}
