import { dirDelta, type Dir, type Vec2 } from "./grid";

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
  /**
   * 深みタイル(plan/wetland-quagmire.md)。第二地方(7〜12階)の部屋タイルの
   * 一部に付与される。壁/部屋/通路の区別とは独立した属性なので、TileKind
   * 自体は増やさない
   */
  quagmire?: boolean;
  /**
   * 奔流タイル(plan/waterfall-torrent.md)。第五地方(25〜30階)の部屋
   * タイルの一部に付与される。この向きへ強制的に押し流す
   */
  torrent?: Dir;
  /**
   * 地方ボス(plan/region-boss-horikuinonushi.md)。予兆ターンに一時的に
   * 立つ、杭の突き上げ予告。発動ターンでダメージ適用後に解除される
   */
  crackWarning?: boolean;
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
  /** 第三地方(まどろみの茸林)固有ギミック(plan/spore-grove.md): 胞子部屋かどうか */
  spored?: boolean;
  /** 胞子部屋に誰かがいたターン数のカウンタ。8に達すると睡眠パルスを起こして0に戻す */
  sporeTimer?: number;
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
/**
 * ゆめわざ「ねばりつき」(plan/game/archive/companion-leveling-and-arts.md)。
 * 移動だけを封じる(隣接していれば攻撃はできる)。runActorsが行動決定の直後に
 * moveアクションだけをwaitへ差し替えることで実現し、ai.ts側の分岐は増やさない
 */
export const STATUS_ROOT = "root";
/**
 * ゆめわざ「おどしなき」(plan/game/archive/companion-leveling-and-arts.md)。
 * その1手を丸ごと奪う(移動も攻撃もできない)。runActorsが行動決定の直後に
 * 何のアクションであれwaitへ差し替える
 */
export const STATUS_FLINCH = "flinch";
export type StatusKind =
  | typeof STATUS_SLEEP
  | typeof STATUS_CONFUSE
  | typeof STATUS_SEAL
  | typeof STATUS_RECOVER
  | typeof STATUS_POISON
  | typeof STATUS_INVISIBLE
  | typeof STATUS_FEAR
  | typeof STATUS_ROOT
  | typeof STATUS_FLINCH;

export interface Status {
  kind: StatusKind;
  /** 残りターン数 */
  turns: number;
}

// ---------------------------------------------------------------- アクター

/**
 * "target"は樽比べ(plan/tarukurabe-minigame.md)専用の非戦闘アクター。
 * hpは1、aiKindを持たず、isRegionBoss等のボス系フラグも一切持たない
 * 軽量な的。teamOf/isHostileは他の非モンスターと同じ扱い(0陣営)になるが、
 * 樽比べの部屋には野生モンスターが存在しないため実害はない
 */
export type ActorKind = "player" | "monster" | "ally" | "target";

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

/**
 * 地方ボスの大技の種別(plan/region-bosses.md)。省略時は "targetedStrike"
 * (既存の隣接攻撃強化、oonebosuke/nushigaeruと完全互換)。
 * "aoeSleep"/"aoeSeal"は隣接攻撃を伴わず、自分のいる部屋の全アクター
 * (敵味方問わず)に睡眠/封じを付与する発動に変わる(plan/region-boss-honezuka.md)。
 * "summonTorrent"は状態異常ではなく、自分のいる部屋の外周タイルへ一時的に
 * 奔流(plan/waterfall-torrent.md)を呼び込む(plan/region-boss-fuchinonushi.md)。
 * "summonEcho"は状態異常でも地形でもなく、HPを共有する分身を2体まで
 * 召喚する(plan/region-boss-kodamanonushi.md、Actor.sharesHpWith参照)。
 * "summonMirror"は本体そっくりの幻影を3体召喚する。当てると即消える
 * 幻影で、本体を選び当てる駆け引きになる(plan/region-boss-
 * misemonononushi.md、Actor.mirrorOf参照)。
 * "groundSpikes"は唯一、予兆ターンの時点で床にTile.crackWarningを
 * 立てて危険地帯を可視化する(他の効果はメッセージだけで危険を伝える)。
 * 発動ターンでcrackWarningの立つマスにいる全アクターへダメージを
 * 適用し、その後crackWarningを解除する(plan/region-boss-horikuinonushi.md)。
 *
 * "targetedStrike"以外の実装は systems/bossMoves.ts の BOSS_MOVES レジストリに
 * 集約している(1種類=1エントリ。ボス追加時にここへ足すだけでよい)
 */
