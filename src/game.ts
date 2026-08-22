import { Rng } from "./core/rng";
import { OncePerRunTracker } from "./core/oncePerRunTracker";
import {
  ALL_DIRS,
  type Dir,
  type Vec2,
  chebyshev,
  dirDelta,
  dirFromDelta,
  eq,
  isDiagonal,
} from "./core/grid";
import type { GameEvent } from "./core/events";
import {
  STATUS_CONFUSE,
  STATUS_INVISIBLE,
  STATUS_RECOVER,
  STATUS_SLEEP,
  type Actor,
  type AllyActor,
  type AllyStance,
  type Barrel,
  type BarrelKind,
  type FieldSkillId,
  type FloorGimmickKind,
  type FloorState,
  type Item,
  type ItemDef,
  type MonsterActor,
  type Room,
  type RunSkillId,
  type TargetActor,
  type Tile,
  type WeaponPattern,
  TILE_CORRIDOR,
  TILE_ROOM,
  TILE_WALL,
  actorAt,
  barrelAt,
  freeSpotNear,
  hasStatus,
  hpOwnerOf,
  isHostile,
  roomContains,
  tileAt,
  walkableAt,
  walkLine,
} from "./core/types";
import { type ArtId, artDef } from "./entities/arts";
import { generateFloor } from "./dungeon/generate";
import { t } from "./i18n";
import { GIMMICK_MESSAGES, pickFloorGimmick } from "./dungeon/gimmicks";
import {
  type IdSource,
  choosePlayerStart,
  createAllyFromStored,
  createBarrel,
  createItem,
  createMonster,
  findFreeTile,
  placeChapter3CollapseObstacle,
  placeDecoyBarrels,
  placeDecoyStairs,
  placeQuagmireTiles,
  placeSecretPassage,
  placeSporeRooms,
  placeTorrentTiles,
  populateFloor,
  spawnWanderingMonster,
} from "./dungeon/populate";
import { displayActorName } from "./entities/naming";
import { ALLY_STANCE_NAMES, barrelDisplayName } from "./entities/displayNames";
import {
  isCheckpointFloor,
  isChapter3CollapseFloor,
  type DungeonDef,
  HINATA_ID,
  MOUNTAIN_CORE_ID,
  NIGHTLY_DREAM_ID,
  REGION_DUNGEON_IDS,
  TARUKURABE_ID,
  TRIAL_CHAMBER_ID,
  TRUE_AWAKENING_ID,
  branchDungeonSpecFor,
  dungeonById,
  nightlyDreamStatMultiplier,
  regionIndexForDungeonId,
} from "./entities/dungeons";
import { storyChapter } from "./entities/story";
import { DEFAULT_MOOD_ID, type MoodDef, type MoodId, moodDef } from "./entities/moods";
import type { StoredMonster } from "./entities/storedMonster";
import { isVisible, updateVisibility } from "./dungeon/visibility";
import {
  GIMMICK_CHANCE_MULTIPLIER,
  GOLD_REWARD_MULTIPLIER,
  MONSTER_ATK_MULTIPLIER,
  MONSTER_HOUSE_CHANCE_MULTIPLIER,
  SHINING_CHANCE_DIFFICULTY_MULTIPLIER,
  type DifficultyMode,
} from "./entities/difficulty";
import { HOKORA_DUST_DEF_ID, MARK_STONE_DEF_ID, MARKS } from "./entities/forging";
import { sellPrice } from "./entities/shop";
import {
  MAX_ALLIES,
  MAX_SATIETY,
  type PlayerState,
  type TrainingFocus,
  createPlayer,
  totalAttack,
} from "./entities/player";
import { HAJIME_NO_YUME_ID, REGION_BOSS_ORDER, speciesById } from "./entities/species";
import { REGIONS, regionByIndex } from "./entities/regions";
import { type BondStage, bondStage } from "./entities/companionBond";
import { HONOKA_NA_AKARI_VISION_EXTRA, type DreamArtContext } from "./domain/party/dreamArtEffects";
import { itemDef } from "./items/catalog";
import { type EffectContext, addStatus, applyEffect } from "./items/effects";
import {
  addItem,
  displayName,
  equip,
  equippedWeaponModel,
  findItem,
  hasEquipEffect,
  isFull,
  removeItem,
} from "./items/inventory";
import { attackOffsets } from "./domain/combat/attackPattern";
import { computeDamage } from "./domain/combat/damageCalculation";
import { barrelThrowDamage, mitigateIncomingDamage } from "./domain/combat/damageModifier";
import { liftOrPutBarrel } from "./domain/barrel/barrelLift";
import { BARREL_RANGE, LIGHT_CARRY_RANGE_BONUS, traceThrow } from "./domain/barrel/barrelThrow";
import { releaseFromBarrel as domainReleaseFromBarrel } from "./domain/barrel/barrelDrop";
import {
  LIGHT_BARREL_CONFUSE_TURNS,
  SLEEP_BARREL_SLEEP_TURNS,
  STONE_BARREL_DAMAGE_MULTIPLIER,
  WATER_BARREL_DAMAGE_MULTIPLIER,
  WIND_BARREL_PUSH_DISTANCE,
  applyElementalBarrelHit,
} from "./domain/barrel/barrelElemental";
import {
  LIGHT_BARREL_OPEN_TURNS,
  openSleepBarrel,
  openStoneBarrel,
  openWaterBarrel,
  openWindBarrel,
} from "./domain/barrel/barrelOpen";
import { castBarrelArt as domainCastBarrelArt } from "./domain/barrel/barrelArt";
import { burstBarrel as domainBurstBarrel, explode as domainExplode } from "./domain/barrel/barrelExplosion";
import {
  type CaptureOutlook,
  captureOutlookFor,
  resolveEmptyBarrel as domainResolveEmptyBarrel,
} from "./domain/barrel/barrelCapture";
import type { BossMoveContext } from "./systems/bossMoves";
import { damageActor as domainDamageActor, killActor as domainKillActor } from "./domain/turn/damage";
import { attack as domainAttack } from "./domain/turn/attackResolution";
import { applyTorrentPush as domainApplyTorrentPush, pushMonster as domainPushMonster } from "./domain/turn/actorActions";
import { resolveTurn as domainResolveTurn, upkeep as domainUpkeep } from "./domain/turn/turnCycle";
import {
  createSkillChoiceState,
  isAwaitingSkillChoice,
  offerNextSkillChoice as domainOfferNextSkillChoice,
  resolveSkillChoice as domainResolveSkillChoice,
  type SkillChoiceState,
} from "./domain/player/runSkills";
import { recruitFromBarrel as domainRecruitFromBarrel } from "./domain/party/recruit";
import { tickAllyDreamArts as domainTickAllyDreamArts } from "./domain/party/dreamArts";
import {
  adjacentFreeSpot as domainAdjacentFreeSpot,
  applyRoomWideStatus as domainApplyRoomWideStatus,
  digWall as domainDigWall,
  placeTemporaryWall as domainPlaceTemporaryWall,
  tickBoneWalls as domainTickBoneWalls,
  tickMirrors as domainTickMirrors,
  tickSporeRooms as domainTickSporeRooms,
  tickSummonedTorrentTiles as domainTickSummonedTorrentTiles,
} from "./domain/dungeon/floorGimmicks";
import { alertNearbyMonsters as domainAlertNearbyMonsters, checkTrap as domainCheckTrap } from "./domain/dungeon/traps";

/** 双樽鉤(quickSingle)の会心率の上乗せ分 */
const QUICK_SINGLE_CRIT_BONUS = 0.15;
/** 主の大槌(heavySingle)の反動。1ターン分の行動を失わせる(既存の状態異常と同じ off-by-one 消化) */
const HEAVY_RECOVER_TURNS = 2;

// ---- plan/monster-compendium.md: 新しい特技・特性の各種係数 ----
/**
 * 図鑑コンプリート(plan/monster-compendium.md)時、かがやきの夢のかけらの
 * 出現確率に掛かる倍率。基準の確率自体は dungeon/populate.ts 側で定義する
 */
const COMPENDIUM_COMPLETE_SHINING_MULTIPLIER = 1.5;
/**
 * 真の目覚め(plan/true-awakening.md)達成後の恒久ボーナス。図鑑コンプリート
 * の1.5倍からさらに+0.5%(基準1%換算)上乗せし、合計2倍にする。
 * 達成には図鑑コンプリートが前提条件のひとつなので、この倍率は
 * COMPENDIUM_COMPLETE_SHINING_MULTIPLIERの代わりに使う(掛け合わせない)
 */
const TRUE_AWAKENING_SHINING_MULTIPLIER = 2;

export type Command =
  /** 移動、または進んだ先に敵がいれば1マス押し出す(plan/attack-button.md) */
  | { type: "move"; dir: Dir }
  /** 向きだけ変える。ターンを消費しない */
  | { type: "face"; dir: Dir }
  /**
   * 向いている方向へ攻撃する(plan/attack-button.md)。移動は伴わない。
   * 敵がいなければ空振り(何も起きないがターンは消費する)
   */
  | { type: "attack" }
  | { type: "wait" }
  | { type: "pickup" }
  | { type: "descend" }
  | { type: "use"; uid: number }
  | { type: "throw"; uid: number }
  | { type: "drop"; uid: number }
  | { type: "equip"; uid: number }
  /** 正面か足元のタルを持ち上げる。抱えていれば下ろす */
  | { type: "liftBarrel" }
  /** 抱えているタルを向いている方向へ投げる */
  | { type: "throwBarrel" }
  /**
   * タルわざ(plan/game/archive/barrel-arts.md): 抱えている中身を正面
   * (塞がっていれば足元)へ放つ。あけると中身は失われ、空のタルに戻る
   */
  | { type: "openBarrel" }
  /**
   * タルわざ(plan/game/archive/barrel-arts.md): 空のタルを抱えた状態で、
   * タルわざ持ちの仲間へ変化を頼む
   */
  | { type: "castBarrelArt"; allyId: number }
  /** 仲間への指示(構え)。"all" なら連れている全員に一括で出す */
  | { type: "setStance"; allyId: number | "all"; stance: AllyStance }
  /** めざめの階段を使って、ここで区切ってダイブを成功させる */
  | { type: "bank" }
  /** ボスの間の扉を開ける(plan/game/dungeon-boss-rooms.md)。ターンは消費しない */
  | { type: "openDoor" }
  /** 横穴(分岐ダンジョン)へ入る(plan/game/dungeon-per-region.md) */
  | { type: "enterBranch" }
  /** 樽守りの技(plan/protagonist-arts.md)を繰り出す */
  | { type: "useArt"; id: ArtId }
  /**
   * レベルアップ時のスキル選択(plan/game/archive/run-build-skills.md)。
   * skillChoiceOfferedで提示された候補以外はresolveSkillChoice側で拒否する
   */
  | { type: "chooseSkill"; id: RunSkillId };

export interface RunOptions {
  seed: number;
  /** 倉庫から持ち込んだアイテム */
  startingItems?: Item[];
  /** この階の階段を降りるとクリア */
  maxDepth?: number;
  /** 出発する階。既知のめざめの階段から選べる。省略時は1階 */
  startDepth?: number;
  /**
   * ダイブ中オートセーブ(plan/mid-dive-autosave.md)からの復帰。
   * 指定した場合、他のオプションは無視してスナップショットの状態をそのまま復元する。
   */
  resume?: RunSnapshot;
  /**
   * 鍛え方(plan/protagonist-training.md、アーカイブ済み)。
   * このダイブ中、レベルアップのたびに自動で適用される。省略時は "balance"
   */
  trainingFocus?: TrainingFocus;
  /**
   * ねむり小屋(plan/monster-fusion.md、アーカイブ済み)から連れ出す仲間。
   * MAX_ALLIES を超える分は無視する。省略時は0体(手ぶらで出発)。
   */
  bringAllies?: StoredMonster[];
  /**
   * モンスター図鑑(plan/monster-compendium.md)を「捕まえた」まで全種埋めて
   * いるか。true ならかがやきの夢のかけらの出現率がわずかに上がる
   */
  compendiumComplete?: boolean;
  /** 難易度モード(plan/difficulty-modes.md)。省略時は "normal" */
  difficulty?: DifficultyMode;
  /**
   * 潜るダンジョン(plan/multiple-dungeons.md)。省略時は表の寝穴("mainCave")。
   * maxDepthを個別指定した場合はそちらを優先する
   */
  dungeonId?: string;
  /**
   * 第三章「仲間探し」の崩落イベント(plan/chapter3-collapse-event.md)用。
   * SaveData.defeatedRegionBosses.length(これまでの撃破済み地方ボス数)。
   * 省略時は0(序章扱い)。骨積みの回廊(第四地方)最終階の崩落は、既に
   * 章立て上の第三章(地方ボスを5体以上撃破済み)まで進んだあとの
   * 「戻り」のダイブでだけ発生させる。そうしないと、まだ壊せる仲間を
   * 持たない初回プレイヤーがこの階で足止めされてしまうため
   */
  defeatedRegionBossCount?: number;
  /**
   * ぬしの置き土産(plan/game/dungeon-boss-rooms.md)。SaveData.
   * defeatedRegionBossesをそのまま渡す。地方ボスのspeciesIdがここに
   * 含まれていれば「2回目以降の踏破」として置き土産を一段軽くする。
   * 省略時は空(=常に初回踏破扱い)
   */
  defeatedRegionBossIds?: readonly string[];
  /**
   * 真の目覚め(plan/true-awakening.md)。SaveData.trueAwakeningClearedを
   * そのまま渡す。true ならかがやきの夢のかけらの出現率がさらに上がる
   * (compendiumCompleteの上乗せぶんとは別枠の恒久ボーナス)
   */
  trueAwakeningCleared?: boolean;
  /**
   * ヨリシロの気分(plan/yorishiro-moods.md)。実際の日付から今日の気分を
   * 決める(moodForDate(todayKey()))のはmain.ts側の責務で、ここへ明示的に
   * 渡す。省略時は補正なしの既定の気分(DEFAULT_MOOD_ID)になる――Gameが
   * 自前で現実の日付を参照すると、既存のseedだけで決定的なテストの多くが
   * 実行日によって結果が変わってしまうため、あえて呼び出し側に委ねている
   */
  moodOverride?: MoodId;
}

export type RunStatus = "playing" | "dead" | "cleared";

/**
 * ダイブ中オートセーブのスナップショット。ターン解決のたびに書き出し、
 * 復帰した瞬間に消費される「1回限りのクラッシュ対策」(plan/mid-dive-autosave.md)。
 * `previousGimmick`・`monsterHouseWarned`・`firstStrikeAvailable` のような
 * 演出寄りの内部状態は含めない(復帰時は初期値からやり直しても実害が小さいため)。
 */
export interface RunSnapshot {
  rngState: number;
  maxDepth: number;
  depth: number;
  floor: FloorState;
  player: PlayerState;
  allies: AllyActor[];
  status: RunStatus;
  turnCount: number;
  endReason: string;
  actorIdCounter: number;
  itemUidCounter: number;
  barrelIdCounter: number;
  /** 鍛え方(plan/protagonist-training.md)。復帰後もこのダイブの方針を引き継ぐ */
  trainingFocus: TrainingFocus;
  /** 潜っているダンジョン(plan/multiple-dungeons.md)。復帰後の階移動で出現テーブルを揃えるのに使う */
  dungeonId: string;
  /** 樽比べ(plan/tarukurabe-minigame.md)。専用モード中でなければ常に既定値 */
  tarukurabeScore: number;
  tarukurabeBarrelsLeft: number;
  tarukurabeScoredLanes: number[];
  /** レベルアップ時のスキル選択(plan/game/archive/run-build-skills.md)。ダイブ限り */
  runSkills: RunSkillId[];
  pendingSkillChoice: RunSkillId[] | null;
  pendingLevelUpChoices: number;
}

/**
 * 草を「使った」ときに満腹度も少し回復する(plan/herb-satiety-bonus.md)。
 * 食料(45)の1/9程度に抑えて、草を食料の代替にはしない
 */
const HERB_SATIETY_BONUS = 5;
/** このターンごとにモンスターが1体湧く */
const SPAWN_INTERVAL = 45;

/** 第八地方(めざめの前庭)固有ギミック(plan/dream-garden-mosaic.md): 抽選対象の地方番号(第二〜第七地方) */
const MOSAIC_CANDIDATE_REGIONS = [2, 3, 4, 5, 6, 7];

/**
 * 地方固有の地形ギミック配置フック(plan/wetland-quagmire.md・plan/spore-grove.md・
 * plan/waterfall-torrent.md・plan/festival-mirage.md)。地方番号→フロア生成後に
 * 呼ぶ配置関数。フックを持たない地方(第一・第四・第六・第八)はここには現れない
 * (第四地方はモンスターハウス倍率のみ、第六地方は別メソッドの物音ギミック、
 * 第八地方はモザイク抽選そのもの)
 */
const REGION_GIMMICK_PLACERS: Readonly<
  Record<number, (rng: Rng, floor: FloorState, ids: IdSource) => void>
