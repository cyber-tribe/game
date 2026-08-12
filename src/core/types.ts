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
  /** 特殊な部屋の種別。無指定なら普通の部屋 */
  kind?: "monsterHouse" | "shop";
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
/** 主の大槌(heavySingle)を振るった反動。次の1手を丸ごと失う */
export const STATUS_RECOVER = "recover";
/** 毒。行動は妨げないが、ターン経過でじわじわHPが減る */
export const STATUS_POISON = "poison";
/** 透明。モンスターに新たに発見されなくなる(プレイヤー専用) */
export const STATUS_INVISIBLE = "invisible";
/** おびえ。モンスターが戦わずに逃げ続ける */
export const STATUS_FEAR = "fear";
export type StatusKind =
  | typeof STATUS_SLEEP
  | typeof STATUS_CONFUSE
  | typeof STATUS_SEAL
  | typeof STATUS_RECOVER
  | typeof STATUS_POISON
  | typeof STATUS_INVISIBLE
  | typeof STATUS_FEAR;

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
  | "coward"
  /** 隣接した相手から盗みを試み、成功したら逃げる(plan/shops-and-thieves.md) */
  | "thief"
  /** 近道屋の出店の店主。万引きされるまでは動かず攻撃もしない */
  | "shopkeeper"
  /** 発見されるまでawareにならず、隣接されて初めて反応する。奇襲の初撃に補正が乗る(plan/monster-compendium.md) */
  | "ambush"
  /** 潜って移動し、一定間隔でプレイヤーの近くに不意に現れる(plan/monster-compendium.md) */
  | "burrow"
  /** 単体は非力だが、生成時に複数体まとまって配置される(plan/monster-compendium.md) */
  | "swarm"
  /** ほとんど自分から動かず、その場を固める。隣接されたときの反撃力が高い(plan/monster-compendium.md) */
  | "guard"
  /** 平常時は設置物(タル)として偽装している(plan/monster-compendium.md) */
  | "mimic";

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
  /** true なら、通常のHPダメージの代わりにプレイヤーの満腹度を削る(オイテケボシ。plan/monster-compendium.md) */
  drainsSatiety?: boolean;
  /** mimic AI が擬態する対象。今のところ "barrel" のみ */
  mimicAs?: string;
  /** swarm AI の同時出現数の範囲 [min, max] */
  swarmSize?: [number, number];
  /** true なら、被弾しなかったターンにわずかにHPが回復する(うるみぐま。plan/monster-compendium.md) */
  regenIfUnhit?: boolean;
  /** true なら、プレイヤーを初めて視認した瞬間、そのフロアの他のモンスターにも気づかせる(やまびこぎつね) */
  alertsFloorOnSight?: boolean;
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
  /**
   * 「なだめの手つき」(plan/protagonist-arts.md)で受けた弱らせ量。
   * 実際のHPは減らさず、樽の捕獲判定にだけ加算される。捕獲を試みると消費される
   */
  captureBonus?: number;
  /** スリガラス(plan/shops-and-thieves.md)が盗んだ金額。持っている間だけ逃走状態になる */
  stolenGold?: number;
  /** 近道屋の出店の店主(aiKind: "shopkeeper")。万引きされて豹変したか */
  angry?: boolean;
  /**
   * ambush AI が今ターン「初めて気づいて隣接した」直後で、次の1撃に奇襲補正が
   * 乗る一時フラグ(plan/monster-compendium.md)。攻撃解決後すぐに消費される
   */
  ambushReady?: boolean;
  /** 潜っている間の残りターン数(burrow AI。plan/monster-compendium.md) */
  burrowTimer?: number;
  /**
   * かがやきの夢のかけら(plan/monster-compendium.md)。通常より一回り強く、
   * 倒すと上質な素材を落とす低確率のレア個体
   */
  shining?: boolean;

  // ---- 以下は ally のみ ----
  /** 構え。plan/companion-orders.md 参照。既定は "free" */
  stance?: AllyStance;
  /** stance === "hold" のときの固定地点 */
  holdPos?: Vec2;
  /**
   * 夢あわせ(plan/monster-fusion.md)で引き継いだ特技。最大 MAX_SKILLS 個。
   * ねむり小屋から連れ出した仲間にのみ載る(タルで新しく捕まえた直後は空)
   */
  skills?: SkillId[];
  /** プレイヤーがつけた名前。plan/companion-naming.md 参照。未設定なら種族名で表示する */
  nickname?: string;
  /**
   * なじみ(plan/companion-bond-growth.md)。ねむり小屋から連れ出した仲間が
   * それまでに積み上げた同伴成功回数。タルで新しく捕まえた直後は未設定
   */
  bondSuccessCount?: number;
  /**
   * 成熟(plan/companion-evolution.md)。ねむり小屋から連れ出した仲間が
   * それまでに積み上げた直近の夢あわせの糧履歴。タルで新しく捕まえた
   * 直後は未設定(ダイブ中は夢あわせを行えないため、この値自体は変化しない)
   */
  recentFusionMaterials?: string[];
}

export function hasStatus(actor: Actor, kind: StatusKind): boolean {
  return actor.statuses.some((s) => s.kind === kind && s.turns > 0);
}