export type BossMoveId =
  | "targetedStrike"
  | "aoeSleep"
  | "aoeSeal"
  | "summonTorrent"
  | "summonEcho"
  | "summonMirror"
  | "groundSpikes";

/**
 * ゆめわざ(plan/game/archive/companion-leveling-and-arts.md)。仲間モンスターが
 * レベルで習得する能動的な特技・魔法。既存のパッシブ特技(skills.ts)とは別枠で、
 * 発動条件・実装は entities/dreamArts.ts(判定)と systems/dreamArtEffects.ts
 * (実行)のレジストリに集約している(1種類=1エントリ)
 */
export type DreamArtId =
  | "nemuriUta"
  | "tsubuteNage"
  | "katayaburi"
  | "iyashiNoShizuku"
  | "kodamaGaeshi"
  | "chiisanaKaze"
  | "honokaNaAkari"
  | "odoshiNaki"
  | "nebaritsuki"
  | "yumeNoKakebuton"
  | "honeTsuyoshi"
  | "wasuresase"
  // ぬしのゆめわざ(plan/game/archive/boss-dream-arts.md)。地方ボス種専用、
  // 各ぬし1種のみ習得する(通常種のような2件構成にはしない)
  | "jibikiNoNegaeri"
  | "oomarunomi"
  | "fukaiMadoromi"
  | "honeNoToride"
  | "uzuNoSasoi"
  | "kodamaNoOtakebi"
  | "maboroshiNoKoujou"
  | "tsuranukiBori"
  // タルわざ(plan/game/archive/barrel-arts.md)。習得の枠組みはゆめわざと共通だが、
  // 発動は戦闘中の自動判断ではなく、空のタルを抱えた状態でプレイヤーが
  // 「仲間へ指示」から明示的に頼んだときだけ使う(trigger は常にnullを返す)
  | "waterBarrelArt"
  | "windBarrelArt"
  | "lightBarrelArt"
  | "stoneBarrelArt"
  | "sleepBarrelArt";

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
  /**
   * 地方ごとの成熟系統(plan/companion-evolution-expansion.md)。攻撃を
   * 受けたとき、この確率で完全に回避する(かすみウツボ)
   */
  evadeChance?: number;
  /**
   * 地方ごとの成熟系統(plan/companion-evolution-expansion.md)。攻撃力に
   * 掛ける倍率の上乗せぶんの最大値。HPが減るほど(0に近づくほど)満額に
   * 近づく線形補間(なみだぐま。HP満タンなら+0%、HP0近くで+この値%)
   */
  lowHpAtkBonusMax?: number;
  /**
   * 地方ごとの成熟系統(plan/companion-evolution-expansion.md)。被弾した
   * ダメージのこの割合を、攻撃者にそのまま返す(ヨロイオイテケ)。
   * プランの原案は「被弾のたびに相手の満腹度を削り返す」だったが、
   * 満腹度はプレイヤー専用のステータスで攻撃者(モンスター)には
   * 存在しないため、同じ「返り討ち」の趣旨を保ったままダメージ反射に
   * 差し替えた(実装時の判断)
   */
  counterDamageRatio?: number;
  /**
   * 地方ごとの成熟系統(plan/companion-evolution-expansion.md)。命中した
   * あと、この確率で追加の1撃を同じ対象に放つ(最大2回まで反響、
   * こだまぎつね)
   */
  echoAttackChance?: number;
  /**
   * 地方ごとの成熟系統(plan/companion-evolution-expansion.md)。true なら
   * あらゆる状態異常を受け付けない(まつりのぬし)
   */
  statusImmune?: boolean;
  /**
   * あうんの呼吸(plan/ally-field-gimmicks.md)。移動・探索専用のタグで、
   * 戦闘上の強さには一切関与しない
   */
  fieldSkill?: FieldSkillId;
  /**
   * 地方ボス(plan/region-bosses.md)。true なら、夢あわせの「糧」にしたとき
   * 通常個体3体分の経験値換算になる(仲間にする価値を持たせる特別ルール)
   */
  isRegionBoss?: boolean;
  /** 地方ボスの予兆つきの大技。隣接して初めて発動条件を見るため、発動条件そのものはActor側で管理する */
  bossTelegraph?: {
    message: string;
    multiplier: number;
    cooldownTurns: number;
    /**
     * 地方ボス(plan/region-boss-nushigaeru.md)。maxHpに対するこの割合まで
     * HPが減るまでは予兆→大技のサイクルに入らない。省略時は1(常に有効。
     * oonebosukeのような単一フェーズのボスと完全互換)
     */
    activateBelowHpRatio?: number;
    /** 大技の効果種別(plan/region-boss-oomadoromi.md)。詳細は BossMoveId 参照 */
    effect?: BossMoveId;
  };
  /** 地方ボスを撃破すると確定ドロップする、その地方限定の素材のdefId */
  bossGuaranteedDrop?: string;
  /**
   * 地方ボス(plan/region-boss-nushigaeru.md)。深みタイル(plan/wetland-
   * quagmire.md)の上にいる間、毎ターンSTATUS_INVISIBLEを自身に付与する
   */
  hidesInQuagmire?: boolean;
  /**
   * 小ネタ・遊び心(plan/flavor-and-dialogue.md)。待機仕草(idleアニメーション)
   * の再生速度に掛ける倍率。既定1。新規クリップは作らず、既存のidleの
   * 再生速度・タイミングだけで個性を出す
   */
  idleSpeedMul?: number;
  /**
   * 60種化・追加種族(plan/monster-roster-expansion-species.md)。深みタイル
   * (quagmire)の上にいる間、rangeにこの値を加算する(きりみずち)
   */
  rangeBonusOnQuagmire?: number;
  /**
   * 60種化・追加種族(plan/monster-roster-expansion-species.md)。奔流タイル
   * (torrent)に隣接(自分のマス含む)している間、rangeにこの値を加算する(なだかぜ)
   */
  rangeBonusNearTorrent?: number;
  /**
   * 60種化・追加種族(plan/monster-roster-expansion-species.md)。胞子部屋
   * (Room.spored)にいる間、攻撃力に掛ける倍率の上乗せぶん(きのこおとこ)
   */
  atkMulInSporedRoom?: number;
  /**
   * ゆめわざの習得表(plan/game/archive/companion-leveling-and-arts.md)。
   * 仲間として連れているとき、レベルがこの値に達すると習得する(最大2つ)。
   * 敵として出現するときは効果を持たない(仲間限定の特権)
   */
  dreamArts?: readonly { level: number; id: DreamArtId }[];
}