> = {
  2: (rng, floor) => placeQuagmireTiles(rng, floor),
  3: (rng, floor) => placeSporeRooms(rng, floor),
  5: (rng, floor) => placeTorrentTiles(rng, floor),
  7: (rng, floor, ids) => {
    placeDecoyStairs(rng, floor);
    placeDecoyBarrels(rng, floor, ids);
  },
};

/** 第四地方(骨積みの回廊)。モンスターハウス出現率の乗数は regions.ts のデータに持たせている */
const BONEPILE_REGION = regionByIndex(4);

/** 松明(plan/region-darkness.md): 使うと持続する視界拡張の効果時間(ターン)。数値は初期案 */
const TORCH_DURATION_TURNS = 20;

/**
 * 山の芯(plan/mountain-core.md): 最終フロア到達時の固定の会話イベント。
 * design/characters.mdの頭目マサカリのドンズルを踏まえた短い掛け合い。
 * 台詞の実際の執筆はプランのスコープ外だったため、実装時に新規に書いた
 * (design/story.mdの「倒す」より「山の正体を思い知らせ、出て行かせる」
 * という終章方針どおり、戦闘には発展させない)
 */
const MOUNTAIN_CORE_DIALOGUE: readonly string[] = [
  "マサカリのドンズル「ここまで来たか、小僧。だが引き返せ、この山はワシらの資源だ」",
  "ガルド「――違う。この山は、ヨリシロっていう生きものの、眠りそのものなんだ」",
  "ドンズル「ヨリシロ……? 寝言を抜かすな。夢のかけらは金になる、それで十分だろう」",
  "杭を打ち込む音が響くたび、あたり一帯がかすかに震えているのに気づく。",
  "ドンズル「……まさか、本当に……?」",
  "ドンズル「……分かった。今日のところは引き上げる。だが、忘れたわけじゃないぞ」",
  "近道屋の一団が、山を降りていく足音が遠ざかっていった。",
];
/** 松明: 見晴らしのはちまき(+1)より強い光源として、くらやみの階の暗さを大きく緩和する */
const TORCH_VISION_BONUS = 2;

/**
 * 真の目覚め(plan/true-awakening.md): 「はじめの夢」との決着イベント。
 * design/postgame.mdの「もう独りではない」と伝わる決着方針どおり、
 * HPが0になっても通常のkillActor(討伐・ドロップ・経験値)処理には進まず、
 * この専用イベントに分岐する。台詞の執筆はプランのスコープ外だったため、
 * 実装時に新規に書いた
 */
const TRUE_AWAKENING_INTRO: readonly string[] = [
  "はじめの夢「……だれも、いない。ずっと、そうだった」",
  "はじめの夢「あなたも、いつか、いなくなる。みんな、そうだった」",
];

/**
 * 締めの一言は、現在連れている仲間のうち最も絆(なじみ)が深い個体の段階で
 * 出し分ける。仲間を1体も連れていない場合は別枠(TRUE_AWAKENING_FAREWELL_SOLO)
 */
const TRUE_AWAKENING_FAREWELL_SOLO = "ガルド「独りで来たけど……ここまで、独りじゃなかったよ」";
const TRUE_AWAKENING_FAREWELL_BY_BOND_STAGE: Readonly<Record<BondStage, string>> = {
  none: "ガルド「まだ知り合ったばかりの仲間だけど、ちゃんとここにいるよ」",
  familiar: "ガルド「一緒に潜ってきた仲間が、ここにいる」",
  close: "ガルド「ずっと並んで歩いてきた仲間が、ちゃんとここにいるよ」",
  irreplaceable: "ガルド「かけがえのない仲間と、ここまで来た。もう独りじゃない」",
};

const TRUE_AWAKENING_CLOSING: readonly string[] = [
  "はじめの夢は、ふっと軽くなったように溶けて消えていった。",
  "山は、ゆっくりとした寝息に戻っていく。",
];

// ---- 元素タル(plan/game/archive/barrel-arts.md) ----
/** あける(部屋全体を明るくする)の視界拡張。強化版は視界+1 */
const LIGHT_BARREL_OPEN_VISION = 2;
/** 頭上に持つ(光タル): 視界+2(ほのかなあかり等と同じ単純加算) */
const LIGHT_BARREL_CARRY_VISION_BONUS = 2;
// ---- plan/tarukurabe-minigame.md ----
/** 持ち込めるタルの数(固定10個)。専用モード内で完結し、通常の倉庫は消費しない */
const TARUKURABE_BARREL_COUNT = 10;
/**
 * 遠の的(距離9)は通常のBARREL_RANGE(8)より遠いため、専用モードだけ
 * タルの飛距離を伸ばす(他のダイブの投擲距離には一切影響しない)
 */
const TARUKURABE_THROW_RANGE = 9;
/**
 * 満点。的の配点(近1・中2・遠3)の合計と一致させている。計画書の報酬節は
 * 「満点9点」としていたが、配点表(本文書内で「確定」扱い)と整合しないため、
 * 配点表を正としてこちらを6に読み替えた(詳細はアーカイブノート参照)。
 * save.ts(実績・報酬判定)からも参照するためexportする
 */
export const TARUKURABE_PERFECT_SCORE = 6;

interface TarukurabeTargetLayout {
  /** 部屋のローカル座標(プレイヤーの投擲台を基準にした相対値ではなく絶対値) */
  pos: Vec2;
  points: number;
}

/**
 * 樽比べの部屋。既存の乱数生成(generateFloor)は使わず、山の芯・真の目覚めの
 * 「短い固定進行」の方針をさらに一歩進めて、手作りの固定Floorを直接組み立てる
 * (座標を毎回同じにすることで「自己ベストを縮める」比較が成立する、という
 * 計画書の要件を、生成パラメータの調整ではなく確実に満たすため)。
 *
 * プレイヤーは部屋中央寄りの投擲台(TARUKURABE_PLAYER_POS)に立ち、以後移動
 * できない。的は北(近・距離3)・東(中・距離6)・南(遠・距離9)の3方向に
 * 1つずつ配置する。「大きい的ほど命中判定のマス数が広い」という計画書の
 * 表現は、この投擲(8方向・1マス単位の直線)の仕組みでは的の物理的な広さを
 * 増やす手段が無いため、距離と配点だけで難度カーブを表現する簡略化とした
 */
const TARUKURABE_ROOM_WIDTH = 11;
const TARUKURABE_ROOM_HEIGHT = 17;
const TARUKURABE_PLAYER_POS: Vec2 = { x: 2, y: 5 };
const TARUKURABE_TARGETS: readonly TarukurabeTargetLayout[] = [
  { pos: { x: 2, y: 2 }, points: 1 }, // 近(北、距離3)
  { pos: { x: 8, y: 5 }, points: 2 }, // 中(東、距離6)
  { pos: { x: 2, y: 14 }, points: 3 }, // 遠(南、距離9)
];

/** アイテムの飛距離 */
const ITEM_THROW_RANGE = 10;

/** 忘れ物蔵(plan/lost-and-found-vault.md)。隠し壁へバンプするたびに崩れる確率 */
const SECRET_PASSAGE_REVEAL_CHANCE = 0.25;

/** あうんの呼吸(plan/ally-field-gimmicks.md)。障害物の前で表示するヒント文言 */
const FIELD_SKILL_HINTS: Record<FieldSkillId, string> = {
  break: "力持ちの",
  squeeze: "すばしっこい",
  leap: "跳べる",
  dig: "掘れる",
};

/** posが、部屋の外縁からチェビシェフ距離rangeマス以内にあるか(部屋の中ならtrue) */
function isNearRoom(room: Room, pos: Vec2, range: number): boolean {
  const dx = Math.max(room.x - pos.x, 0, pos.x - (room.x + room.w - 1));
  const dy = Math.max(room.y - pos.y, 0, pos.y - (room.y + room.h - 1));
  return Math.max(dx, dy) <= range;
}

/**
 * 武器の系統id(plan/challenge-achievements.md)。基本形・上位形は同じ
 * attackPatternを持つので、そのまま系統として使える(plan/protagonist-
 * weapons.md)。なた系統(attackPattern未指定)は"basic"に統一する
 */
function weaponKindOf(defId: string): string {
  return itemDef(defId).attackPattern ?? "basic";
}

/**
 * 横穴(分岐ダンジョン、plan/game/dungeon-per-region.md)に入っているあいだ、
 * 元いた地方ダンジョン側の状態を退避しておく入れ物。返ってきたときに
 * そのまま復元する(プレイヤー・仲間・所持品・ターン数などダイブ全体に
 * かかる状態はいじらず、「どのダンジョンの何階を今表示しているか」だけを
 * 一時的に差し替える)
 */
interface HostDungeonContext {
  dungeon: DungeonDef;
  maxDepth: number;
  depth: number;
  floor: FloorState;
  previousGimmick?: FloorGimmickKind;
  mosaicRegions: number[];
  monsterHouseWarned: boolean;
  shopSeenThisRun: boolean;
}

export class Game {
  readonly rng: Rng;
  maxDepth: number;
  floor!: FloorState;
  player: PlayerState;
  depth = 0;
  turnCount = 0;
  status: RunStatus = "playing";
  /** 死亡・クリアの理由。UIの表示に使う */
  endReason = "";
  /** 腕試しの間(plan/hidden-dungeon.md)の記録用。このダイブでプレイヤーが受けた被ダメージの累計 */
  damageTakenThisRun = 0;
  /** 松明(plan/region-darkness.md)。残りターン数。0なら効果切れ */
  private torchTurnsLeft = 0;
  /** ゆめわざ「ほのかなあかり」。残りターン数。0なら効果切れ */
  private lanternGlowTurns = 0;
  /** ゆめわざ「ゆめのかけぶとん」。残りターン数。0なら効果切れ */
  private partyGuardTurns = 0;
  /** ぬしのゆめわざ「こだまのおたけび」。残りターン数。0なら効果切れ */
  private echoAttackTurns = 0;
  /** 元素タル(plan/game/archive/barrel-arts.md)。光タルをあけた効果の残りターン数。0なら効果切れ */
  private lightBarrelTurns = 0;
  /** 実績帳「挑戦」カテゴリ(plan/challenge-achievements.md)。杖・巻物・食料等を使ったか */
  usedItemThisRun = false;
  /**
   * 山の芯(plan/mountain-core.md)。このダイブ中に撃破した地方ボスの
   * speciesId(重複しない)。SaveData.defeatedRegionBossesへの反映は
   * 呼び出し側(main.ts、recordRun経由)が行う
   */
  readonly defeatedRegionBossesThisRun = new Set<string>();
  /** 実績帳「挑戦」カテゴリ。武器を持ち替えたか(素手・未装備からの初回装備は数えない) */
  usedMultipleWeaponsThisRun = false;
  /**
   * 実績帳「挑戦」カテゴリ。このダイブで最後に装備した武器の系統
   * (weaponKindOf、"attackPattern未指定"の系統は"basic"文字列にする)。
   * undefinedは「まだ一度も武器を装備していない」を表す専用のセンチネル
   */
  private weaponKindThisRun: string | undefined;

  /** 連れている仲間。フロアをまたいで付いてくるので、floor とは別に持つ */
  allies: AllyActor[] = [];

  // ---- plan/game/archive/run-build-skills.md ----
  /** そのダイブ限りで身につけたスキル。SaveDataには持たせない(ダイブ限り) */
  runSkills: RunSkillId[] = [];
  /** 提示中の3択の状態(domain/player/runSkills.ts)。nullなら提示していない */
  private skillChoiceState: SkillChoiceState = createSkillChoiceState();

  // ---- plan/tarukurabe-minigame.md ----
  /** このセッションの合計得点 */
  tarukurabeScore = 0;
  /** 残りのタル数(専用モードに入った時点でTARUKURABE_BARREL_COUNTになる) */
  tarukurabeBarrelsLeft = 0;
  /** 命中済みの的の得点(重複加算を防ぐ集合。1的=1得点なので値がそのままキーになる) */
  private readonly tarukurabeScoredLanes = new Set<number>();

  /** 直前のフロアに乗っていたギミック。連続で同じものを選ばないための記憶 */
  private previousGimmick?: FloorGimmickKind;

  /**
   * 第八地方(めざめの前庭)固有ギミック(plan/dream-garden-mosaic.md): 今のフロアで
   * 「実際のdepthの代わりに扱う」地方番号(第二〜第七地方の部分集合、要素数1〜2)。
   * 43〜48階以外では常に空配列
   */
  private mosaicRegions: number[] = [];

  /** そのフロアのモンスターハウスについて、もう警告を出したか */
  private monsterHouseWarned = false;

  /**
   * 近道屋の出店で万引きしたことがあるか(plan/shops-and-thieves.md)。
   * 一度でもすると、そのラン中ずっと以後の出店の売値が割高になる
   */
  private shopWary = false;

  /** 双樽鉤の「そのラン最初の1手は必ず会心」がまだ使われていないか */
  private firstStrikeAvailable = true;

  /**
   * 「1ラン1回」の特技(ふいうち・ふんばり・ふいのいちげき・とんずら)を、
   * そのダイブで既に使った仲間のid(plan/monster-fusion.md、
   * plan/monster-compendium.md)
   */
  private readonly oncePerRun = new OncePerRunTracker();
  /** このターン被弾したアクターのid。regenIfUnhit・特技「しずけさのいやし」の判定に使う */
  private hitThisTurn = new Set<number>();
  /** 遭遇済み(図鑑「見た」)として、このダイブで既に通知した種族id(plan/monster-compendium.md) */
  private readonly sightedSpecies = new Set<string>();

  /** このダイブの鍛え方(plan/protagonist-training.md)。レベルアップのたびに適用する */
  private trainingFocus: TrainingFocus = "balance";

  /** 図鑑を全種「捕まえた」まで埋めているか(plan/monster-compendium.md) */
  private compendiumComplete = false;

  /** 真の目覚め(plan/true-awakening.md)を達成済みか。かがやきの夢のかけら出現率の恒久ボーナスに使う */
  private trueAwakeningCleared = false;

  /** ヨリシロの気分(plan/yorishiro-moods.md)。ダイブ開始時に1つ確定し、ダイブ中は変わらない */
  private mood: MoodDef = moodDef(DEFAULT_MOOD_ID);

  /** 難易度モード(plan/difficulty-modes.md) */
  private difficulty: DifficultyMode = "normal";

  /** 潜っているダンジョン(plan/multiple-dungeons.md) */
  private dungeon: DungeonDef = dungeonById(REGION_DUNGEON_IDS[0]);

  /**
   * 横穴(分岐ダンジョン、plan/game/dungeon-per-region.md)に入っているあいだだけ
   * 非null。元いた地方ダンジョンの階へ戻るための退避状態
   */
  private hostContext: HostDungeonContext | null = null;

  /**
   * 第三章「仲間探し」の崩落イベント(plan/chapter3-collapse-event.md)用。
   * SaveData.defeatedRegionBosses.length(このダイブ開始前の撃破済み地方ボス数)。
   * 表の寝穴の地方分割(plan/game/dungeon-per-region.md)前は最深到達記録を
   * 使っていたが、1ダイブが1地方(6階)を超えなくなり、最深到達記録が
   * 章の進行度の指標として機能しなくなったため、撃破済み地方ボス数に置き換えた
   */
  private readonly defeatedRegionBossCountAtStart: number;

  /**
   * ぬしの置き土産(plan/game/dungeon-boss-rooms.md)。このダイブ開始前に
   * 撃破済みだった地方ボスのspeciesId一覧。killActorで「初回踏破か」を
   * 判定するのに使う(SaveData.defeatedRegionBossesはダイブ完了後にしか
   * 反映されないため、開始時点のスナップショットをそのまま保持する)
   */
  private readonly defeatedRegionBossIdsAtStart: ReadonlySet<string>;

  /** 潜っているダンジョンid(plan/multiple-dungeons.md)。記録の間の集計などに使う */
  get dungeonId(): string {
    return this.dungeon.id;
  }

  /**
   * 横穴(分岐ダンジョン、plan/game/dungeon-per-region.md)に入っているあいだか。
   * ダイブ中オートセーブ(plan/mid-dive-autosave.md)は、この間だけ書き出しを
   * 止める用途に使う。hostContextはRunSnapshotに含めておらず(横穴側の
   * floorをまるごと退避した2重状態を復元する仕組みまでは持たないため)、
   * 横穴の中でクラッシュしても「元の地方ダンジョンへ戻れなくなる」ことがない
   * よう、直近の(横穴に入る前の)スナップショットをそのまま残す
   */
  get inBranchDungeon(): boolean {
    return this.hostContext !== null;
  }

  /** このダイブの気分(plan/yorishiro-moods.md)。ダイブ中は固定 */
  get moodId(): MoodId {
    return this.mood.id;
  }

  /** そのダイブ中に近道屋の出店が一度でも出たか。shopRateMulを指定したダンジョンで
   * 最終階まで一度も出なかった場合に、最終階で必ず出すための判定に使う */
  private shopSeenThisRun = false;