// ---------------------------------------------------------------- 仲間への指示(構え)

/**
 * 仲間の行動方針。plan/companion-orders.md 参照。
 *
 *  - free:     おまかせ(既定)。隣接する敵を攻撃、見えている敵を追い、いなければ主のそばへ
 *  - guard:    そばにいろ。自分からは追わず、主の隣接圏内(距離1以内)を保つ
 *  - hold:     そこで待て。指示した瞬間の座標に留まる
 *  - vanguard: 先陣を切れ。未探索タイルや階段へ自律的に進む
 */
export type AllyStance = "free" | "guard" | "hold" | "vanguard";

export const ALLY_STANCE_NAMES: Record<AllyStance, string> = {
  free: "おまかせ",
  guard: "そばにいろ",
  hold: "そこで待て",
  vanguard: "先陣を切れ",
};

/** 夢あわせ(plan/monster-fusion.md)で引き継げる特技。定義は entities/skills.ts */
export type SkillId =
  | "quickStart"
  | "drowsyBreath"
  | "longThrow"
  | "stubborn"
  | "softBody"
  | "ambushStrike"
  | "confusingClaw"
  | "burrowEscape"
  | "flutterDodge"
  | "sealBite"
  | "slowMend"
  | "warnCall"
  | "disguise"
  // ---- ここから plan/companion-evolution.md ----
  | "steadfastBody";

// ---------------------------------------------------------------- アイテム

export type ItemCategory =
  | "herb"
  | "scroll"
  | "staff"
  | "food"
  | "weapon"
  | "shield"
  /** 素材。plan/equipment-forging.md 参照 */
  | "material"
  /** 頭防具。plan/protagonist-equipment.md 参照 */
  | "head"
  /** 装身具。plan/protagonist-equipment.md 参照 */
  | "charm"
  /** 1個=1回の消費アイテム(杖のような回数制ではない)。plan/protagonist-equipment.md 参照 */
  | "tool";

/**
 * 印(plan/equipment-forging.md)。武器・盾に刻める、モンスター5種に対応した加護。
 * idは対応する種族idと揃えてある(entities/species.ts参照)。
 */
export type MarkId = "purun" | "gajiri" | "tsubute" | "madoromi" | "honegarami";

/**
 * 武器の攻撃パターン。plan/protagonist-weapons.md 参照。
 *  - single:      隣接1マス(既存の「なた」系。既定値)
 *  - line2:       正面方向、2マス先まで直線(間の敵も巻き込む)
 *  - arc3:        向いている方向を中心に、正面と斜め前2方向の計3マス
 *  - quickSingle: 隣接1マス。会心率+15%、そのラン最初の1手は必ず会心
 *  - heavySingle: 隣接1マス。振るった次の1手ぶん、行動が遅れる(STATUS_RECOVER)
 */
export type WeaponPattern = "single" | "line2" | "arc3" | "quickSingle" | "heavySingle";

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
  /** 武器の攻撃パターン。省略時は "single" */
  attackPattern?: WeaponPattern;
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
  /** 強化値(+n)。武器・盾のみ。plan/equipment-forging.md 参照 */
  plus?: number;
  /** 刻んだ印。武器・盾のみ、未刻印ならundefined */
  markId?: MarkId;
  /**
   * 近道屋の出店(plan/shops-and-thieves.md)で、お金が足りないまま
   * 持ち出した品。持ったまま店の部屋を出ると万引き扱いになる
   */
  unpaid?: boolean;
}

export interface GroundItem {
  item: Item;
  pos: Vec2;
  /** 近道屋の出店(plan/shops-and-thieves.md)の売り物。買うか、払わず持ち出すかを選べる */
  forSale?: { price: number };
}

/** 床に落ちている金貨の山。plan/shops-and-thieves.md 参照。踏むと自動で拾う */
export interface GoldPile {
  id: number;
  pos: Vec2;
  amount: number;
}

// ---------------------------------------------------------------- 罠

export type TrapKind = "damage" | "sleep" | "alarm" | "pitfall" | "poison";

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

// ---------------------------------------------------------------- フロアギミック

/**
 * そのダイブの、特定の1フロアだけに乗る軽いランダム性。
 * `design/regions.md` の地方固有ギミック(地方ごとに固定)とは異なり、
 * フロア生成のたびに抽選される。plan/floor-gimmicks.md 参照。
 */
export type FloorGimmickKind =
  /** くらやみの階: 視界範囲が縮む */
  | "darkness"
  /** ざわめきの階: モンスターが最初から aware で配置される */
  | "alert"
  /** おちあなの階: 落とし穴トラップの出現率が上がる */
  | "pitfall"
  /** ほうふくの階: 満腹度の減りが半分になる */
  | "feast"
  /** 山分けの階: アイテム・タルもモンスターも多い */
  | "windfall"
  /** しじまの階: 野生モンスターが湧かない代わりに階段が分かりにくい */
  | "silence";

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
  /** 床に落ちている金貨の山。plan/shops-and-thieves.md 参照 */
  goldPiles: GoldPile[];
  /** そのフロアに乗っているギミック。無ければ「いつも通りの階」 */
  gimmick?: FloorGimmickKind;
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