/** あうんの呼吸(plan/ally-field-gimmicks.md)。障害物が要求する仲間の性質 */
export type FieldSkillId = "break" | "squeeze" | "leap" | "dig";

/** 4種類のActorすべてに共通するフィールド */
interface ActorBase {
  id: number;
  name: string;
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
}

/**
 * モンスター・仲間に共通するフィールド(plan外のリファクタリング、
 * Martin Fowler PR15)。仲間はdungeon/populate.tsのcreateAllyが
 * createMonsterの戻り値を土台にkindだけ差し替えて作るため、実行時の形は
 * 元からほぼ同じだった。この共通部分をCombatantActorとして型でも表す
 */
export interface CombatantActor extends ActorBase {
  kind: "monster" | "ally";
  /** 種族id(entities/species.ts) */
  speciesId?: string;
  /** 行動傾向。仲間は種族の行動傾向を引き継ぐが、AIはkind==="ally"を優先する */
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
  /** 地方ボス(plan/region-bosses.md)。予兆を出した直後で、次の隣接攻撃が大技として発動する */
  telegraphCharge?: boolean;
  /** 地方ボス。次に予兆を出せるようになるまでの残りターン数 */
  telegraphCooldown?: number;
  /**
   * 地方ボス(plan/region-boss-fuchinonushi.md)。大技(summonTorrent)で
   * 一時的に奔流タイルを設置した位置と、元に戻すまでの残りターン数
   */
  summonedTorrentTiles?: { pos: Vec2; expiresIn: number }[];
  /**
   * 地方ボス(plan/region-boss-kodamanonushi.md)。設定されていれば、この
   * アクターは分身であり、実際のダメージ増減・生死判定は指定したactor idの
   * アクター(本体)側で行う。このアクター自身のhpフィールドは表示用の
   * ミラーに過ぎない
   */
  sharesHpWith?: number;
  /**
   * 地方ボス(plan/region-boss-misemonononushi.md)。設定されていれば、この
   * アクターは幻影であり、本物のactor idを指す。幻影を攻撃してもダメージは
   * 発生せず即座に消え、代わりに本体(mirrorOfが指すActor)が反撃する
   */
  mirrorOf?: number;
  /**
   * 地方ボス(plan/region-boss-misemonononushi.md)。本体側にだけ設定する。
   * 幻影を呼び出してからの残りターン数。0になると幻影が自然に消える
   */
  mirrorTurnsLeft?: number;
  /**
   * ぬしのゆめわざ「ホネのとりで」(plan/game/archive/boss-dream-arts.md)で
   * 一時的に壁化したタイルの位置・元に戻すまでの残りターン数・元のTileKind。
   * summonedTorrentTilesと同じ「一時変化→ターン経過で復元」の形
   */
  boneWallTiles?: { pos: Vec2; expiresIn: number; originalKind: TileKind }[];
}