  private actorIdCounter = 1;
  private itemUidCounter = 1;
  private barrelIdCounter = 1;
  private readonly ids: IdSource;

  constructor(opts: RunOptions) {
    this.ids = {
      nextActorId: () => ++this.actorIdCounter,
      nextItemUid: () => ++this.itemUidCounter,
      nextBarrelId: () => ++this.barrelIdCounter,
    };

    if (opts.resume) {
      // 復帰時は新しくフロアを生成しないため使わないが、readonlyの初期化として必要
      this.defeatedRegionBossCountAtStart = 0;
      // 復帰後にボスを倒す稀なケースでは常に初回踏破扱いになる(クラッシュ
      // 復帰は演出寄りの状態を厳密に保つ設計ではないため許容する)
      this.defeatedRegionBossIdsAtStart = new Set();
      const s = opts.resume;
      this.rng = Rng.fromState(s.rngState);
      this.maxDepth = s.maxDepth;
      this.actorIdCounter = s.actorIdCounter;
      this.itemUidCounter = s.itemUidCounter;
      this.barrelIdCounter = s.barrelIdCounter;
      this.player = s.player;
      this.depth = s.depth;
      this.floor = s.floor;
      this.allies = s.allies;
      this.status = s.status;
      this.turnCount = s.turnCount;
      this.endReason = s.endReason;
      this.trainingFocus = s.trainingFocus;
      this.dungeon = dungeonById(s.dungeonId);
      this.tarukurabeScore = s.tarukurabeScore;
      this.tarukurabeBarrelsLeft = s.tarukurabeBarrelsLeft;
      for (const points of s.tarukurabeScoredLanes) this.tarukurabeScoredLanes.add(points);
      // run-build-skills.md導入前のスナップショットには無いフィールドなので、
      // 欠けていても壊れないようにする
      this.runSkills = s.runSkills ?? [];
      this.skillChoiceState = {
        pendingSkillChoice: s.pendingSkillChoice ?? null,
        pendingLevelUpChoices: s.pendingLevelUpChoices ?? 0,
      };

      // JSON化を経由すると、本来は同じオブジェクトを指していたはずの
      // player/allies と floor.actors 内の対応する要素が別オブジェクトに
      // なってしまう。以後のコードは「floor.actors 内の当人 === player/allies
      // の要素」という前提で書かれているため、id を頼りに参照を統一し直す
      const canonical = new Map<number, Actor>();
      canonical.set(this.player.id, this.player);
      for (const ally of this.allies) canonical.set(ally.id, ally);
      this.floor.actors = this.floor.actors.map((a) => canonical.get(a.id) ?? a);

      updateVisibility(this.floor, this.player.pos, this.visionExtraRange());
      this.syncEquippedWeaponModel();
      return;
    }

    this.rng = new Rng(opts.seed);
    this.defeatedRegionBossCountAtStart = opts.defeatedRegionBossCount ?? 0;
    this.defeatedRegionBossIdsAtStart = new Set(opts.defeatedRegionBossIds ?? []);
    this.dungeon = dungeonById(opts.dungeonId ?? REGION_DUNGEON_IDS[0]);
    this.maxDepth = opts.maxDepth ?? this.dungeon.maxDepth ?? Number.POSITIVE_INFINITY;
    this.trainingFocus = opts.trainingFocus ?? "balance";
    this.compendiumComplete = opts.compendiumComplete ?? false;
    this.trueAwakeningCleared = opts.trueAwakeningCleared ?? false;
    this.mood = moodDef(opts.moodOverride ?? DEFAULT_MOOD_ID);
    this.difficulty = opts.difficulty ?? "normal";
    this.player = createPlayer(1);

    for (const item of opts.startingItems ?? []) {
      // 持ち込み品の uid は採番済みなので、衝突しないようカウンタを進めておく
      this.itemUidCounter = Math.max(this.itemUidCounter, item.uid);
      addItem(this.player.inventory, item);
    }

    // ねむり小屋(plan/monster-fusion.md)から連れ出した仲間を、盤面のアクターとして起こす。
    // 実際の配置は enterFloor が行う(仲間は毎回プレイヤーの周りに並べ直される)
    for (const stored of (opts.bringAllies ?? []).slice(0, MAX_ALLIES)) {
      this.allies.push(createAllyFromStored(this.ids.nextActorId(), stored, this.player.pos));
    }

    this.syncEquippedWeaponModel();
    const startDepth = Math.min(Math.max(1, Math.floor(opts.startDepth ?? 1)), this.maxDepth);
    this.enterFloor(startDepth);
  }

  /**
   * 装備した武器を手に持たせる(plan/equipped-weapon-visual.md)。
   * view層(Stage)はアイテム定義を知らないので、装備状態から見た目用の
   * モデル名だけを導出してActorに載せておく。command() の中で毎ターン
   * 呼ぶことで、equip・drop・売却などweaponUidが変わりうるすべての経路を
   * 個別に追わずに済む
   */
  private syncEquippedWeaponModel(): void {
    this.player.equippedWeaponModel = equippedWeaponModel(this.player.inventory) ?? undefined;
  }

  /** ダイブ中オートセーブ用のスナップショットを書き出す */
  toSnapshot(): RunSnapshot {
    return {
      rngState: this.rng.getState(),
      maxDepth: this.maxDepth,
      depth: this.depth,
      floor: this.floor,
      player: this.player,
      allies: this.allies,
      status: this.status,
      turnCount: this.turnCount,
      endReason: this.endReason,
      actorIdCounter: this.actorIdCounter,
      itemUidCounter: this.itemUidCounter,
      barrelIdCounter: this.barrelIdCounter,
      trainingFocus: this.trainingFocus,
      dungeonId: this.dungeon.id,
      tarukurabeScore: this.tarukurabeScore,
      tarukurabeBarrelsLeft: this.tarukurabeBarrelsLeft,
      tarukurabeScoredLanes: [...this.tarukurabeScoredLanes],
      runSkills: [...this.runSkills],
      pendingSkillChoice: this.skillChoiceState.pendingSkillChoice
        ? [...this.skillChoiceState.pendingSkillChoice]
        : null,
      pendingLevelUpChoices: this.skillChoiceState.pendingLevelUpChoices,
    };
  }

  // ------------------------------------------------------------ フロア遷移

  private enterFloor(depth: number): void {
    this.depth = depth;
    this.monsterHouseWarned = false;

    // 樽比べ(plan/tarukurabe-minigame.md): 通常の乱数生成(generateFloor)を
    // 経由せず、専用の手作り固定Floorを直接組み立てる。仲間・持ち込み品の
    // 配置(通常はこの関数の末尾で行う)も行わない――専用モードは常にソロで、
    // 持ち込み品は使い道が無いため
    if (this.dungeon.id === TARUKURABE_ID) {
      this.enterTarukurabeFloor();
      return;
    }
    // ひなたの寝穴(plan/game/tutorial-dungeon.md): 通常のフロア生成を経由せず、
    // 階ごとに手作りの固定Floorを直接組み立てる(tarukurabeと同じ考え方)。
    // 罠・ギミック・モンスターハウスは一切乗らず、出現はぷるんだけになる
    if (this.dungeon.id === HINATA_ID) {
      this.enterHinataFloor(depth);
      return;
    }
    // 地方ボス(plan/region-bosses.md): 地方ダンジョンのボス階には、通常の野生モンスターも
    // フロアギミックも乗せない(ボス以外の変数を減らす、本文どおりの方針)。
    // 腕試しの間(plan/hidden-dungeon.md)は、全階がボス階の再戦だけで構成される
    const dungeonRegionIndex = regionIndexForDungeonId(this.dungeon.id);
    const bossSpeciesId =
      dungeonRegionIndex !== undefined && depth === this.dungeon.maxDepth
        ? regionByIndex(dungeonRegionIndex).bossSpeciesId
        : this.dungeon.id === TRIAL_CHAMBER_ID
          ? REGION_BOSS_ORDER[depth - 1]
          : // 真の目覚め(plan/true-awakening.md): 最終階にだけ「はじめの夢」を配置する
            this.dungeon.id === TRUE_AWAKENING_ID && depth === this.maxDepth
            ? HAJIME_NO_YUME_ID
            : undefined;

    // ボスの間(plan/game/dungeon-boss-rooms.md): 地方ダンジョンのボス階だけ、通常の
    // フロア生成(generateFloor)を経由せず、前室→扉→ボスの間の固定構造を組む。
    // 腕試しの間・真の目覚めは対象外(docの対象外どおり。それぞれ既存の
    // generateFloor経由の挙動のまま)
    if (dungeonRegionIndex !== undefined && bossSpeciesId) {
      this.enterBossFloor(depth, bossSpeciesId);
      return;
    }

    // 第八地方(めざめの前庭)固有ギミック(plan/dream-garden-mosaic.md): 第八地方
    // ダンジョンの各階は、第二〜第七地方の固有ギミックのうち1〜2種類を
    // ランダムに選んで、そのフロアだけに適用する
    this.mosaicRegions =
      dungeonRegionIndex === 8 ? this.rng.shuffled(MOSAIC_CANDIDATE_REGIONS).slice(0, this.rng.int(1, 2)) : [];
    const gimmick = bossSpeciesId
      ? undefined
      : pickFloorGimmick(
          this.rng,
          depth,
          this.previousGimmick,
          GIMMICK_CHANCE_MULTIPLIER[this.difficulty] * (this.mood.floorGimmickRateMul ?? 1),
          dungeonRegionIndex,
          isCheckpointFloor(this.dungeon.id, depth),
        );
    this.previousGimmick = gimmick;
    this.floor = generateFloor(this.rng, {
      depth,
      gimmick,
      monsterHouseChanceMultiplier: bossSpeciesId
        ? 0
        : MONSTER_HOUSE_CHANCE_MULTIPLIER[this.difficulty] *
          (this.dungeon.monsterHouseRateMul ?? 1) *
          (this.mood.monsterHouseRateMul ?? 1) *
          // 第四地方(骨積みの回廊)固有ギミック(plan/bonepile-corridor.md): モンスターハウスが
          // 出やすい。骨積みの回廊ダンジョン自身の分はDungeonDef.monsterHouseRateMul
          // (dungeons.tsでregions.tsのデータをそのまま流用)で既にかかっているため、
          // ここでは第八地方のモザイク抽選で骨積みの回廊が選ばれた場合だけ追加で掛ける
          (this.mosaicRegions.includes(BONEPILE_REGION.index) ? (BONEPILE_REGION.monsterHouseRateMul ?? 1) : 1),
      shopChanceMultiplier: bossSpeciesId
        ? 0
        : (this.dungeon.shopRateMul ?? 1) * (this.mood.shopRateMul ?? 1),
      forceShop:
        !bossSpeciesId &&
        this.dungeon.shopRateMul !== undefined &&
        depth === this.maxDepth &&
        !this.shopSeenThisRun,
    });
    const start = choosePlayerStart(this.rng, this.floor);
    this.player.pos = start;
    this.floor.actors.push(this.player);
    if (this.floor.rooms.some((r) => r.kind === "shop")) this.shopSeenThisRun = true;
    const boostedItemDefId = hasEquipEffect(this.player.inventory, "dustLureBoost") ? "hokoraDust" : undefined;
    const shiningChanceMultiplier =
      (this.trueAwakeningCleared
        ? TRUE_AWAKENING_SHINING_MULTIPLIER
        : this.compendiumComplete
          ? COMPENDIUM_COMPLETE_SHINING_MULTIPLIER
          : 1) *
      SHINING_CHANCE_DIFFICULTY_MULTIPLIER[this.difficulty] *
      (this.mood.rareSpawnRateMul ?? 1);
    populateFloor(this.rng, this.floor, this.ids, start, {
      boostedItemDefId,
      shopWary: this.shopWary,
      shiningChanceMultiplier,
      monsterAtkMultiplier: MONSTER_ATK_MULTIPLIER[this.difficulty] * (this.mood.monsterAtkMulAfterAware ?? 1),
      goldRewardMultiplier: GOLD_REWARD_MULTIPLIER[this.difficulty] * (this.mood.goldRateMul ?? 1),
      speciesDepthOffset: this.dungeon.floorOffset ?? 0,
      bossSpeciesId,
      checkpointFloor: isCheckpointFloor(this.dungeon.id, depth),
      monsterCountMultiplier: this.dungeon.monsterCountMul ?? 1,
      // 夜ごとの夢のモンスター強化カーブ(plan/nightly-dream-scaling.md)
      statMultiplier: this.dungeon.id === NIGHTLY_DREAM_ID ? nightlyDreamStatMultiplier(depth) : 1,
      // ヨリシロの気分(plan/yorishiro-moods.md)
      itemCountMultiplier: this.mood.dropRateMul ?? 1,
      thiefWeightMultiplier: this.mood.thiefRateMul ?? 1,
    });

    // 忘れ物蔵(plan/lost-and-found-vault.md): 地方ダンジョンの2階目にだけ、
    // 隠し通路の候補を1本配置する
    if (dungeonRegionIndex !== undefined && depth === 2) {
      placeSecretPassage(this.rng, this.floor, `region${dungeonRegionIndex}`);
    }

    // 横穴(分岐ダンジョン、plan/game/dungeon-per-region.md): 特定の地方ダンジョンの
    // 特定階にだけ、低確率で入り口を生成する
    const branchSpec = branchDungeonSpecFor(this.dungeon.id, depth);
    if (branchSpec && this.rng.chance(branchSpec.chance)) {
      const pos = findFreeTile(this.rng, this.floor, { roomsOnly: true, avoid: [start] });
      if (pos) this.floor.branchEntrance = { pos, dungeonId: branchSpec.branchDungeonId };
    }

    // 地方固有の地形ギミック(plan/wetland-quagmire.md 等): 自分の地方ダンジョンか、
    // 第八地方のモザイク抽選(plan/dream-garden-mosaic.md)でその地方番号が選ばれていれば、
    // REGION_GIMMICK_PLACERS に登録された地方ごとの配置フックを呼ぶ
    if (dungeonRegionIndex !== undefined) {
      for (const region of REGIONS) {
        const place = REGION_GIMMICK_PLACERS[region.index];
        if (place && this.regionGimmickApplies(region.index)) {
          place(this.rng, this.floor, this.ids);
        }
      }
    }

    // 第三章「仲間探し」の崩落イベント(plan/chapter3-collapse-event.md): 骨積みの
    // 回廊(第四地方)最終階の階段部屋の出口に、瓦礫の崩落を固定配置する。
    // 既にdeepest>=30(章立て上の第三章)まで進んだあとの「戻り」のダイブ
    // でだけ発生させる(初回プレイヤーがこの階で足止めされないように)
    if (isChapter3CollapseFloor(this.dungeon.id, depth) && storyChapter(this.defeatedRegionBossCountAtStart, false) >= 3) {
      placeChapter3CollapseObstacle(this.floor);
    }

    // 仲間は階段について来る。プレイヤーの周りの空いたマスに並べる
    for (const ally of this.allies) {
      const spot = this.freeSpotNear(start);
      if (!spot) continue;
      ally.pos = spot;
      ally.aware = true;
      this.floor.actors.push(ally);
    }

    updateVisibility(this.floor, this.player.pos, this.visionExtraRange());
  }

  /**
   * 横穴(分岐ダンジョン、plan/game/dungeon-per-region.md)に入る。今いる
   * 地方ダンジョンの状態(ダンジョン・最大階数・現在階・フロア)を退避し、
   * 分岐ダンジョンの1階目を通常どおり生成する。プレイヤー・仲間・持ち物・
   * ターン数・気分・難易度などダイブ全体にかかる状態はいじらない
   */
  private enterBranchDungeon(branchDungeonId: string, events: GameEvent[]): boolean {
    if (this.hostContext) return false; // 横穴の中からさらに横穴には入れない(入れ子なし)
    this.hostContext = {
      dungeon: this.dungeon,
      maxDepth: this.maxDepth,
      depth: this.depth,
      floor: this.floor,
      previousGimmick: this.previousGimmick,
      mosaicRegions: this.mosaicRegions,
      monsterHouseWarned: this.monsterHouseWarned,
      shopSeenThisRun: this.shopSeenThisRun,
    };
    this.dungeon = dungeonById(branchDungeonId);
    this.maxDepth = this.dungeon.maxDepth ?? Number.POSITIVE_INFINITY;
    this.previousGimmick = undefined;
    this.mosaicRegions = [];
    // 横穴自体はshopRateMul未設定でforceShop抽選の対象外だが、万一の出店
    // 出現がホスト側のshopSeenThisRunを誤って上書きしないよう、横穴の中では
    // 一旦falseから始める(戻るときにホスト側の値を必ず復元する)
    this.shopSeenThisRun = false;
    this.enterFloor(1);
    events.push({ type: "message", text: `${this.dungeon.name}へ入った。` });
    return true;
  }