export interface MonsterActor extends CombatantActor {
  kind: "monster";
}

export interface AllyActor extends CombatantActor {
  kind: "ally";
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
  /**
   * 仲間自身の蓄積経験値(plan/game/archive/companion-leveling-and-arts.md)。
   * `CombatantActor.exp`(倒したときに得られる経験値)とは別の値なので
   * 名前を分けている。ねむり小屋との往復は`StoredMonster.exp`が担う
   */
  growthExp?: number;
  /** 習得済みのゆめわざ。最大2つ。entities/dreamArts.tsのDREAM_ARTSが定義を持つ */
  dreamArts?: DreamArtId[];
  /** ゆめわざごとのクールダウン残りターン数。0または未設定なら発動可 */
  dreamArtCooldowns?: Partial<Record<DreamArtId, number>>;
  /** ゆめわざ「かたやぶり」。trueなら次の1撃だけ相手の防御力を無視する */
  ignoreDefenseNextHit?: boolean;
  /** ゆめわざ「こだまがえし」。trueなら次に受けた1撃の半分を相手へ返す */
  reflectNextHit?: boolean;
  /** ゆめわざ「ホネつよし」。0より大きい間、defに掛かる倍率が上がる */
  defBuffTurns?: number;
}

/**
 * プレイヤー本人の最小限の形。装備・満腹度などプレイヤー固有のフィールドは
 * entities/player.ts の PlayerState(このインターフェースを継承する)が持つ。
 * core/types.ts はitems/inventory.ts等に依存しないリーフモジュールであるため、
 * ここではActor共通の形だけを表す
 */