  /**
   * 横穴(分岐ダンジョン)を踏破したときに呼ぶ。退避しておいた元の地方
   * ダンジョンの状態(その階の盤面そのもの、途中で倒した敵・拾った物も
   * 含めて)をそのまま復元する。ダイブ自体は終わらない(status="playing"
   * のまま)ため、main.ts側の全滅・踏破の記録処理は一切通らない
   */
  private returnFromBranchDungeon(events: GameEvent[]): void {
    const host = this.hostContext;
    if (!host) return;
    this.hostContext = null;
    this.dungeon = host.dungeon;
    this.maxDepth = host.maxDepth;
    this.depth = host.depth;
    this.floor = host.floor;
    this.previousGimmick = host.previousGimmick;
    this.mosaicRegions = host.mosaicRegions;
    this.monsterHouseWarned = host.monsterHouseWarned;
    this.shopSeenThisRun = host.shopSeenThisRun;
    // 入ってきた入り口のマスへ戻す。横穴は1階につき一度きりなので、
    // 戻ったら入り口自体は消す
    if (this.floor.branchEntrance) this.player.pos = { ...this.floor.branchEntrance.pos };
    this.floor.branchEntrance = undefined;
    updateVisibility(this.floor, this.player.pos, this.visionExtraRange());
    events.push({ type: "message", text: `${host.dungeon.name}へ戻ってきた。` });
  }

  /**
   * 樽比べ(plan/tarukurabe-minigame.md)。手作りの固定Floorを直接組み立てる。
   * generateFloor/populateFloorは一切呼ばない(乱数要素を排除し、毎回同じ
   * 配置にするため)。仲間・持ち込み品は盤面に出さない(専用モードは常にソロ)
   */
  private enterTarukurabeFloor(): void {
    const width = TARUKURABE_ROOM_WIDTH;
    const height = TARUKURABE_ROOM_HEIGHT;
    const tiles: Tile[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const isWall = x === 0 || y === 0 || x === width - 1 || y === height - 1;
        tiles.push({
          kind: isWall ? TILE_WALL : TILE_ROOM,
          roomId: isWall ? -1 : 0,
          explored: false,
          visible: false,
        });
      }
    }

    this.floor = {
      depth: this.depth,
      width,
      height,
      tiles,
      rooms: [{ id: 0, x: 1, y: 1, w: width - 2, h: height - 2 }],
      // 投擲台から動けないため、実際には誰も踏まない位置(降りる/区切るコマンドは
      // 「ここには階段がない」で無害に弾かれる)
      stairs: { x: width - 2, y: height - 2 },
      actors: [],
      items: [],
      traps: [],
      barrels: [],
      goldPiles: [],
      fieldObstacles: [],
      secretPassages: [],
    };

    this.player.pos = { ...TARUKURABE_PLAYER_POS };
    this.player.facing = 0; // 北(近の的)を向いて開始
    this.player.carrying = null;
    this.floor.actors.push(this.player);

    for (const target of TARUKURABE_TARGETS) {
      this.floor.actors.push({
        id: this.ids.nextActorId(),
        kind: "target",
        name: "的",
        // 専用の3Dモデルは新規に作らず、既存の空樽モデルを的として流用する
        // (BarrelKindのempty用modelと同じ"barrel"。BARREL_MODELS定数は
        // modelList.ts側にのみ定義されているため、ここでは直接値を書く)
        model: "barrel",
        pos: { ...target.pos },
        facing: 0,
        hp: 1,
        maxHp: 1,
        atk: 0,
        def: 0,
        level: 1,
        statuses: [],
        alive: true,
        tarukurabePoints: target.points,
      });
    }

    this.tarukurabeScore = 0;
    this.tarukurabeBarrelsLeft = TARUKURABE_BARREL_COUNT;
    this.tarukurabeScoredLanes.clear();
    this.spawnTarukurabeBarrel();