export interface PlayerActor extends ActorBase {
  kind: "player";
  /**
   * 装備した武器の見た目(plan/equipped-weapon-visual.md)。武器を持つのは
   * 主人公のみ。view層(Stage/ActorView)が武器アイテムの中身を知らなくても
   * 手に追従させられるよう、装備状態から導出したモデル名だけをここに載せる
   * (items/inventory.tsのequippedWeaponModel参照)
   */
  equippedWeaponModel?: string;
}

/** 樽比べ(plan/tarukurabe-minigame.md)専用の非戦闘アクター。的 */
export interface TargetActor extends ActorBase {
  kind: "target";
  /** 命中したときに加算する得点(近1・中2・遠3) */
  tarukurabePoints?: number;
}

export type Actor = PlayerActor | MonsterActor | AllyActor | TargetActor;

export function hasStatus(actor: Actor, kind: StatusKind): boolean {
  return actor.statuses.some((s) => s.kind === kind && s.turns > 0);
}

// ---------------------------------------------------------------- 仲間への指示(構え)

/**
 * 仲間の行動方針。plan/companion-orders.md 参照。
 *
 *  - free:             おまかせ(既定)。隣接する敵を攻撃、見えている敵を追い、いなければ主のそばへ
 *  - guard:            そばにいろ。自分からは追わず、主の隣接圏内(距離1以内)を保つ
 *  - hold:             そこで待て。指示した瞬間の座標に留まる
 *  - vanguard:         先陣を切れ。未探索タイルや階段へ自律的に進む
 *  - dreamArtsCareful: ゆめわざ控えめ(plan/game/archive/companion-leveling-and-arts.md)。
 *                      移動・攻撃の判断はfreeと同じだが、ゆめわざの自動発動だけを止める
 *                      (使わせたくない場面向けの間接制御)
 */
export type AllyStance = "free" | "guard" | "hold" | "vanguard" | "dreamArtsCareful";

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

/**
 * レベルアップ時のスキル選択(plan/game/archive/run-build-skills.md)。
 * ガルドがそのダイブ限りで身につける、攻撃・支援・タルの3系統のビルドスキル。
 * SaveDataには持たせず、Game(ラン状態)にだけ持つ
 */
export type RunSkillId =
  // ---- 攻撃系統(自分の戦い方が変わる) ----
  | "wideSlash"
  | "stepIn"
  | "launcher"
  | "braced"
  | "allIn"
  | "finisher"
  // ---- 支援系統(パーティを維持する) ----
  | "sharingHand"
  | "encouragement"
  | "mutualGuard"
  | "appreciation"
  | "captureMastery"
  | "wakingPrayer"
  // ---- タル系統(タル・地形の攻略力) ----
  | "rollingThrow"
  | "lightCarry"
  | "gentleThrow"
  | "refillBarrel"
  | "barrelBurst"
  | "stealthCarry";

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

/** 使用/投擲時の効果 id。items/effects.ts の applyEffect が解釈する */
export type ItemEffectId =
  | "heal"
  | "power"
  | "eat"
  | "revealMap"
  | "sleepRoom"
  | "confuseRoom"
  | "swap"
  | "sleepTarget"
  | "cureSleepConfuse"
  | "curePoison"
  | "defenseUp"
  | "senseStairs"
  | "invisibility"
  | "fearRoom"
  | "pull"
  | "sealTarget";

/**
 * 装備しているだけで常時有効になる受動効果のid(plan/protagonist-equipment.md等)。
 * 使用/投擲時にだけ発動するItemEffectIdとは別物。頭防具・装身具は
 * ItemDef.grants、武器・盾の印はMarkDef.grants(entities/forging.ts)で
 * 付与を宣言し、items/inventory.tsのhasEquipEffectがどちらも横断して判定する
 * (同じ効果を複数の装備が付与してもよい。例: revivalWardはホネガラミの印と
 * 身がわりの鈴の両方が付与する)
 */
export type EquipEffectId =
  /** ほこら粉寄せの匂い袋: 掘り出す素材をほこら粉に寄せる */
  | "dustLureBoost"
  /** 樽なじみの腕輪: からのタルでの捕獲確率+10% */
  | "barrelKinship"
  /** 千里眼の輪: モンスターハウスの気配をより手前で察知できる */
  | "farsight"
  /** 見晴らしのはちまき: 視界+1 */
  | "lookout"
  /** ガジリねずみの印: そのランの最初の1手を必ず会心にする */
  | "quickStrike"
  /** マドロミダケの印: 攻撃時、眠り付与の確率+10% */
  | "drowsyBonus"
  /** ぷるんの印: 被弾ダメージを確率5割で1割軽減する */
  | "damageReduction"
  /** ツブテガエルの印: タルを投げたときのダメージ+2 */
  | "barrelDamageBonus"
  /** ホネガラミの印・身がわりの鈴: HPが1残っていれば致死ダメージを1回だけ耐える */
  | "revivalWard"
  /** 満たされ石: 満腹度の減りが2割ゆるやかになる */
  | "satietyEase"
  /** 樽守りの笠: 眠りにかかりにくくなる */
  | "sleepResist";

export interface ItemDef {
  id: string;
  name: string;
  category: ItemCategory;
  model: string;
  /** 使用/投擲時の効果 id。effects.ts が解釈する */
  effect?: ItemEffectId;
  /** 効果の強さ(回復量・ダメージ量・ターン数など、効果ごとに意味が変わる) */
  power?: number;
  /** 武器なら攻撃力、盾なら守備力の加算値 */
  bonus?: number;
  /** 武器の攻撃パターン。省略時は "single" */
  attackPattern?: WeaponPattern;
  /** 杖の初期使用回数 */
  charges?: number;
  /** 装備している間、常時付与される受動効果(頭防具・装身具のみ) */
  grants?: EquipEffectId[];
  /** 出現しはじめる階層 */
  minFloor: number;
  /** 抽選の重み */
  weight: number;
  /** 一行説明 */
  description: string;
  /** 小ネタ・遊び心(plan/flavor-and-dialogue.md)。機能説明とは別の、雰囲気だけの一行。省略可能で、少しずつ埋めていく */
  flavorText?: string;
}