    updateVisibility(this.floor, this.player.pos, this.visionExtraRange());
  }

  /**
   * ひなたの寝穴(plan/game/tutorial-dungeon.md)。1部屋だけの小さな固定Floorを
   * 直接組み立てる(enterTarukurabeFloorと同じ考え方)。区画割り・通路の
   * generateFloorを経由しないため、罠・地形ギミック・モンスターハウス・
   * 野生湧きは一切乗らない。出現・設置物はぷるんと必要な道具だけを階ごとに
   * 手で置く(1階: 攻撃を覚える的にぷるん1体。2階: タル投げ・捕獲を覚える
   * 空のタル1個+ぷるん1体。3階: 道具・満腹度を覚えるいやしの葉+かたパン、
   * 番人のぷるん2体、最奥にめざめの階段)
   */
  private enterHinataFloor(depth: number): void {
    const width = 13;
    const height = 7;
    const tiles: Tile[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const isWall = x === 0 || y === 0 || x === width - 1 || y === height - 1;
        tiles.push({ kind: isWall ? TILE_WALL : TILE_ROOM, roomId: isWall ? -1 : 0, explored: false, visible: false });
      }
    }

    this.floor = {
      depth,
      width,
      height,
      tiles,
      rooms: [{ id: 0, x: 1, y: 1, w: width - 2, h: height - 2 }],
      stairs: { x: width - 2, y: 3 },
      actors: [],
      items: [],
      traps: [],
      barrels: [],
      goldPiles: [],
      fieldObstacles: [],
      secretPassages: [],
    };

    this.player.pos = { x: 1, y: 3 };
    this.player.carrying = null;
    this.floor.actors.push(this.player);

    const purun = speciesById("purun");
    if (depth === 1) {
      this.floor.actors.push(createMonster(this.ids.nextActorId(), purun, { x: 5, y: 3 }));
    } else if (depth === 2) {
      this.floor.barrels.push(createBarrel(this.ids.nextBarrelId(), "empty", { x: 5, y: 2 }));
      this.floor.actors.push(createMonster(this.ids.nextActorId(), purun, { x: 5, y: 4 }));
    } else {
      this.floor.items.push({ item: createItem(this.ids.nextItemUid(), "healLeaf"), pos: { x: 4, y: 2 } });
      this.floor.items.push({ item: createItem(this.ids.nextItemUid(), "hardBread"), pos: { x: 4, y: 4 } });
      this.floor.actors.push(createMonster(this.ids.nextActorId(), purun, { x: 9, y: 2 }));
      this.floor.actors.push(createMonster(this.ids.nextActorId(), purun, { x: 9, y: 4 }));
    }

    updateVisibility(this.floor, this.player.pos, this.visionExtraRange());
  }

  /**
   * ボスの間(plan/game/dungeon-boss-rooms.md)。手作りの固定Floorを直接
   * 組み立てる(enterTarukurabeFloorと同じ考え方)。「前室(安全地帯)
   * ─通路─扉─ボスの間(大部屋)」の一本道にし、ボス以外の湧きモンスター・
   * 地形ギミックは乗せない。ボス自体の配置はpopulateFloorの既存の
   * bossSpeciesId分岐(部屋タイル・プレイヤーから距離6以上)にそのまま
   * 委ねる――ボスAI・強さの計算式を一切変えずに済ませるため
   */
  private enterBossFloor(depth: number, bossSpeciesId: string): void {
    const ante = { x: 1, y: 3, w: 5, h: 5 };
    const boss = { x: 14, y: 1, w: 13, h: 9 };
    const corridorY = ante.y + Math.floor(ante.h / 2);
    const corridorStartX = ante.x + ante.w;
    const doorX = corridorStartX + Math.floor((boss.x - corridorStartX) / 2);
    const width = boss.x + boss.w + 1;
    const height = Math.max(ante.y + ante.h, boss.y + boss.h) + 1;

    const tiles: Tile[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        tiles.push({ kind: TILE_WALL, roomId: -1, explored: false, visible: false });
      }
    }
    const carve = (x: number, y: number, kind: typeof TILE_ROOM | typeof TILE_CORRIDOR, roomId: number) => {
      tiles[y * width + x] = { kind, roomId, explored: false, visible: false };
    };
    for (let y = ante.y; y < ante.y + ante.h; y++) {
      for (let x = ante.x; x < ante.x + ante.w; x++) carve(x, y, TILE_ROOM, 0);
    }
    for (let y = boss.y; y < boss.y + boss.h; y++) {
      for (let x = boss.x; x < boss.x + boss.w; x++) carve(x, y, TILE_ROOM, 1);
    }
    for (let x = corridorStartX; x < boss.x; x++) {
      carve(x, corridorY, TILE_CORRIDOR, -1);
    }

    const start: Vec2 = { x: ante.x + Math.floor(ante.w / 2), y: corridorY };
    this.floor = {
      depth,
      width,
      height,
      tiles,
      rooms: [
        { id: 0, x: ante.x, y: ante.y, w: ante.w, h: ante.h },
        { id: 1, x: boss.x, y: boss.y, w: boss.w, h: boss.h },
      ],
      // 階段はボスの間の奥に最初から置いてあるが、ボスを撃破するまでは
      // 壁と同じく通れない(plan/game/dungeon-boss-rooms.mdの「撃破後に
      // 踏破の階段が現れる」。killActorの地方ボス撃破処理でfalseにする)
      stairs: { x: boss.x + boss.w - 2, y: boss.y + boss.h - 2 },
      stairsBlocked: true,
      door: { pos: { x: doorX, y: corridorY }, open: false, bossSpeciesId },
      actors: [],
      items: [],
      traps: [],
      barrels: [],
      goldPiles: [],
      fieldObstacles: [],
      secretPassages: [],
    };

    this.player.pos = start;
    this.floor.actors.push(this.player);

    populateFloor(this.rng, this.floor, this.ids, start, {
      bossSpeciesId,
      monsterAtkMultiplier: MONSTER_ATK_MULTIPLIER[this.difficulty] * (this.mood.monsterAtkMulAfterAware ?? 1),
      goldRewardMultiplier: GOLD_REWARD_MULTIPLIER[this.difficulty] * (this.mood.goldRateMul ?? 1),
      speciesDepthOffset: this.dungeon.floorOffset ?? 0,
      itemCountMultiplier: this.mood.dropRateMul ?? 1,
      thiefWeightMultiplier: this.mood.thiefRateMul ?? 1,
    });

    // 第三章「仲間探し」の崩落イベント(plan/chapter3-collapse-event.md):
    // 骨積みの回廊(第四地方)最終階=24階は、ボスの間でもある。ボスの間の
    // 固定構造に置き換えても、この階固有の物語イベントは消さない
    // (通常のenterFloorと同じ条件のまま、ボスの間側でも呼ぶ)
    if (isChapter3CollapseFloor(this.dungeon.id, depth) && storyChapter(this.defeatedRegionBossCountAtStart, false) >= 3) {
      placeChapter3CollapseObstacle(this.floor);
    }

    for (const ally of this.allies) {
      const spot = this.freeSpotNear(start);
      if (!spot) continue;
      ally.pos = spot;
      ally.aware = true;
      this.floor.actors.push(ally);
    }

    updateVisibility(this.floor, this.player.pos, this.visionExtraRange());
  }

  /** 樽比べ専用: 投擲台(プレイヤーの足元)に次の1個を供給する */
  private spawnTarukurabeBarrel(): void {
    this.floor.barrels.push(
      createBarrel(this.ids.nextBarrelId(), "empty", { ...this.player.pos }),
    );
  }

  /**
   * 地方固有ギミックの適用条件。今いるダンジョン自身がその地方か、または
   * 第八地方(めざめの前庭)固有ギミック(plan/dream-garden-mosaic.md)で
   * その地方番号が今回のフロアのmosaicRegionsに選ばれていれば true
   */
  private regionGimmickApplies(region: number): boolean {
    return regionIndexForDungeonId(this.dungeon.id) === region || this.mosaicRegions.includes(region);
  }

  /** 指定位置の近くで、誰も立っていないマスを探す */
  private freeSpotNear(center: Vec2, maxRing = 3): Vec2 | null {
    return freeSpotNear(this.floor, this.rng, center, maxRing);
  }

  /**
   * タルを抱えたまま階段を使おうとした場合のフェイルセーフ(plan/barrel-stairs-safeguard.md):
   * 階段の上に居座らせず、隣接する空きマスへ押し戻す。「直前にいたマス」を
   * 厳密に追跡する仕組みは持たないため、actor-overlap-failsafeで導入した
   * adjacentFreeSpotを再利用し、直近の空きマスへ最小移動させる
   */
  private pushBackFromStairs(events: GameEvent[]): void {
    const player = this.player;
    const spot = domainAdjacentFreeSpot(this.floor, player.pos);
    if (!spot) return;
    const from = player.pos;
    player.pos = spot;
    events.push({ type: "move", actorId: player.id, from, to: spot });
  }

  /**
   * 山の芯(plan/mountain-core.md): 最終フロアに立った時点(階段を降りる・
   * 区切って持ち帰るのどちらでも)で、固定の会話イベントを1回だけ挟む
   */
  private maybePlayMountainCoreEnding(events: GameEvent[]): void {
    if (this.dungeon.id !== MOUNTAIN_CORE_ID || this.depth < this.maxDepth) return;
    for (const line of MOUNTAIN_CORE_DIALOGUE) {
      events.push({ type: "message", text: line });
    }
    events.push({ type: "mountainCoreCleared" });
  }

  /**
   * 真の目覚め(plan/true-awakening.md): 「はじめの夢」のHPが0になった瞬間に
   * killActorの代わりに呼ぶ。討伐・ドロップ・経験値は発生させず、絆(なじみ)
   * に応じた締めの一言を挟んでダイブを踏破扱いで終える
   */
  private trueAwakeningEnding(target: MonsterActor, events: GameEvent[]): void {
    target.alive = false;
    target.hp = 0;
    events.push({ type: "die", actorId: target.id, kind: target.kind, speciesId: target.speciesId });
    // summonEcho(地方ボス、plan/region-boss-kodamanonushi.md)で分身を出していた
    // 場合、本体と同時に消す(killActorの同等処理を踏襲)
    for (const echo of this.floor.actors) {
      if (echo.kind !== "monster") continue;
      if (echo.id === target.id || echo.sharesHpWith !== target.id || !echo.alive) continue;
      echo.alive = false;
      echo.hp = 0;
      events.push({ type: "die", actorId: echo.id, kind: echo.kind, speciesId: echo.speciesId });
    }

    for (const line of TRUE_AWAKENING_INTRO) {
      events.push({ type: "message", text: line });
    }
    events.push({ type: "message", text: this.trueAwakeningFarewellLine() });
    for (const line of TRUE_AWAKENING_CLOSING) {
      events.push({ type: "message", text: line });
    }

    this.status = "cleared";
    this.endReason = "「はじめの夢」に、もう独りではないと伝わった。";
    events.push({ type: "message", text: this.endReason });
    events.push({ type: "gameOver", reason: this.endReason });
    events.push({ type: "trueAwakeningCleared" });
  }

  /** 現在連れている仲間のうち、最も絆(なじみ)が深い個体の段階に応じた締めの一言を返す */
  private trueAwakeningFarewellLine(): string {
    if (this.allies.length === 0) return TRUE_AWAKENING_FAREWELL_SOLO;
    const stageRank: readonly BondStage[] = ["none", "familiar", "close", "irreplaceable"];
    let best: BondStage = "none";
    for (const ally of this.allies) {
      const stage = bondStage(ally.bondSuccessCount ?? 0);
      if (stageRank.indexOf(stage) > stageRank.indexOf(best)) best = stage;
    }
    return TRUE_AWAKENING_FAREWELL_BY_BOND_STAGE[best];
  }

  private descend(events: GameEvent[]): void {
    if (this.depth >= this.maxDepth) {
      // 横穴(分岐ダンジョン、plan/game/dungeon-per-region.md): 分岐ダンジョンの
      // 最終階では、ダイブを終わらせず元の地方ダンジョンの階へ戻すだけにする
      if (this.hostContext) {
        this.returnFromBranchDungeon(events);
        return;
      }
      this.maybePlayMountainCoreEnding(events);
      this.status = "cleared";
      this.endReason = `${this.maxDepth}階を踏破した!`;
      events.push({ type: "message", text: this.endReason });
      events.push({ type: "gameOver", reason: this.endReason });
      return;
    }
    this.enterFloor(this.depth + 1);
    events.push({ type: "descend", depth: this.depth });
    events.push({ type: "message", text: t("msg.descend", { depth: this.depth }) });
    if (this.floor.gimmick) {
      events.push({ type: "message", text: GIMMICK_MESSAGES[this.floor.gimmick] });
    }
  }

  /**
   * 今いる階がめざめの階段の階か(plan/game/checkpoint-stairs-menu.md)。
   * 表の寝穴では地方の最終階(6階ごと)だけ。他のダンジョンは地方の
   * 概念を持たないため全階が該当する(既知チェックポイントの記録と同じ条件)
   */
  get onCheckpointFloor(): boolean {
    return isCheckpointFloor(this.dungeon.id, this.depth);
  }

  /**
   * めざめの階段を使って、ここで区切ってダイブを成功させる
   * (plan/checkpoint-select.md)。持ち物・仲間・所持金を持ち帰れる点は
   * 通常の踏破と同じ。以後の深い階は次回以降のダイブに持ち越す。
   */
  private bankRun(events: GameEvent[]): boolean {
    if (!eq(this.player.pos, this.floor.stairs)) {
      events.push({ type: "message", text: "ここには階段がない。" });
      return false;
    }
    // タルを抱えたままの階段降りを禁止する(plan/barrel-stairs-safeguard.md)
    if (this.player.carrying) {
      events.push({ type: "message", text: "タルを抱えたままでは降りられない。" });
      this.pushBackFromStairs(events);
      return true;
    }
    this.maybePlayMountainCoreEnding(events);
    this.status = "cleared";
    this.endReason = t("msg.checkpointReached", { depth: this.depth });
    events.push({ type: "message", text: this.endReason });
    events.push({ type: "gameOver", reason: this.endReason });
    return true;
  }

  /**
   * ボスの間の扉を開ける(plan/game/dungeon-boss-rooms.md)。扉のすぐ前
   * (8方向いずれかの隣接マス)に立っていなければ弾く。開けるとその場で
   * ボスの気配を告げるメッセージを出し、doorOpenedイベントでBGM切り替えを
   * main.ts側に伝える。開閉そのものはターンを消費しない(仕度を挟める、
   * というdocの意図どおり)
   */
  private openDoor(events: GameEvent[]): boolean {
    const door = this.floor.door;
    if (!door || chebyshev(this.player.pos, door.pos) > 1) {
      events.push({ type: "message", text: "ここに扉はない。" });
      return false;
    }
    if (door.open) return false;
    door.open = true;
    const bossName = speciesById(door.bossSpeciesId).name;
    events.push({ type: "message", text: `扉を開けた。${bossName}の気配が強まる――` });
    events.push({ type: "doorOpened", bossSpeciesId: door.bossSpeciesId });
    return false;
  }

  /**
   * 横穴(分岐ダンジョン、plan/game/dungeon-per-region.md)の入り口に立って
   * 確定したときに呼ぶ。入り口のマスに立っていなければ弾く
   */
  private enterBranchTile(events: GameEvent[]): boolean {
    const entrance = this.floor.branchEntrance;
    if (!entrance || !eq(this.player.pos, entrance.pos)) {
      events.push({ type: "message", text: "ここに横穴はない。" });
      return false;
    }
    return this.enterBranchDungeon(entrance.dungeonId, events);
  }

  // ------------------------------------------------------------ コマンド処理

  command(cmd: Command): GameEvent[] {
    const events: GameEvent[] = [];
    if (this.status !== "playing") return events;

    // レベルアップ時のスキル選択(plan/game/archive/run-build-skills.md):
    // 提示中は選ぶまでゲームが一切進まない。chooseSkill以外のコマンドは無視する
    if (isAwaitingSkillChoice(this.skillChoiceState)) {
      if (cmd.type === "chooseSkill") this.resolveSkillChoice(cmd.id, events);
      return events;
    }

    this.hitThisTurn = new Set();
    const posBeforeCommand = { ...this.player.pos };
    const consumedTurn = this.resolvePlayerCommand(cmd, events);
    this.syncEquippedWeaponModel();

    if (consumedTurn && this.status === "playing") {
      this.resolveTurn(events, posBeforeCommand);
    }

    // 視界の計算は全マス(48×36)を一度なめる。ターンが進まず、しかも
    // プレイヤーが動いてもいないなら見え方は変わらないので、その場合は省く
    // (向きだけ変える・壁に向かって歩こうとした、など)
    if (consumedTurn || !eq(posBeforeCommand, this.player.pos)) {
      updateVisibility(this.floor, this.player.pos, this.visionExtraRange());
    }
    this.checkCompendiumSightings(events);
    return events;
  }

  /**
   * 図鑑(plan/monster-compendium.md)の「見た」通知。プレイヤーの視界に
   * 入った野生モンスターの種族を、そのダイブで初めて見た瞬間だけ通知する。
   * 実際のセーブへの反映は呼び出し側(main.ts)が行う
   */
  private checkCompendiumSightings(events: GameEvent[]): void {
    for (const actor of this.floor.actors) {
      if (!actor.alive || actor.kind !== "monster" || !actor.speciesId) continue;
      if (this.sightedSpecies.has(actor.speciesId)) continue;
      if (!isVisible(this.floor, actor.pos)) continue;
      this.sightedSpecies.add(actor.speciesId);
      events.push({ type: "monsterSighted", speciesId: actor.speciesId });
    }
  }

  /** 眠っていても使わせてよい行動か(眠りを治す道具の使用だけを許す) */
  private wakesUpWith(cmd: Command): boolean {
    if (cmd.type !== "use") return false;
    const item = findItem(this.player.inventory, cmd.uid);
    return item !== undefined && itemDef(item.defId).effect === "cureSleepConfuse";
  }

  private resolvePlayerCommand(cmd: Command, events: GameEvent[]): boolean {
    const player = this.player;

    // 眠っている間は何をしようとしてもターンだけが過ぎる。
    // ただし「めざめ草」のような眠りを治す道具を使うことだけは例外にする
    // (でなければ、眠りを治す道具そのものが眠っている間は一生使えなくなってしまう)
    if (hasStatus(player, STATUS_SLEEP) && !this.wakesUpWith(cmd)) {
      events.push({ type: "message", text: "ガルドは眠っている……" });
      return true;
    }
    // 主の大槌を振るった反動で、次の1手ぶん体勢が崩れている
    if (hasStatus(player, STATUS_RECOVER)) {
      events.push({ type: "message", text: "大槌を振り抜いた反動で、体勢を立て直している……" });
      return true;
    }
    // 樽比べ(plan/tarukurabe-minigame.md): 投擲台から動けない専用モード。
    // 向きを変えるfaceは的の狙いを変える手段としてそのまま使えるので許可する
    if (this.dungeon.id === TARUKURABE_ID && cmd.type === "move") {
      events.push({ type: "message", text: "ここでは投擲台から動けない。" });
      return false;
    }

    switch (cmd.type) {
      case "face":
        player.facing = cmd.dir;
        events.push({ type: "face", actorId: player.id, dir: cmd.dir });
        return false;

      case "wait":
        player.guarding = true;
        // スキル「がまんのかまえ」(plan/game/archive/run-build-skills.md):
        // 足踏みの直後1撃だけ与ダメージ2倍
        if (this.runSkills.includes("braced")) player.bracedReady = true;
        return true;

      case "move": {
        let dir = cmd.dir;
        if (hasStatus(player, STATUS_CONFUSE) && this.rng.chance(0.6)) {
          dir = this.rng.pick(ALL_DIRS);
          events.push({ type: "message", text: "足元がおぼつかない!" });
        }
        player.facing = dir;
        return this.movePlayer(dir, events);
      }

      // 攻撃専用キー(plan/attack-button.md)。移動キーで敵の方向へ進んだ場合は
      // 「押し出し」になる(movePlayer参照)ため、実際にダメージを与える経路は
      // ここ一本に絞られる。空振り(敵がいない・不可視 等)でもターンは消費する
      case "attack":
        this.resolvePlayerAttack(player.facing, events);
        return true;

      case "pickup":
        return this.pickUp(events);

      case "descend": {
        // 第七地方(わすれられた祭りの跡)固有ギミック(plan/festival-mirage.md): 偽の階段
        const decoyIdx = this.floor.decoyStairsPositions?.findIndex((p) => eq(p, player.pos)) ?? -1;
        if (decoyIdx >= 0) {
          this.floor.decoyStairsPositions!.splice(decoyIdx, 1);
          events.push({ type: "message", text: "――幻だったらしい。" });
          return true;
        }
        if (!eq(player.pos, this.floor.stairs)) {
          events.push({ type: "message", text: "ここには階段がない。" });
          return false;
        }
        // ボスの間の階段(plan/game/dungeon-boss-rooms.md): 通常の移動では
        // walkableAtがこの階段マスへの到達自体を防ぐが、念のため二重に守る
        if (this.floor.stairsBlocked) {
          events.push({ type: "message", text: "ここには階段がない。" });
          return false;
        }
        // タルを抱えたままの階段降りを禁止する(plan/barrel-stairs-safeguard.md)
        if (player.carrying) {
          events.push({ type: "message", text: "タルを抱えたままでは降りられない。" });
          this.pushBackFromStairs(events);
          return true;
        }
        this.descend(events);
        return true;
      }

      case "bank":
        return this.bankRun(events);

      case "openDoor":
        return this.openDoor(events);

      case "enterBranch":
        return this.enterBranchTile(events);

      case "use":
        return this.useItem(cmd.uid, events);

      case "throw":
        return this.throwItem(cmd.uid, events);

      case "drop":
        return this.dropItem(cmd.uid, events);

      case "equip": {
        const item = findItem(player.inventory, cmd.uid);
        if (!item) return false;
        const def = itemDef(item.defId);
        // 実績帳「挑戦」カテゴリ(plan/challenge-achievements.md): 武器の
        // 持ち替えを記録する。装備中の武器を「はずす」操作(トグルの逆方向)
        // は持ち替えに数えない。素手・未装備からの初回装備も系統を記録する
        // だけで持ち替えに数えない
        if (def.category === "weapon" && player.inventory.weaponUid !== cmd.uid) {
          const kind = weaponKindOf(item.defId);
          if (this.weaponKindThisRun !== undefined && this.weaponKindThisRun !== kind) {
            this.usedMultipleWeaponsThisRun = true;
          }
          this.weaponKindThisRun = kind;
        }
        equip(player.inventory, cmd.uid);
        events.push({ type: "equip", actorId: player.id, itemUid: cmd.uid, name: def.name });
        events.push({
          type: "message",
          text: `${displayName(player.inventory, item)}を装備した。`,
        });
        return true;
      }

      case "liftBarrel":
        return liftOrPutBarrel({ floor: this.floor, rng: this.rng, player, events });

      case "throwBarrel": {
        const consumed = this.throwCarriedBarrel(events);
        // 樽比べ(plan/tarukurabe-minigame.md): 実際に1投消費した場合だけ、
        // 残りタル数・終了条件を進める(「タルを持っていない」等の不発は数えない)
        if (consumed && this.dungeon.id === TARUKURABE_ID && this.status === "playing") {
          this.finishTarukurabeThrow(events);
        }
        return consumed;
      }

      case "openBarrel":
        return this.openCarriedBarrel(events);

      case "castBarrelArt":
        return domainCastBarrelArt({ player, allies: this.allies, allyId: cmd.allyId, events });

      case "setStance":
        return this.setAllyStance(cmd.allyId, cmd.stance, events);

      case "useArt":
        return this.useArt(cmd.id, events);

      // レベルアップ時のスキル選択(plan/game/archive/run-build-skills.md):
      // 提示中はcommand()の先頭で丸ごと横取りするため、ここには来ない
      case "chooseSkill":
        return false;
    }
  }

  // ------------------------------------------------------------ 仲間への指示

  /** 構えを設定する。指示そのものはターンを消費しない */
  private setAllyStance(
    allyId: number | "all",
    stance: AllyStance,
    events: GameEvent[],
  ): boolean {
    const targets = allyId === "all" ? this.allies : this.allies.filter((a) => a.id === allyId);
    if (targets.length === 0) return false;

    for (const ally of targets) {
      ally.stance = stance;
      ally.holdPos = stance === "hold" ? { ...ally.pos } : undefined;
    }

    const label = allyId === "all" ? "全員" : targets[0]!.name;
    events.push({
      type: "message",
      text: `${label}に「${ALLY_STANCE_NAMES[stance]}」を指示した。`,
    });
    return false;
  }

  // ------------------------------------------------------------ 樽守りの技

  /**
   * 技を繰り出す。習得済み・クールダウン明けなら1ターン消費して発動する。
   * 「会心の樽投げ」「樽受け身」「抱え投げの奥義」は次の行動で効果を発揮する
   * 予約フラグ、「なだめの手つき」はその場で相手に作用する即時効果。
   * 「目覚ましの一喝」は地方ボス(plan/region-bosses.md、未実装)専用の
   * 切り返しのため、現状は不発のメッセージだけを返す。
   */
  private useArt(id: ArtId, events: GameEvent[]): boolean {
    const player = this.player;
    const def = artDef(id);

    if (player.level < def.unlockLevel) {
      events.push({ type: "message", text: "まだ覚えていない技だ。" });
      return false;
    }
    if ((player.artCooldowns[id] ?? 0) > 0) {
      events.push({ type: "message", text: `「${def.name}」はまだ使えない。` });
      return false;
    }

    events.push({ type: "message", text: `「${def.name}」を繰り出した!` });

    switch (id) {
      case "critBarrel":
        player.critBarrelReady = true;
        break;
      case "pierce":
        player.pierceReady = true;
        break;
      case "ukemi":
        player.ukemiReady = true;
        break;
      case "soothe": {
        const delta = dirDelta(player.facing);
        const target = actorAt(this.floor, { x: player.pos.x + delta.x, y: player.pos.y + delta.y });
        if (target && target.kind === "monster" && isHostile(player, target)) {
          target.captureBonus = Math.min(1, (target.captureBonus ?? 0) + 0.4);
          events.push({ type: "message", text: `${target.name}の勢いをそいだ!` });
        } else {
          events.push({ type: "message", text: "しかし何も起こらなかった。" });
        }
        break;
      }
      case "shout":
        events.push({ type: "message", text: "しかし、それらしい気配はなかった。" });
        break;
    }

    player.artCooldowns[id] = def.cooldownTurns;
    return true;
  }

  // ------------------------------------------------------------ タル

  /** タルを投げるときの射程(かるがる・樽比べの専用射程を反映) */
  private barrelThrowRange(): number {
    const lightCarryBonus = this.runSkills.includes("lightCarry") ? LIGHT_CARRY_RANGE_BONUS : 0;
    return (this.dungeon.id === TARUKURABE_ID ? TARUKURABE_THROW_RANGE : BARREL_RANGE) + lightCarryBonus;
  }

  /**
   * 抱えているタルを投げる。飛んでいって最初に当たったものに応じて結果が変わる。
   *   空のタル      → 相手にダメージ。確率で吸い込んで「モンスター入り」になる
   *   爆発タル      → その場で爆発し、周囲もろとも巻き込む
   *   モンスター入り → 中身が飛び出して仲間になる
   */
  private throwCarriedBarrel(events: GameEvent[]): boolean {
    const player = this.player;
    const barrel = player.carrying;
    if (!barrel) {
      events.push({ type: "message", text: "タルを持っていない。" });
      return false;
    }

    // 技の予約は、投げるタルの種類によらず「次に投げた時点」で消費する
    const critForced = player.critBarrelReady;
    // スキル「ころがし」(plan/game/archive/run-build-skills.md): 既存の
    // 「抱え投げの奥義」(貫通)と同じ当たり判定を、都度の予約なしで常に使える
    // ようにする簡略化とした(轢いた敵全員が通過ダメージを受ける)
    const pierce = player.pierceReady || this.runSkills.includes("rollingThrow");
    player.critBarrelReady = false;
    player.pierceReady = false;

    player.carrying = null;
    const from = player.pos;
    const { landing, hits } = traceThrow(
      this.floor,
      player.pos,
      player.facing,
      this.barrelThrowRange(),
      pierce,
      player.id,
    );

    events.push({
      type: "throwBarrel",
      actorId: player.id,
      barrelId: barrel.id,
      from,
      to: landing,
    });
    events.push({ type: "message", text: `${barrelDisplayName(barrel)}を投げた!` });

    switch (barrel.kind) {
      case "bomb":
        domainExplode({
          floor: this.floor,
          rng: this.rng,
          center: landing,
          events,
          throwerId: player.id,
          damageActor: (target, dmg, crit) => this.damageActor(target, dmg, crit, events),
          isPlaying: () => this.status === "playing",
        });
        events.push({ type: "barrelBreak", barrelId: barrel.id, pos: landing });
        return true;

      case "caught":
        this.releaseFromBarrel(barrel, landing, events);
        return true;

      case "empty": {
        // 貫通で複数体に当たった場合、手前の相手には通過ダメージだけを与え、
        // 最後に当たった相手にだけダメージ+捕獲判定を行う(タルは1体しか収まらない)
        const barrelDamage = barrelThrowDamage(this.player.inventory);
        for (const passThrough of hits.slice(0, -1)) {
          if (!passThrough.alive) continue;
          // 樽比べ(plan/tarukurabe-minigame.md): 的は貫通されても通過ダメージの
          // 対象にしない(戦闘ではないので、命中したら即座に得点処理へ回す)
          if (passThrough.kind === "target") {
            this.resolveTarukurabeHit(passThrough, events);
            continue;
          }
          const result = computeDamage(
            this.rng,
            barrelDamage,
            passThrough.def,
            critForced ? { forceCrit: true } : undefined,
          );
          events.push({
            type: "message",
            text: `${passThrough.name}を貫いた! ${result.damage}のダメージ!`,
          });
          this.damageActor(passThrough, result.damage, result.critical, events);
          if (this.status !== "playing") return true;
        }
        const last = hits[hits.length - 1];
        const emptyHit = last && last.alive ? last : null;
        return domainResolveEmptyBarrel({
          floor: this.floor,
          rng: this.rng,
          playerInventory: this.player.inventory,
          playerPos: this.player.pos,
          runSkills: this.runSkills,
          alliesCount: this.allies.length,
          barrel,
          landing,
          hit: emptyHit,
          hitCurrentHp: emptyHit ? this.hpOwnerOf(emptyHit).hp : 0,
          throwDamage: barrelThrowDamage(this.player.inventory),
          events,
          critForced,
          resolveTarukurabeHit: (hit) => this.resolveTarukurabeHit(hit, events),
          damageActor: (target, dmg, crit) => this.damageActor(target, dmg, crit, events),
        });
      }

      // ---- 元素タル(plan/game/archive/barrel-arts.md) ----
      // 命中した最後の1体にだけ効果を発揮し、当たったところで砕ける(ばくはつタルと同じ、使い切り)
      case "water":
        applyElementalBarrelHit({
          barrel,
          landing,
          hits,
          events,
          resolveTarukurabeHit: (hit) => this.resolveTarukurabeHit(hit, events),
          effect: (target) => {
            const power = Math.round(barrelThrowDamage(this.player.inventory) * WATER_BARREL_DAMAGE_MULTIPLIER);
            const finalDamage = mitigateIncomingDamage({
              target,
              damage: Math.max(1, power),
              events,
              rng: this.rng,
              runSkills: this.runSkills,
              player: this.player,
              oncePerRun: this.oncePerRun,
              partyGuardTurns: this.partyGuardTurns,
            });
            events.push({ type: "message", text: `${displayActorName(target)}に${finalDamage}のダメージ!` });
            this.damageActor(target, finalDamage, false, events);
          },
        });
        return true;

      case "wind":
        applyElementalBarrelHit({
          barrel,
          landing,
          hits,
          events,
          resolveTarukurabeHit: (hit) => this.resolveTarukurabeHit(hit, events),
          effect: (target) => {
            const distance = barrel.enhanced ? WIND_BARREL_PUSH_DISTANCE + 1 : WIND_BARREL_PUSH_DISTANCE;
            for (let i = 0; i < distance; i++) {
              if (!this.pushMonster(player.facing, target, events)) break;
              if (!target.alive) break;
            }
          },
        });
        return true;

      case "light":
        applyElementalBarrelHit({
          barrel,
          landing,
          hits,
          events,
          resolveTarukurabeHit: (hit) => this.resolveTarukurabeHit(hit, events),
          effect: (target) => {
            const turns = barrel.enhanced ? LIGHT_BARREL_CONFUSE_TURNS + 1 : LIGHT_BARREL_CONFUSE_TURNS;
            addStatus(this.effectContext(events), target, STATUS_CONFUSE, turns, "目がくらんだ");
          },
        });
        return true;

      case "stone":
        applyElementalBarrelHit({
          barrel,
          landing,
          hits,
          events,
          resolveTarukurabeHit: (hit) => this.resolveTarukurabeHit(hit, events),
          effect: (target) => {
            const power = Math.round(barrelThrowDamage(this.player.inventory) * STONE_BARREL_DAMAGE_MULTIPLIER);
            const finalDamage = mitigateIncomingDamage({
              target,
              damage: Math.max(1, power),
              events,
              rng: this.rng,
              runSkills: this.runSkills,
              player: this.player,
              oncePerRun: this.oncePerRun,
              partyGuardTurns: this.partyGuardTurns,
            });
            events.push({ type: "message", text: `${displayActorName(target)}に${finalDamage}のダメージ!` });
            this.damageActor(target, finalDamage, false, events);
          },
        });
        return true;

      case "sleep":
        applyElementalBarrelHit({
          barrel,
          landing,
          hits,
          events,
          resolveTarukurabeHit: (hit) => this.resolveTarukurabeHit(hit, events),
          effect: (target) => {
            const turns = barrel.enhanced ? SLEEP_BARREL_SLEEP_TURNS + 1 : SLEEP_BARREL_SLEEP_TURNS;
            addStatus(this.effectContext(events), target, STATUS_SLEEP, turns, "眠ってしまった");
          },
        });
        return true;
    }
  }

  /**
   * 元素タル(plan/game/archive/barrel-arts.md)。抱えている中身を正面
   * (塞がっていれば足元)に放つ。爆発タル・モンスター入りタルも既存の
   * 意味のまま「あける」で使える(自爆・解放)。あけると中身は失われ、
   * 空のタルに戻る(爆発・モンスター入りは従来どおり消費されて無くなる)
   */
  private openCarriedBarrel(events: GameEvent[]): boolean {
    const player = this.player;
    const barrel = player.carrying;
    if (!barrel) {
      events.push({ type: "message", text: "タルを持っていない。" });
      return false;
    }
    const delta = dirDelta(player.facing);
    const front = { x: player.pos.x + delta.x, y: player.pos.y + delta.y };
    const center = walkableAt(this.floor, front) && !actorAt(this.floor, front) ? front : player.pos;

    if (barrel.kind === "empty") {
      events.push({ type: "message", text: "からのタルだ。あけても何も起きない。" });
      return false;
    }
    events.push({ type: "message", text: `${barrelDisplayName(barrel)}をあけた!` });
    if (barrel.kind === "bomb") {
      player.carrying = null;
      domainExplode({
        floor: this.floor,
        rng: this.rng,
        center,
        events,
        throwerId: player.id,
        damageActor: (target, dmg, crit) => this.damageActor(target, dmg, crit, events),
        isPlaying: () => this.status === "playing",
      });
      events.push({ type: "barrelBreak", barrelId: barrel.id, pos: center });
      return true;
    }
    if (barrel.kind === "caught") {
      player.carrying = null;
      this.releaseFromBarrel(barrel, center, events);
      return true;
    }

    // 元素タルをあける音(plan/sound/archive/village-soundscape.md)。
    // ここまで来た時点でbarrel.kindは元素タル5種のいずれかに絞られている
    events.push({ type: "barrelOpen", barrelId: barrel.id, kind: barrel.kind, pos: center });

    switch (barrel.kind) {
      case "water":
        openWaterBarrel(this.floor, center, barrel.enhanced ?? false, events);
        break;
      case "wind":
        openWindBarrel({
          floor: this.floor,
          center: player.pos,
          events,
          pushMonster: (dir, target, evts) => this.pushMonster(dir, target, evts),
        });
        break;
      case "light":
        this.lightBarrelTurns = Math.max(
          this.lightBarrelTurns,
          barrel.enhanced ? LIGHT_BARREL_OPEN_TURNS + 2 : LIGHT_BARREL_OPEN_TURNS,
        );
        break;
      case "stone":
        openStoneBarrel(this.floor, front, events);
        break;
      case "sleep":
        openSleepBarrel({
          floor: this.floor,
          center: player.pos,
          enhanced: barrel.enhanced ?? false,
          effectCtx: this.effectContext(events),
        });
        break;
    }
    // スキル「つぎたし」(plan/game/archive/run-build-skills.md): この元素タルで
    // まだ使っていなければ、空に戻さずもう1回ぶん中身を残す
    if (this.runSkills.includes("refillBarrel") && !barrel.refillUsed) {
      player.carrying = { ...barrel, refillUsed: true };
      events.push({ type: "message", text: "タルに、もう一度ぶん中身が残っている!" });
      return true;
    }
    player.carrying = { id: barrel.id, kind: "empty", pos: barrel.pos };
    events.push({ type: "message", text: "からのタルに戻った。" });
    return true;
  }


  /**
   * 樽比べ(plan/tarukurabe-minigame.md): 的への命中を得点に変換する。ダメージ・
   * 捕獲判定は一切行わない。同じ的への2回目以降の命中は何も起きない
   * (的は最初の命中でhit.alive=falseになり、以後actorAtに引っかからなくなる
   * ため通常は再度ここへ来ないが、念のためのガードとして残す)
   */
  private resolveTarukurabeHit(hit: TargetActor, events: GameEvent[]): void {
    const points = hit.tarukurabePoints ?? 0;
    if (this.tarukurabeScoredLanes.has(points)) return;
    this.tarukurabeScoredLanes.add(points);
    this.tarukurabeScore += points;
    hit.alive = false;
    events.push({
      type: "message",
      text: `的に命中! ${points}点(合計${this.tarukurabeScore}点)。`,
    });
  }

  /**
   * 樽比べ(plan/tarukurabe-minigame.md): 1投の解決後に呼ぶ。タルを1個消費し、
   * 終了条件(全ての的に命中済み、またはタルを使い切った)を満たしていれば
   * 専用モードを終了する。満たしていなければ次の1個を投擲台に供給する
   */
  private finishTarukurabeThrow(events: GameEvent[]): void {
    this.tarukurabeBarrelsLeft--;
    const allTargetsHit = this.tarukurabeScoredLanes.size >= TARUKURABE_TARGETS.length;
    if (!allTargetsHit && this.tarukurabeBarrelsLeft > 0) {
      this.spawnTarukurabeBarrel();
      return;
    }
    this.status = "cleared";
    this.endReason = `樽比べ終了! 合計${this.tarukurabeScore}点。`;
    events.push({ type: "tarukurabeFinished", score: this.tarukurabeScore });
    events.push({ type: "message", text: this.endReason });
    events.push({ type: "gameOver", reason: this.endReason });
  }

  /** 中身入りのタルを開けて、モンスターを仲間として盤面に出す */
  private releaseFromBarrel(barrel: Barrel, landing: Vec2, events: GameEvent[]): void {
    domainReleaseFromBarrel({
      floor: this.floor,
      rng: this.rng,
      barrel,
      landing,
      events,
      recruitFromBarrel: (b, spot) =>
        domainRecruitFromBarrel({ floor: this.floor, barrel: b, spot, allies: this.allies, ids: this.ids, events }),
    });
  }


  private movePlayer(dir: Dir, events: GameEvent[]): boolean {
    const player = this.player;
    const delta = dirDelta(dir);
    const to = { x: player.pos.x + delta.x, y: player.pos.y + delta.y };

    const target = actorAt(this.floor, to);
    if (target && target.id !== player.id) {
      if (isHostile(player, target)) {
        return this.pushMonster(dir, target, events);
      }
      // 仲間とは位置を入れ替える。通せんぼで足止めされては連れ歩けない
      const from = player.pos;
      player.pos = to;
      target.pos = from;
      events.push({ type: "swap", aId: player.id, bId: target.id });
      return true;
    }

    // 忘れ物蔵(plan/lost-and-found-vault.md)の隠し通路。壁の姿のまま
    // バンプするたびに確率で崩れて通路になる。無関係な壁は素通り扱い
    const secretPassage = this.floor.secretPassages.find((s) => eq(s.pos, to));
    if (secretPassage && !walkableAt(this.floor, to)) {
      events.push({ type: "bump", actorId: player.id, dir: delta });
      if (this.rng.chance(SECRET_PASSAGE_REVEAL_CHANCE)) {
        const tile = tileAt(this.floor, to);
        if (tile) tile.kind = TILE_CORRIDOR;
        events.push({ type: "message", text: "壁が崩れ、道ができた!" });
        events.push({ type: "secretPassageFound", regionId: secretPassage.regionId });
      } else {
        events.push({ type: "message", text: "壁を崩せそうな手ごたえがあった……" });
      }
      return false;
    }

    if (!walkableAt(this.floor, to)) {
      events.push({ type: "bump", actorId: player.id, dir: delta });
      return false;
    }

    // タルは押しのけられない。持ち上げるか、回り込む
    if (barrelAt(this.floor, to)) {
      events.push({ type: "bump", actorId: player.id, dir: delta });
      events.push({ type: "message", text: "タルが道をふさいでいる。" });
      return false;
    }
    // あうんの呼吸(plan/ally-field-gimmicks.md): 対応する性質を持つ仲間を
    // 連れていなければ通れない。連れていれば自動的に道が開く
    const obstacle = this.floor.fieldObstacles.find((o) => !o.opened && eq(o.pos, to));
    if (obstacle) {
      const helper = this.allies.find(
        (a) => a.alive && a.speciesId !== undefined && speciesById(a.speciesId).fieldSkill === obstacle.requires,
      );
      if (!helper) {
        events.push({ type: "bump", actorId: player.id, dir: delta });
        events.push({
          type: "message",
          text: `${FIELD_SKILL_HINTS[obstacle.requires]}仲間となら、ここを越えられそうだ。`,
        });
        return false;
      }
      obstacle.opened = true;
      const materialIds = [HOKORA_DUST_DEF_ID, ...MARKS.map((m) => MARK_STONE_DEF_ID[m.id])];
      const defId = this.rng.pick(materialIds);
      this.floor.items.push({ item: createItem(this.ids.nextItemUid(), defId), pos: { ...obstacle.pos } });
      events.push({
        type: "message",
        text: `${displayActorName(helper)}の力を借りて、道を切り開いた!`,
      });
    }
    // 斜めの角抜けは禁止
    if (isDiagonal(dir)) {
      if (!walkableAt(this.floor, { x: player.pos.x, y: to.y })) {
        events.push({ type: "bump", actorId: player.id, dir: delta });
        return false;
      }
      if (!walkableAt(this.floor, { x: to.x, y: player.pos.y })) {
        events.push({ type: "bump", actorId: player.id, dir: delta });
        return false;
      }
    }

    const from = player.pos;
    player.pos = to;
    events.push({ type: "move", actorId: player.id, from, to });
    const landed = this.applyTorrentPush(player, events);

    this.checkTrap(landed, events);
    this.collectGold(landed, events);
    this.checkShoplifting(from, landed, events);
    this.announceGround(landed, events);
    this.checkMonsterHouseWarning(landed, events);
    this.checkSecretPassageHint(landed, events);
    return true;
  }

  /**
   * 移動キーで敵のいる方向へ進もうとしたときの「押し出し」(plan/attack-button.md)。
   * 敵の向こう側のマスが空いていれば1マス押し出し、プレイヤーはその場に留まる。
   * 押し出し先の判定は、モンスターAIの移動判定(entities/ai.ts の canStep)と
   * 同じ関数をそのまま使う(壁・他アクター・タルをまとめて弾いてくれる)。
   * 押し出した先が奔流タイル等であれば、moveActor経由でその効果もそのまま乗る
   * (「そのマスに元々あった効果がそのまま発動する」という計画書の方針どおり)。
   *
   * 押し出せない場合(壁際・別アクターがいる 等)は、壁への体当たりと同じ扱いで
   * bumpイベントだけを出し、ターンを消費しない(plan/attack-button.mdのアーカイブ
   * 注記に理由を記載)
   */
  private pushMonster(dir: Dir, target: Actor, events: GameEvent[]): boolean {
    return domainPushMonster(this.floor, this.player.id, dir, target, events);
  }

  /**
   * 忘れ物蔵(plan/lost-and-found-vault.md)。隠し通路に初めて隣接した
   * ターンにだけ、気配のヒントを1回出す。
   */
  private checkSecretPassageHint(pos: Vec2, events: GameEvent[]): void {
    for (const secret of this.floor.secretPassages) {
      if (secret.hinted) continue;
      if (chebyshev(pos, secret.pos) <= 1) {
        secret.hinted = true;
        events.push({ type: "message", text: "――かすかに隙間の風を感じる。" });
      }
    }
  }

  /** 床に落ちている金貨(plan/shops-and-thieves.md)を、踏んだ瞬間に自動で拾う */
  private collectGold(pos: Vec2, events: GameEvent[]): void {
    const idx = this.floor.goldPiles.findIndex((g) => eq(g.pos, pos));
    if (idx < 0) return;
    const [pile] = this.floor.goldPiles.splice(idx, 1);
    this.player.gold += pile!.amount;
    events.push({ type: "message", text: t("msg.goldPicked", { amount: pile!.amount }) });
  }

  /**
   * 近道屋の出店(plan/shops-and-thieves.md)。未払いのまま持ち出した品を
   * 持ったまま部屋の外へ出ると万引き扱いになり、店主が豹変する。
   * 以後そのラン中は、新しく出会う出店すべてが最初から警戒状態(割高)になる
   */
  private checkShoplifting(from: Vec2, to: Vec2, events: GameEvent[]): void {
    const shopRoom = this.floor.rooms.find((r) => r.kind === "shop");
    if (!shopRoom || !roomContains(shopRoom, from) || roomContains(shopRoom, to)) return;
    const hasUnpaid = this.player.inventory.items.some((i) => i.unpaid);
    if (!hasUnpaid) return;

    for (const item of this.player.inventory.items) item.unpaid = false;
    this.shopWary = true;
    const keeper = this.floor.actors.find(
      (a): a is MonsterActor => a.alive && a.kind === "monster" && a.aiKind === "shopkeeper" && roomContains(shopRoom, a.pos),
    );
    if (keeper) keeper.angry = true;
    events.push({ type: "message", text: "万引きだ! 店主が豹変した!" });
  }

  private announceGround(pos: Vec2, events: GameEvent[]): void {
    const ground = this.floor.items.find((gi) => eq(gi.pos, pos));
    if (ground) {
      const price = ground.forSale ? `(${ground.forSale.price}ゴールド)` : "";
      events.push({
        type: "message",
        text: `${itemDef(ground.item.defId).name}${price}が落ちている。`,
      });
    }
    if (eq(pos, this.floor.stairs)) {
      events.push({ type: "message", text: "階段がある。" });
      // 表の寝穴では、地方の最終階(6階ごと)の階段だけが「めざめの階段」
      // として既知になる(plan/region-expansion.md)。他のダンジョン
      // (近道屋の裏穴・夜ごとの夢・腕試しの間)は地方の概念を持たないため
      // 従来どおりどの階の階段でも既知になる。
      // 足を踏み入れた瞬間に「既知」となる。ダイブの結果によらず記録されるべき
      // 事実なので、保存は呼び出し側(main.ts)が checkpoint イベントを見て行う
      if (this.onCheckpointFloor) {
        events.push({ type: "checkpoint", depth: this.depth });
        events.push({ type: "tutorialTip", id: "checkpoint" });
      }
    }
  }

  /**
   * モンスターハウス(plan/monster-house.md)の予告。部屋の外(通路側)から
   * 隣接した時点で、1フロアにつき一度だけ気配のメッセージを出す。
   * 部屋の中に入ってからでは手遅れなので、中にいる間は出さない。
   * 千里眼の輪(plan/protagonist-equipment.md)を装備していれば、
   * さらに1マス手前(距離2)から察知できる。
   */
  private checkMonsterHouseWarning(pos: Vec2, events: GameEvent[]): void {
    if (this.monsterHouseWarned) return;
    const room = this.floor.rooms.find((r) => r.kind === "monsterHouse");
    if (!room || roomContains(room, pos)) return;

    const range = hasEquipEffect(this.player.inventory, "farsight") ? 2 : 1;
    if (!isNearRoom(room, pos, range)) return;

    this.monsterHouseWarned = true;
    events.push({ type: "message", text: "――部屋の奥で何かがひしめいている気配がする。" });
  }

  /**
   * 見晴らしのはちまき(plan/protagonist-equipment.md)・松明(plan/region-darkness.md)・
   * ゆめわざ「ほのかなあかり」(plan/game/archive/companion-leveling-and-arts.md)ぶんの
   * 視界拡張。単純に加算する
   */
  private visionExtraRange(): number {
    const headband = hasEquipEffect(this.player.inventory, "lookout") ? 1 : 0;
    const torch = this.torchTurnsLeft > 0 ? TORCH_VISION_BONUS : 0;
    const lantern = this.lanternGlowTurns > 0 ? HONOKA_NA_AKARI_VISION_EXTRA : 0;
    // 元素タル(plan/game/archive/barrel-arts.md)
    const lightBarrelOpened = this.lightBarrelTurns > 0 ? LIGHT_BARREL_OPEN_VISION : 0;
    const lightBarrelCarried = this.player.carrying?.kind === "light" ? LIGHT_BARREL_CARRY_VISION_BONUS : 0;
    return headband + torch + lantern + lightBarrelOpened + lightBarrelCarried;
  }

  // ------------------------------------------------------------ 戦闘

  /** 装備中の武器の定義。未装備なら null(素手扱い、パターンは "single") */
  private equippedWeaponDef(): ItemDef | null {
    const uid = this.player.inventory.weaponUid;
    if (uid === null) return null;
    const item = findItem(this.player.inventory, uid);
    return item ? itemDef(item.defId) : null;
  }

  /**
   * プレイヤーの近接攻撃。装備中の武器の attackPattern に応じて、
   * 1体だけでなく複数マスを攻撃することがある(plan/protagonist-weapons.md)。
   * 「dir 方向へ体当たりして初めて発動する」という既存の操作感は変えず、
   * 当たり判定の形だけを武器ごとに変える。
   */
  private resolvePlayerAttack(dir: Dir, events: GameEvent[]): void {
    const player = this.player;
    const weapon = this.equippedWeaponDef();
    let pattern: WeaponPattern = weapon?.attackPattern ?? "single";
    // スキル「なぎはらい」「ふみこみ」(plan/game/archive/run-build-skills.md):
    // 武器の形が素手同然(single)のときだけ、ガルド自身の戦い方として上書きする
    // (専用の攻撃パターンを持つ武器を持っている間は、そちらを優先する)
    if (pattern === "single") {
      if (this.runSkills.includes("wideSlash")) pattern = "arc3";
      else if (this.runSkills.includes("stepIn")) pattern = "line2";
    }
    const critBonus = pattern === "quickSingle" ? QUICK_SINGLE_CRIT_BONUS : 0;
    let forceCrit = pattern === "quickSingle" && this.firstStrikeAvailable;

    const seen = new Set<number>();
    let hitAny = false;
    for (const offset of attackOffsets(pattern, dir)) {
      const pos = { x: player.pos.x + offset.x, y: player.pos.y + offset.y };
      const target = actorAt(this.floor, pos);
      if (!target || target.id === player.id || seen.has(target.id)) continue;
      if (target.kind !== "monster" || !isHostile(player, target)) continue;
      // 地方ボス(plan/region-boss-nushigaeru.md): 深みに隠れている間は
      // 姿を晦ませていて、近接攻撃が空振りする
      if (hasStatus(target, STATUS_INVISIBLE)) {
        events.push({ type: "message", text: `${displayActorName(target)}の姿が見えず、攻撃が空を切った。` });
        continue;
      }
      seen.add(target.id);
      hitAny = true;

      // 地方ボス(plan/region-boss-misemonononushi.md): 幻影を攻撃しても
      // ダメージは発生せず、その場で消えて本体が反撃する
      if (target.mirrorOf !== undefined) {
        this.floor.actors = this.floor.actors.filter((a) => a.id !== target.id);
        events.push({ type: "message", text: "――そっちは幻だった!" });
        const realBoss = this.floor.actors.find((a) => a.id === target.mirrorOf);
        if (realBoss?.alive) this.attack(realBoss, player, realBoss.atk, events);
        continue;
      }

      this.attack(player, target, totalAttack(player), events, { critBonus, forceCrit });
      forceCrit = false; // 強制会心はその手の最初の1体だけ

      // スキル「かちあげ」(plan/game/archive/run-build-skills.md): 攻撃した敵を1マス吹き飛ばす
      if (this.runSkills.includes("launcher") && target.alive) {
        this.pushMonster(dirFromDelta(target.pos.x - player.pos.x, target.pos.y - player.pos.y), target, events);
      }

      // 地方ボス(plan/region-boss-misemonononushi.md): 本体に命中すると、
      // 残っている幻影は見破られてすべて消える
      if (this.floor.actors.some((a) => a.kind === "monster" && a.mirrorOf === target.id)) {
        this.floor.actors = this.floor.actors.filter((a) => a.kind !== "monster" || a.mirrorOf !== target.id);
        target.mirrorTurnsLeft = undefined;
        events.push({ type: "message", text: "幻影が見破られ、消え去った!" });
      }
    }
    player.facing = dir;
    domainAlertNearbyMonsters(this.floor, player.pos, (region) => this.regionGimmickApplies(region));

    // スキル「タルやぶり」(plan/game/archive/run-build-skills.md): 敵に当たらなかった
    // 場合だけ、正面に置かれたタルを攻撃で割れる(敵がいれば従来どおり敵を優先する)
    if (!hitAny && this.runSkills.includes("barrelBurst")) {
      const front = { x: player.pos.x + dirDelta(dir).x, y: player.pos.y + dirDelta(dir).y };
      const barrel = barrelAt(this.floor, front);
      if (barrel) {
        domainBurstBarrel({
          floor: this.floor,
          rng: this.rng,
          player: this.player,
          runSkills: this.runSkills,
          oncePerRun: this.oncePerRun,
          partyGuardTurns: this.partyGuardTurns,
          barrel,
          events,
          throwerId: player.id,
          effectCtx: this.effectContext(events),
          isPlaying: () => this.status === "playing",
          damageActor: (target, dmg, crit) => this.damageActor(target, dmg, crit, events),
          pushMonster: (dir2, target, evts) => this.pushMonster(dir2, target, evts),
          recruitFromBarrel: (b, spot) =>
        domainRecruitFromBarrel({ floor: this.floor, barrel: b, spot, allies: this.allies, ids: this.ids, events }),
          setLightBarrelTurns: (turns) => {
            this.lightBarrelTurns = Math.max(this.lightBarrelTurns, turns);
          },
        });
      }
    }

    if (hitAny && pattern === "quickSingle") this.firstStrikeAvailable = false;
    if (hitAny && pattern === "heavySingle") {
      addStatus(this.effectContext(events), player, STATUS_RECOVER, HEAVY_RECOVER_TURNS, "隙ができた");
    }
  }

  private attack(
    attacker: Actor,
    target: Actor,
    attackPower: number,
    events: GameEvent[],
    combatOpts?: { critBonus?: number; forceCrit?: boolean },
  ): void {
    domainAttack({
      attacker,
      target,
      attackPower,
      events,
      combatOpts,
      rng: this.rng,
      floor: this.floor,
      player: this.player,
      allies: this.allies,
      runSkills: this.runSkills,
      oncePerRun: this.oncePerRun,
      echoAttackTurns: this.echoAttackTurns,
      partyGuardTurns: this.partyGuardTurns,
      damageActor: (target2, dmg, crit) => this.damageActor(target2, dmg, crit, events),
    });
  }

  private damageActor(target: Actor, damage: number, critical: boolean, events: GameEvent[]): void {
    domainDamageActor({
      floor: this.floor,
      target,
      damage,
      critical,
      events,
      hitThisTurn: this.hitThisTurn,
      playerInventory: this.player.inventory,
      runSkills: this.runSkills,
      oncePerRun: this.oncePerRun,
      recordPlayerDamageTaken: (amount) => {
        this.damageTakenThisRun += amount;
      },
      trueAwakeningEnding: (target2) => this.trueAwakeningEnding(target2, events),
      killActor: (target2) => this.killActor(target2, events),
    });
  }

  /** 地方ボス(plan/region-boss-kodamanonushi.md): 分身が紐づく本体を返す。紐づいていなければそのまま(sharesHpWithを持てるのはmonster/allyだけ) */
  private hpOwnerOf(actor: Actor): Actor {
    return hpOwnerOf(this.floor, actor);
  }

  private killActor(target: Actor, events: GameEvent[]): void {
    domainKillActor({
      floor: this.floor,
      rng: this.rng,
      target,
      events,
      runSkills: this.runSkills,
      allies: this.allies,
      player: this.player,
      trainingFocus: this.trainingFocus,
      depth: this.depth,
      dungeonFloorOffset: this.dungeon.floorOffset,
      ids: this.ids,
      defeatedRegionBossesThisRun: this.defeatedRegionBossesThisRun,
      defeatedRegionBossIdsAtStart: this.defeatedRegionBossIdsAtStart,
      endRun: (reason) => {
        this.status = "dead";
        this.endReason = reason;
        events.push({ type: "message", text: reason });
        events.push({ type: "gameOver", reason });
        events.push({ type: "tutorialTip", id: "death" });
      },
      removeAlly: (id) => {
        this.allies = this.allies.filter((a) => a.id !== id);
      },
      onLevelUp: (levels) => {
        // レベルアップ時のスキル選択(plan/game/archive/run-build-skills.md):
        // 1手で複数レベル上がっても、選択肢は1レベルぶんずつ順番に出す
        this.skillChoiceState.pendingLevelUpChoices += levels;
        this.offerNextSkillChoice(events);
      },
    });
  }

  /**
   * レベルアップ時のスキル選択(plan/game/archive/run-build-skills.md)。
   * 残っている選択肢があれば1つぶん3択を引いて提示する。系統がすべて
   * 習得済みで1件も引けなければ(全18件習得済み)、その分は静かに消費する
   */
  private offerNextSkillChoice(events: GameEvent[]): void {
    domainOfferNextSkillChoice({ state: this.skillChoiceState, rng: this.rng, runSkills: this.runSkills, events });
  }

  /** 提示中の3択から1つ選ぶ。候補外のidは無視する(不正な選択・二重送信対策) */
  private resolveSkillChoice(id: RunSkillId, events: GameEvent[]): void {
    domainResolveSkillChoice({
      state: this.skillChoiceState,
      id,
      runSkills: this.runSkills,
      rng: this.rng,
      events,
    });
  }

  // ------------------------------------------------------------ アイテム

  private pickUp(events: GameEvent[]): boolean {
    if (this.player.carrying) {
      events.push({ type: "message", text: "タルで手がふさがっている。" });
      return false;
    }
    const idx = this.floor.items.findIndex((gi) => eq(gi.pos, this.player.pos));
    if (idx < 0) {
      events.push({ type: "message", text: "足元には何もない。" });
      return false;
    }
    if (isFull(this.player.inventory)) {
      events.push({ type: "message", text: "持ち物がいっぱいだ。" });
      return false;
    }
    const [ground] = this.floor.items.splice(idx, 1);
    const item = ground!.item;
    const name = itemDef(item.defId).name;
    // 近道屋の出店(plan/shops-and-thieves.md)の売り物: 払えれば自動で購入する。
    // 足りなければ、未払いのまま持ち出したことになる(店の外へ出ると万引き扱い)
    if (ground!.forSale) {
      const price = ground!.forSale.price;
      if (this.player.gold >= price) {
        this.player.gold -= price;
        addItem(this.player.inventory, item);
        events.push({ type: "pickup", actorId: this.player.id, itemUid: item.uid, name });
        events.push({ type: "message", text: `${name}を${price}ゴールドで買った。` });
      } else {
        item.unpaid = true;
        addItem(this.player.inventory, item);
        events.push({ type: "pickup", actorId: this.player.id, itemUid: item.uid, name });
        events.push({ type: "message", text: `お金が足りない……${name}をだまって持ち出した。` });
      }
      return true;
    }
    addItem(this.player.inventory, item);
    events.push({ type: "pickup", actorId: this.player.id, itemUid: item.uid, name });
    events.push({ type: "message", text: `${name}をひろった。` });
    events.push({ type: "tutorialTip", id: "pickup" });
    return true;
  }

  private useItem(uid: number, events: GameEvent[]): boolean {
    const inv = this.player.inventory;
    const item = findItem(inv, uid);
    if (!item) return false;
    const def = itemDef(item.defId);

    if (
      def.category === "weapon" ||
      def.category === "shield" ||
      def.category === "head" ||
      def.category === "charm"
    ) {
      equip(inv, uid);
      events.push({ type: "equip", actorId: this.player.id, itemUid: uid, name: def.name });
      events.push({ type: "message", text: `${def.name}を装備した。` });
      return true;
    }

    if (def.category === "material") {
      // ゲンドの工房(拠点)専用の素材。ダンジョン内で使い道はない
      events.push({ type: "message", text: `「${def.name}」は素材だ。ここでは使えない。` });
      return false;
    }

    if (def.category === "tool") {
      const handled = this.useTool(item.defId, events);
      if (handled) {
        // 実績帳「挑戦」カテゴリ(plan/challenge-achievements.md)
        this.usedItemThisRun = true;
        removeItem(inv, uid);
      }
      return handled;
    }

    if (def.category === "staff") {
      if ((item.charges ?? 0) <= 0) {
        events.push({ type: "message", text: `${def.name}は もう振れない。` });
        return false;
      }
    }

    // 実績帳「挑戦」カテゴリ(plan/challenge-achievements.md): 装備・素材
    // (上の早期returnで除外済み)を除く、実際に道具を使う操作を記録する
    this.usedItemThisRun = true;

    events.push({ type: "useItem", actorId: this.player.id, itemUid: uid, name: def.name });
    events.push({ type: "message", text: `${def.name}を使った。` });

    const worked = applyEffect(
      this.effectContext(events),
      def.effect ?? "",
      def.power ?? 0,
      this.player.facing,
    );

    // 草は葉っぱを食べている(plan/herb-satiety-bonus.md): 「使う」操作の
    // ときだけ満腹度も少し回復する。敵への投げ当ては食べていないので
    // 対象外(そちらはthrow系の経路で、ここを通らない)。満タン時は黙る
    if (def.category === "herb") {
      const satietyBefore = this.player.satiety;
      this.player.satiety = Math.min(MAX_SATIETY, this.player.satiety + HERB_SATIETY_BONUS);
      if (this.player.satiety > satietyBefore) {
        events.push({ type: "message", text: "……少しだけおなかが満たされた。" });
      }
      // スキル「わけあう手」(plan/game/archive/run-build-skills.md): 回復の
      // 草を使うと、隣接する仲間にも半分の効果が及ぶ
      if (def.effect === "heal" && this.runSkills.includes("sharingHand")) {
        this.applySharingHand(def.power ?? 0, events);
      }
    }

    if (def.category === "staff") {
      if (worked) item.charges = (item.charges ?? 1) - 1;
    } else {
      removeItem(inv, uid);
    }
    return true;
  }

  /** スキル「わけあう手」。隣接する仲間全員に、回復量の半分ぶん分け与える */
  private applySharingHand(power: number, events: GameEvent[]): void {
    const amount = Math.round(power / 2);
    if (amount <= 0) return;
    for (const ally of this.allies) {
      if (!ally.alive || chebyshev(ally.pos, this.player.pos) !== 1) continue;
      const healed = Math.min(ally.maxHp - ally.hp, amount);
      if (healed <= 0) continue;
      ally.hp += healed;
      events.push({ type: "heal", actorId: ally.id, amount: healed, hpAfter: ally.hp });
      events.push({ type: "message", text: `${displayActorName(ally)}にも分け与え、HPが${healed}回復した。` });
    }
  }

  /**
   * 道具(plan/protagonist-equipment.md、category: "tool")の効果。
   * 杖・草のような`effect`文字列(items/effects.ts)には乗らない、
   * Gameクラス自身の状態(status・floor・allies)を直接操作する専用アクション。
   */
  private useTool(defId: string, events: GameEvent[]): boolean {
    switch (defId) {
      case "ashfireDust": {
        // めざめの階段を使わずに、その場で安全に麓へ戻る。踏破と同じ扱い
        // (持ち物・仲間を持ち帰れる)だが、checkpointイベントは出さないので
        // 「めざめの階段を使った」扱いにはならない
        this.status = "cleared";
        this.endReason = "送り火の粉で、その場から麓へ戻った。";
        events.push({ type: "message", text: this.endReason });
        events.push({ type: "gameOver", reason: this.endReason });
        return true;
      }
      // おキヨの見取り図(plan/side-stories-part2.md): 効果は樽の目利きと同等
      case "barrelAppraisal":
      case "okiyoSketchMap": {
        const found = this.floor.barrels
          .filter((b) => b.kind === "caught" && b.speciesId && isVisible(this.floor, b.pos))
          .map((b) => speciesById(b.speciesId!).name);
        events.push({
          type: "message",
          text:
            found.length > 0
              ? `タルの中身を見分けた: ${found.join("、")}`
              : "視界内にモンスター入りのタルは無かった。",
        });
        return true;
      }
      // オトネの覚え帳(plan/side-stories-part2.md): 効果は望郷の綱と同等
      case "homesickRope":
      case "otoneMemoBook": {
        let recalled = 0;
        for (const ally of this.allies) {
          if (!ally.alive) continue;
          const spot = this.freeSpotNear(this.player.pos);
          if (!spot) continue;
          const from = ally.pos;
          ally.pos = spot;
          events.push({ type: "teleport", actorId: ally.id, from, to: spot });
          recalled++;
        }
        events.push({
          type: "message",
          text: recalled > 0 ? "仲間を呼び寄せた!" : "呼び寄せる仲間がいない。",
        });
        return true;
      }
      case "torch": {
        // 松明(plan/region-darkness.md): 使い直すと残りターンが上書きされる(延長ではなく更新)。
        // 視界の再計算はcommand()側が使用直後に必ず行う(consumedTurn=trueになるため)
        this.torchTurnsLeft = TORCH_DURATION_TURNS;
        events.push({ type: "message", text: "松明に火を灯した。しばらく視界が広がる。" });
        return true;
      }
      default:
        return false;
    }
  }

  private throwItem(uid: number, events: GameEvent[]): boolean {
    const inv = this.player.inventory;
    const item = findItem(inv, uid);
    if (!item) return false;
    const def = itemDef(item.defId);
    removeItem(inv, uid);

    const from = this.player.pos;
    let landing = from;
    let hit: Actor | null = null;

    for (const p of walkLine(this.floor, from, this.player.facing, ITEM_THROW_RANGE)) {
      landing = p;
      const actor = actorAt(this.floor, p);
      if (actor && actor.id !== this.player.id) {
        hit = actor;
        break;
      }
    }

    events.push({ type: "throwItem", actorId: this.player.id, itemUid: uid, from, to: landing });
    events.push({ type: "message", text: `${def.name}を投げた。` });

    if (hit) {
      if (def.category === "herb" && def.effect === "heal") {
        // 草をぶつけると相手が回復してしまう
        const healed = Math.min(hit.maxHp - hit.hp, def.power ?? 0);
        hit.hp += healed;
        events.push({ type: "heal", actorId: hit.id, amount: healed, hpAfter: hit.hp });
        events.push({ type: "message", text: `${displayActorName(hit)}のHPが${healed}回復した。` });
      } else {
        const { damage, critical } = computeDamage(this.rng, 6, hit.def);
        events.push({ type: "message", text: `${def.name}が${displayActorName(hit)}に当たった!` });
        this.damageActor(hit, damage, critical, events);
      }
      return true;
    }

    // 誰にも当たらなければその場に落ちる
    if (!this.floor.items.some((gi) => eq(gi.pos, landing)) && !eq(landing, from)) {
      this.floor.items.push({ item, pos: landing });
    }
    return true;
  }

  private dropItem(uid: number, events: GameEvent[]): boolean {
    const pos = this.player.pos;
    const shopRoom = this.floor.rooms.find((r) => r.kind === "shop" && roomContains(r, pos));
    if (shopRoom) return this.sellItem(uid, events);
    if (this.floor.items.some((gi) => eq(gi.pos, pos))) {
      events.push({ type: "message", text: "ここには既に何か置いてある。" });
      return false;
    }
    const item = removeItem(this.player.inventory, uid);
    if (!item) return false;
    this.floor.items.push({ item, pos });
    events.push({ type: "drop", actorId: this.player.id, itemUid: uid, pos });
    events.push({ type: "message", text: `${itemDef(item.defId).name}を置いた。` });
    return true;
  }

  /** 店の部屋で「置く」を使うと売却になる(plan/item-selling.md) */
  private sellItem(uid: number, events: GameEvent[]): boolean {
    const item = removeItem(this.player.inventory, uid);
    if (!item) return false;
    const def = itemDef(item.defId);
    const price = sellPrice(def, item, this.shopWary);
    this.player.gold += price;
    events.push({ type: "message", text: `${def.name}を${price}ゴールドで売った。` });
    return true;
  }

  // ------------------------------------------------------------ 罠

  private checkTrap(pos: Vec2, events: GameEvent[]): void {
    domainCheckTrap({
      floor: this.floor,
      pos,
      rng: this.rng,
      player: this.player,
      depth: this.depth,
      events,
      damageActor: (target, dmg, crit) => this.damageActor(target, dmg, crit, events),
      regionGimmickApplies: (region) => this.regionGimmickApplies(region),
      descend: () => this.descend(events),
    });
  }

  // ------------------------------------------------------------ モンスターの行動

  /**
   * プレイヤー以外の全員を動かす。仲間もモンスターも同じ枠で処理する。
   *
   * 距離場は陣営ごとに1本ずつ作って全員で使い回す。始点を「その陣営の敵全員」に
   * しておけば、各自が自然といちばん近い相手へ向かう。
   */
  private resolveTurn(events: GameEvent[], posBeforeCommand: Vec2): void {
    domainResolveTurn({
      floor: this.floor,
      rng: this.rng,
      player: this.player,
      allies: this.allies,
      runSkills: this.runSkills,
      oncePerRun: this.oncePerRun,
      mood: this.mood,
      events,
      echoAttackTurns: this.echoAttackTurns,
      partyGuardTurns: this.partyGuardTurns,
      isPlaying: () => this.status === "playing",
      damageActor: (target, dmg, crit) => this.damageActor(target, dmg, crit, events),
      buildBossMoveContext: (actor) => this.bossMoveContext(actor, events),
      buildDreamArtContext: (actor) => this.dreamArtContext(actor, events),
      posBeforeCommand,
      upkeep: () => this.upkeep(events),
      incrementTurnCount: () => {
        this.turnCount++;
      },
    });
  }

  /**
   * 第五地方(なみだの滝つぼ)固有ギミック(plan/waterfall-torrent.md): 奔流タイルへ
   * 移動すると、その向きへ連鎖的に押し流される(最大4マス)。壁・他アクター・タルが
   * あれば手前で止まる。プレイヤー・仲間・モンスターの移動処理の末尾で共通に呼ぶ
   */
  private applyTorrentPush(actor: Actor, events: GameEvent[]): Vec2 {
    return domainApplyTorrentPush(this.floor, actor, events);
  }

  // ------------------------------------------------------------ 毎ターンの処理

  private upkeep(events: GameEvent[]): void {
    this.torchTurnsLeft = domainUpkeep({
      floor: this.floor,
      player: this.player,
      events,
      turnCount: this.turnCount,
      dungeonSatietyDrainMul: this.dungeon.satietyDrainMul,
      difficulty: this.difficulty,
      hitThisTurn: this.hitThisTurn,
      torchTurnsLeft: this.torchTurnsLeft,
      isPlaying: () => this.status === "playing",
      damageActor: (target, dmg, crit) => this.damageActor(target, dmg, crit, events),
      tickDreamArts: () => this.tickDreamArts(events),
      tickSporeRooms: () => domainTickSporeRooms(this.floor, this.rng, this.player, events),
      tickSummonedTorrentTiles: () => domainTickSummonedTorrentTiles(this.floor),
      tickBoneWalls: () => domainTickBoneWalls(this.floor),
      tickMirrors: () => domainTickMirrors(this.floor, events),
      spawnIfDue: () => {
        if (this.turnCount > 0 && this.turnCount % SPAWN_INTERVAL === 0) {
          spawnWanderingMonster(this.rng, this.floor, this.ids, this.player.pos, this.dungeon.floorOffset ?? 0);
        }
      },
      // 倒された者を取り除く。プレイヤーは死んでも参照が要るので残す
      removeDead: () => {
        this.floor.actors = this.floor.actors.filter((a) => a.alive || a.kind === "player");
        this.allies = this.allies.filter((a) => a.alive);
      },
    });
  }

  /**
   * ゆめわざ(plan/game/archive/companion-leveling-and-arts.md)のクールダウン・
   * 一時効果を1ターンぶん減らす。「ほのかなあかり」「ゆめのかけぶとん」は
   * パーティ全体の効果なのでGame自身のフィールドを、「ホネつよし」は
   * 発動した個体ごとの効果なのでAllyActor側のフィールドを減らす
   */
  private tickDreamArts(events: GameEvent[]): void {
    if (this.lanternGlowTurns > 0) {
      this.lanternGlowTurns--;
      if (this.lanternGlowTurns === 0) events.push({ type: "message", text: "ほのかなあかりが消えた。" });
    }
    if (this.partyGuardTurns > 0) this.partyGuardTurns--;
    if (this.echoAttackTurns > 0) {
      this.echoAttackTurns--;
      if (this.echoAttackTurns === 0) events.push({ type: "message", text: "こだまの雄叫びの余韻が消えた。" });
    }
    // 元素タル(plan/game/archive/barrel-arts.md): 光タルをあけた効果
    if (this.lightBarrelTurns > 0) {
      this.lightBarrelTurns--;
      if (this.lightBarrelTurns === 0) events.push({ type: "message", text: "光タルの明かりが消えた。" });
    }
    domainTickAllyDreamArts(this.floor);
  }

  // ------------------------------------------------------------ 補助

  private effectContext(events: GameEvent[]): EffectContext {
    return { rng: this.rng, floor: this.floor, player: this.player, events };
  }

  /** 地方ボスの大技(systems/bossMoves.tsのBOSS_MOVES)に渡す、narrowなGameアクセス */
  private bossMoveContext(actor: MonsterActor, events: GameEvent[]): BossMoveContext {
    return {
      actor,
      floor: this.floor,
      rng: this.rng,
      ids: this.ids,
      events,
      applyRoomWideStatus: (occupants, kind, chance, turns, verb, evts) =>
        domainApplyRoomWideStatus({ rng: this.rng, floor: this.floor, player: this.player, events: evts }, occupants, kind, chance, turns, verb),
      freeSpotNear: (center) => this.freeSpotNear(center),
      damageActor: (target, damage, critical, evts) => this.damageActor(target, damage, critical, evts),
      isGameOver: () => this.status !== "playing",
    };
  }

  /** ゆめわざ(domain/party/dreamArtEffects.tsのDREAM_ART_EFFECTS)に渡す、narrowなGameアクセス */
  private dreamArtContext(actor: AllyActor, events: GameEvent[]): DreamArtContext {
    return {
      actor,
      floor: this.floor,
      rng: this.rng,
      leader: this.player,
      events,
      addStatus: (target, kind, turns, verb) => addStatus(this.effectContext(events), target, kind, turns, verb),
      damageActor: (target, damage, critical, evts) => this.damageActor(target, damage, critical, evts),
      mitigateIncomingDamage: (target, damage, evts) =>
        mitigateIncomingDamage({
          target,
          damage,
          events: evts,
          rng: this.rng,
          runSkills: this.runSkills,
          player: this.player,
          oncePerRun: this.oncePerRun,
          partyGuardTurns: this.partyGuardTurns,
        }),
      pushMonster: (dir, target, evts) => this.pushMonster(dir, target, evts),
      extendLanternGlow: (turns) => {
        this.lanternGlowTurns = Math.max(this.lanternGlowTurns, turns);
      },
      extendPartyGuard: (turns) => {
        this.partyGuardTurns = Math.max(this.partyGuardTurns, turns);
      },
      applyRoomWideStatus: (occupants, kind, chance, turns, verb, evts) =>
        domainApplyRoomWideStatus({ rng: this.rng, floor: this.floor, player: this.player, events: evts }, occupants, kind, chance, turns, verb),
      placeTemporaryWall: (pos, turns) => domainPlaceTemporaryWall(this.floor, actor, pos, turns),
      digWall: (pos) => domainDigWall(this.floor, pos),
      extendEchoAttack: (turns) => {
        this.echoAttackTurns = Math.max(this.echoAttackTurns, turns);
      },
    };
  }

  // placeTemporaryWall/digWallはdomain/dungeon/floorGimmicks.tsへ移動した

  /** テストとデバッグ用。指定した種類のアイテムを持ち物に足す */
  giveItem(defId: string): Item | null {
    const def = itemDef(defId);
    const item = createItem(this.ids.nextItemUid(), def.id, def.charges);
    return addItem(this.player.inventory, item) ? item : null;
  }

  /** テストとデバッグ用。タルを抱えた状態にする */
  giveBarrel(kind: BarrelKind, speciesId?: string): Barrel {
    const barrel = createBarrel(this.ids.nextBarrelId(), kind, this.player.pos, speciesId);
    this.player.carrying = barrel;
    return barrel;
  }

  /**
   * 空のタルを抱えているあいだ、投げ先のモンスターの入りやすさを返す
   * (plan/game/barrel-capture-clarity.md)。抱えていない・空のタルでない・
   * 投げ先にモンスターがいない場合はnull。
   *
   * 見込みは「タルを当てた直後のHP」で試算する。空のタルの命中ダメージは
   * 相手を倒さない(HP1で止まる)ので、低HP種に投げれば実際に高確率で入る。
   * 現在のHPのまま見せると、この仕様の主目的である低HP種でかえって
   * 実態と食い違うため。ダメージの乱数・会心は見込みに織り込まない
   */
  captureOutlook(): CaptureOutlook | null {
    const carrying = this.player.carrying;
    if (!carrying || carrying.kind !== "empty") return null;
    const hits = traceThrow(
      this.floor,
      this.player.pos,
      this.player.facing,
      this.barrelThrowRange(),
      this.player.pierceReady,
      this.player.id,
    ).hits;
    const target = hits[hits.length - 1];
    if (!target) return null;
    return captureOutlookFor(
      target,
      this.hpOwnerOf(target).hp,
      this.player.inventory,
      barrelThrowDamage(this.player.inventory),
    );
  }

  /** 連れている仲間(表示や判定の入口) */
  get allyList(): readonly AllyActor[] {
    return this.allies;
  }

  /** 満腹度の割合(0〜1) */
  get satietyRatio(): number {
    return this.player.satiety / MAX_SATIETY;
  }

  /** 空いているマスを1つ返す。デバッグやテストでの配置に使う */
  freeTile(): Vec2 | null {
    return findFreeTile(this.rng, this.floor, {});
  }

  /** プレイヤーから見えているモンスター */
  visibleMonsters(): Actor[] {
    return this.floor.actors.filter(
      (a) =>
        a.kind === "monster" &&
        a.alive &&
        (this.floor.tiles[a.pos.y * this.floor.width + a.pos.x]?.visible ?? false),
    );
  }

  /** 隣にいるモンスター。UIの攻撃対象表示に使う */
  adjacentMonsters(): Actor[] {
    return this.floor.actors.filter(
      (a) => a.kind === "monster" && a.alive && chebyshev(a.pos, this.player.pos) === 1,
    );
  }
}