export interface Item {
  /** 個体を識別する連番。同じ定義でも別個体は別 id */
  uid: number;
  defId: string;
  /** 杖の残り使用回数 */
  charges?: number;
  /** 強化値(+n)。武器・盾のみ。plan/equipment-forging.md 参照 */
  plus?: number;
  /**
   * 刻んだ印。武器・盾のみ、最大2件(plan/dual-mark-equipment.md)。
   * 未刻印ならundefined(空配列にはしない)
   */
  markIds?: MarkId[];
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

// ---------------------------------------------------------- あうんの呼吸

/**
 * あうんの呼吸(plan/ally-field-gimmicks.md)の障害物。対応する`fieldSkill`
 * を持つ仲間を連れて隣接すると開き、報酬のアイテムがその場に現れる
 */
export interface FieldObstacle {
  pos: Vec2;
  requires: FieldSkillId;
  opened: boolean;
}

/**
 * 忘れ物蔵(plan/lost-and-found-vault.md)の隠し通路。表の寝穴の各地方の
 * 2階目に1本だけ配置される、壁の姿をした通路。隣接すると一度だけ気配の
 * ヒントが出て(hinted)、その壁へ向かって移動しようとする(バンプする)
 * たびに確率で崩れて通路になる
 */
export interface SecretPassage {
  pos: Vec2;
  regionId: string;
  hinted: boolean;
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
  | "caught"
  // ---- 元素タル(plan/game/archive/barrel-arts.md)。タルわざで空のタルから作る ----
  | "water"
  | "wind"
  | "light"
  | "stone"
  | "sleep";

export interface Barrel {
  id: number;
  kind: BarrelKind;
  pos: Vec2;
  /** caught のとき、中にいるモンスターの種族 */
  speciesId?: string;
  /**
   * 第七地方(わすれられた祭りの跡)固有ギミック(plan/festival-mirage.md)。
   * 見た目は本物と同一だが、持ち上げようとすると幻だったと判明して消える
   */
  decoy?: boolean;
  /**
   * 元素タル(plan/game/archive/barrel-arts.md)。作った仲間のなじみが
   * 「すっかりなじんだ」段階以上のとき true になり、投げる/あける効果が強化版になる
   */
  enhanced?: boolean;
  /**
   * スキル「つぎたし」(plan/game/archive/run-build-skills.md)。この元素タルが
   * 「つぎたし」で一度延命済みか。trueなら次にあけたときは素直に空へ戻る
   */
  refillUsed?: boolean;
}

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
  /** あうんの呼吸(plan/ally-field-gimmicks.md)の障害物 */
  fieldObstacles: FieldObstacle[];
  /** 忘れ物蔵(plan/lost-and-found-vault.md)の隠し通路。表の寝穴の地方の2階目にだけ生成される */
  secretPassages: SecretPassage[];
  /**
   * 第七地方(わすれられた祭りの跡)固有ギミック(plan/festival-mirage.md)。
   * 見た目・タイル種別は本物の階段(stairs)と同一だが、降りようとしても
   * 次の階へは進まず、幻だったと判明して消える
   */
  decoyStairsPositions?: Vec2[];
  /**
   * ボスの間の扉(plan/game/dungeon-boss-rooms.md)。前室とボスの間を仕切る、
   * 開けるまでは壁と同じく通れない1マス。地方ボスの階(表の寝穴の6階ごと)
   * にだけ立つ。一度開けたら閉じない(open=trueのまま)
   */
  door?: FloorDoor;
  /**
   * 横穴(分岐ダンジョン、plan/game/dungeon-per-region.md)の入り口。低確率で
   * 特定の地方ダンジョンの特定階に生成される。踏んで確定すると短い分岐
   * ダンジョンへ移り、踏破すると元のこの階のこの位置へ戻ってくる
   */
  branchEntrance?: FloorBranchEntrance;
}

export interface FloorDoor {
  pos: Vec2;
  open: boolean;
  /** 扉の向こうで待つボスの種族id。開けたときの一言・BGM切り替えに使う */
  bossSpeciesId: string;
}

export interface FloorBranchEntrance {
  pos: Vec2;
  /** 移動先の分岐ダンジョンid(src/entities/dungeons.ts の DungeonDef.id) */
  dungeonId: string;
}

export function tileAt(floor: FloorState, p: Vec2): Tile | undefined {
  if (p.x < 0 || p.y < 0 || p.x >= floor.width || p.y >= floor.height) return undefined;
  return floor.tiles[p.y * floor.width + p.x];
}

export function walkableAt(floor: FloorState, p: Vec2): boolean {
  const t = tileAt(floor, p);
  if (t === undefined || !isWalkable(t.kind)) return false;
  // 閉じたボスの間の扉は、開けるまで壁と同じく通れない
  if (floor.door && !floor.door.open && floor.door.pos.x === p.x && floor.door.pos.y === p.y) {
    return false;
  }
  return true;
}

/**
 * from の隣から dir 方向へ、歩けるマスである限り1マスずつ辿る。歩けない
 * マスに当たった時点でそこは含めずに終わる(投擲・射線の共通の土台)。
 */
export function* walkLine(floor: FloorState, from: Vec2, dir: Dir, maxRange: number): Generator<Vec2> {
  const delta = dirDelta(dir);
  for (let step = 1; step <= maxRange; step++) {
    const p = { x: from.x + delta.x * step, y: from.y + delta.y * step };
    if (!walkableAt(floor, p)) return;
    yield p;
  }
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
