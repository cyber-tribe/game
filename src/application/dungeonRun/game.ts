import { Rng } from "../../core/rng";
import { OncePerRunTracker } from "../../core/oncePerRunTracker";
import { TARUKURABE_PERFECT_SCORE, type RunSnapshot, type RunStatus } from "../../core/runSnapshot";
import {
  type Dir,
  type Vec2,
  chebyshev,
  dirDelta,
  dirFromDelta,
  eq,
} from "../../core/grid";
import type { GameEvent } from "../../core/events";
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
  type FloorGimmickKind,
  type FloorState,
  type Item,
  type ItemDef,
  type MonsterActor,
  type RunSkillId,
  type TargetActor,
  type WeaponPattern,
  actorAt,
  barrelAt,
  freeSpotNear,
  hasStatus,
  hpOwnerOf,
  isHostile,
  roomContains,
  walkableAt,
} from "../../core/types";
import { type ArtId } from "../../entities/arts";
import { useArt as domainUseArt } from "../../domain/player/arts";
import {
  type IdSource,
  createAllyFromStored,
  createBarrel,
  createItem,
  findFreeTile,
  spawnWanderingMonster,
} from "../../domain/dungeon/populate";
import { displayActorName } from "../../entities/naming";
import { ALLY_STANCE_NAMES, barrelDisplayName } from "../../entities/displayNames";
import {
  isCheckpointFloor,
  type DungeonDef,
  REGION_DUNGEON_IDS,
  TARUKURABE_ID,
  dungeonById,
} from "../../entities/dungeons";
import { DEFAULT_MOOD_ID, type MoodDef, type MoodId, moodDef } from "../../entities/moods";
import type { StoredMonster } from "../../entities/storedMonster";
import { isVisible, updateVisibility } from "../../domain/dungeon/visibility";
import type { DifficultyMode } from "../../entities/difficulty";
import {
  MAX_ALLIES,
  MAX_SATIETY,
  type PlayerState,
  type TrainingFocus,
  createPlayer,
  totalAttack,
} from "../../entities/player";
import { HONOKA_NA_AKARI_VISION_EXTRA, type DreamArtContext } from "../../domain/party/dreamArtEffects";
import { itemDef } from "../../entities/itemCatalog";
import { type EffectContext, addStatus } from "../../domain/item/effects";
import {
  type ItemActionContext,
  throwItem as domainThrowItem,
  useItem as domainUseItem,
} from "../../domain/item/itemActions";
import {
  addItem,
  displayName,
  equip,
  equippedWeaponModel,
  findItem,
  hasEquipEffect,
  isFull,
  removeItem,
} from "../../domain/item/inventory";
import { attackOffsets } from "../../domain/combat/attackPattern";
import { computeDamage } from "../../domain/combat/damageCalculation";
import { barrelThrowDamage, mitigateIncomingDamage } from "../../domain/combat/damageModifier";
import { BARREL_RANGE, LIGHT_CARRY_RANGE_BONUS, traceThrow } from "../../domain/barrel/barrelThrow";
import { releaseFromBarrel as domainReleaseFromBarrel } from "../../domain/barrel/barrelDrop";
import {
  LIGHT_BARREL_CONFUSE_TURNS,
  SLEEP_BARREL_SLEEP_TURNS,
  STONE_BARREL_DAMAGE_MULTIPLIER,
  WATER_BARREL_DAMAGE_MULTIPLIER,
  WIND_BARREL_PUSH_DISTANCE,
  applyElementalBarrelHit,
} from "../../domain/barrel/barrelElemental";
import {
  LIGHT_BARREL_OPEN_TURNS,
  openSleepBarrel,
  openStoneBarrel,
  openWaterBarrel,
  openWindBarrel,
} from "../../domain/barrel/barrelOpen";
import { burstBarrel as domainBurstBarrel, explode as domainExplode } from "../../domain/barrel/barrelExplosion";
import {
  type CaptureOutlook,
  captureOutlookFor,
  resolveEmptyBarrel as domainResolveEmptyBarrel,
} from "../../domain/barrel/barrelCapture";
import type { BossMoveContext } from "../../domain/dungeon/bossMoves";
import { damageActor as domainDamageActor, killActor as domainKillActor } from "../../domain/turn/damage";
import { attack as domainAttack } from "../../domain/turn/attackResolution";
import { pushMonster as domainPushMonster } from "../../domain/turn/actorActions";
import { movePlayer as domainMovePlayer } from "../../domain/turn/movement";
import {
  type TarukurabeContext,
  enterTarukurabeFloor as domainEnterTarukurabeFloor,
  finishTarukurabeThrow as domainFinishTarukurabeThrow,
  resolveTarukurabeHit as domainResolveTarukurabeHit,
} from "../../domain/tarukurabe/tarukurabe";
import {
  type ShopContext,
  checkShoplifting as domainCheckShoplifting,
  sellItem as domainSellItem,
} from "../../domain/dungeon/shop";
import {
  type StoryMomentsContext,
  maybePlayMountainCoreEnding as domainMaybePlayMountainCoreEnding,
  trueAwakeningEnding as domainTrueAwakeningEnding,
} from "./storyMoments";
import { resolveCommandDispatch } from "./commands";
import { resolveTurn as domainResolveTurn, upkeep as domainUpkeep } from "../../domain/turn/turnCycle";
import {
  createSkillChoiceState,
  isAwaitingSkillChoice,
  offerNextSkillChoice as domainOfferNextSkillChoice,
  resolveSkillChoice as domainResolveSkillChoice,
  type SkillChoiceState,
} from "../../domain/player/runSkills";
import { recruitFromBarrel as domainRecruitFromBarrel } from "../../domain/party/recruit";
import { tickAllyDreamArts as domainTickAllyDreamArts } from "../../domain/party/dreamArts";
import {
  adjacentFreeSpot as domainAdjacentFreeSpot,
  applyRoomWideStatus as domainApplyRoomWideStatus,
  digWall as domainDigWall,
  placeTemporaryWall as domainPlaceTemporaryWall,
  tickBoneWalls as domainTickBoneWalls,
  tickMirrors as domainTickMirrors,
  tickSporeRooms as domainTickSporeRooms,
  tickSummonedTorrentTiles as domainTickSummonedTorrentTiles,
} from "../../domain/dungeon/floorGimmicks";
import { alertNearbyMonsters as domainAlertNearbyMonsters, checkTrap as domainCheckTrap } from "../../domain/dungeon/traps";
import {
  announceGround as domainAnnounceGround,
  bankRun as domainBankRun,
  checkMonsterHouseWarning as domainCheckMonsterHouseWarning,
  checkSecretPassageHint as domainCheckSecretPassageHint,
  collectGold as domainCollectGold,
  descend as domainDescend,
  openDoor as domainOpenDoor,
  regionGimmickApplies as domainRegionGimmickApplies,
} from "../../domain/dungeon/progression";
import {
  beginBranchDungeon as domainBeginBranchDungeon,
  endBranchDungeon as domainEndBranchDungeon,
  enterFloor as domainEnterFloor,
  findBranchEntranceDungeonId as domainFindBranchEntranceDungeonId,
  type HostDungeonContext,
} from "../../domain/dungeon/floorEntry";

/** 双樽鉤(quickSingle)の会心率の上乗せ分 */
const QUICK_SINGLE_CRIT_BONUS = 0.15;
/** 主の大槌(heavySingle)の反動。1ターン分の行動を失わせる(既存の状態異常と同じ off-by-one 消化) */
const HEAVY_RECOVER_TURNS = 2;

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

export type { RunSnapshot, RunStatus } from "../../core/runSnapshot";

/** このターンごとにモンスターが1体湧く */
const SPAWN_INTERVAL = 45;

/** 松明: 見晴らしのはちまき(+1)より強い光源として、くらやみの階の暗さを大きく緩和する */
const TORCH_VISION_BONUS = 2;

// ---- 元素タル(plan/game/archive/barrel-arts.md) ----
/** あける(部屋全体を明るくする)の視界拡張。強化版は視界+1 */
const LIGHT_BARREL_OPEN_VISION = 2;
/** 頭上に持つ(光タル): 視界+2(ほのかなあかり等と同じ単純加算) */
const LIGHT_BARREL_CARRY_VISION_BONUS = 2;
// ---- plan/tarukurabe-minigame.md ----
/**
 * 遠の的(距離9)は通常のBARREL_RANGE(8)より遠いため、専用モードだけ
 * タルの飛距離を伸ばす(他のダイブの投擲距離には一切影響しない)
 */
const TARUKURABE_THROW_RANGE = 9;
export { TARUKURABE_PERFECT_SCORE };

/**
 * 武器の系統id(plan/challenge-achievements.md)。基本形・上位形は同じ
 * attackPatternを持つので、そのまま系統として使える(plan/protagonist-
 * weapons.md)。なた系統(attackPattern未指定)は"basic"に統一する
 */
function weaponKindOf(defId: string): string {
  return itemDef(defId).attackPattern ?? "basic";
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
  dungeon: DungeonDef = dungeonById(REGION_DUNGEON_IDS[0]);

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

    const result = domainEnterFloor(depth, {
      rng: this.rng,
      ids: this.ids,
      dungeonId: this.dungeon.id,
      dungeonMaxDepth: this.dungeon.maxDepth,
      dungeonMonsterHouseRateMul: this.dungeon.monsterHouseRateMul,
      dungeonShopRateMul: this.dungeon.shopRateMul,
      dungeonMonsterCountMul: this.dungeon.monsterCountMul,
      dungeonFloorOffset: this.dungeon.floorOffset,
      maxDepth: this.maxDepth,
      difficulty: this.difficulty,
      mood: this.mood,
      player: this.player,
      allies: this.allies,
      trueAwakeningCleared: this.trueAwakeningCleared,
      compendiumComplete: this.compendiumComplete,
      shopWary: this.shopWary,
      shopSeenThisRun: this.shopSeenThisRun,
      mosaicRegions: this.mosaicRegions,
      previousGimmick: this.previousGimmick,
      defeatedRegionBossCountAtStart: this.defeatedRegionBossCountAtStart,
      visionExtraRange: this.visionExtraRange(),
    });
    this.floor = result.floor;
    this.mosaicRegions = result.mosaicRegions;
    this.previousGimmick = result.previousGimmick;
    this.shopSeenThisRun = result.shopSeenThisRun;
  }

  /**
   * 横穴(分岐ダンジョン、plan/game/dungeon-per-region.md)に入る。今いる
   * 地方ダンジョンの状態(ダンジョン・最大階数・現在階・フロア)を退避し、
   * 分岐ダンジョンの1階目を通常どおり生成する。プレイヤー・仲間・持ち物・
   * ターン数・気分・難易度などダイブ全体にかかる状態はいじらない
   */
  private enterBranchDungeon(branchDungeonId: string, events: GameEvent[]): boolean {
    const result = domainBeginBranchDungeon({
      branchDungeonId,
      alreadyInBranch: this.hostContext !== null,
      dungeon: this.dungeon,
      maxDepth: this.maxDepth,
      depth: this.depth,
      floor: this.floor,
      previousGimmick: this.previousGimmick,
      mosaicRegions: this.mosaicRegions,
      monsterHouseWarned: this.monsterHouseWarned,
      shopSeenThisRun: this.shopSeenThisRun,
    });
    if (!result) return false; // 横穴の中からさらに横穴には入れない(入れ子なし)
    this.hostContext = result.hostContext;
    this.dungeon = result.dungeon;
    this.maxDepth = result.maxDepth;
    this.previousGimmick = result.previousGimmick;
    this.mosaicRegions = result.mosaicRegions;
    this.shopSeenThisRun = result.shopSeenThisRun;
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
    const result = domainEndBranchDungeon({
      hostContext: host,
      player: this.player,
      visionExtraRange: this.visionExtraRange(),
      events,
    });
    this.dungeon = result.dungeon;
    this.maxDepth = result.maxDepth;
    this.depth = result.depth;
    this.floor = result.floor;
    this.previousGimmick = result.previousGimmick;
    this.mosaicRegions = result.mosaicRegions;
    this.monsterHouseWarned = result.monsterHouseWarned;
    this.shopSeenThisRun = result.shopSeenThisRun;
  }

  /**
   * 樽比べ(plan/tarukurabe-minigame.md)。手作りの固定Floorを直接組み立てる。
   * generateFloor/populateFloorは一切呼ばない(乱数要素を排除し、毎回同じ
   * 配置にするため)。仲間・持ち込み品は盤面に出さない(専用モードは常にソロ)
   */
  private enterTarukurabeFloor(): void {
    const result = domainEnterTarukurabeFloor({
      depth: this.depth,
      ids: this.ids,
      player: this.player,
      scoredLanes: this.tarukurabeScoredLanes,
      visionExtraRange: () => this.visionExtraRange(),
    });
    this.floor = result.floor;
    this.tarukurabeScore = result.tarukurabeScore;
    this.tarukurabeBarrelsLeft = result.tarukurabeBarrelsLeft;
  }

  /** resolveTarukurabeHit/finishTarukurabeThrow(domain/tarukurabe/tarukurabe.ts)に渡す、narrowなGameアクセス */
  private tarukurabeContext(): TarukurabeContext {
    return {
      floor: this.floor,
      player: this.player,
      ids: this.ids,
      getScore: () => this.tarukurabeScore,
      setScore: (score) => {
        this.tarukurabeScore = score;
      },
      getBarrelsLeft: () => this.tarukurabeBarrelsLeft,
      setBarrelsLeft: (n) => {
        this.tarukurabeBarrelsLeft = n;
      },
      scoredLanes: this.tarukurabeScoredLanes,
      completeRun: (reason, events) => this.completeRun(reason, events),
    };
  }

  /**
   * 地方固有ギミックの適用条件。今いるダンジョン自身がその地方か、または
   * 第八地方(めざめの前庭)固有ギミック(plan/dream-garden-mosaic.md)で
   * その地方番号が今回のフロアのmosaicRegionsに選ばれていれば true
   */
  private regionGimmickApplies(region: number): boolean {
    return domainRegionGimmickApplies(region, this.dungeon.id, this.mosaicRegions);
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
  pushBackFromStairs(events: GameEvent[]): void {
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
  /** maybePlayMountainCoreEnding/trueAwakeningEnding(application/dungeonRun/storyMoments.ts)に渡す、narrowなGameアクセス */
  private storyMomentsContext(): StoryMomentsContext {
    return {
      dungeonId: this.dungeon.id,
      depth: this.depth,
      maxDepth: this.maxDepth,
      floor: this.floor,
      allies: this.allies,
      completeRun: (reason, events) => this.completeRun(reason, events),
    };
  }

  private maybePlayMountainCoreEnding(events: GameEvent[]): void {
    domainMaybePlayMountainCoreEnding(events, this.storyMomentsContext());
  }

  /**
   * 真の目覚め(plan/true-awakening.md): 「はじめの夢」のHPが0になった瞬間に
   * killActorの代わりに呼ぶ。討伐・ドロップ・経験値は発生させず、絆(なじみ)
   * に応じた締めの一言を挟んでダイブを踏破扱いで終える
   */
  private trueAwakeningEnding(target: MonsterActor, events: GameEvent[]): void {
    domainTrueAwakeningEnding(target, events, this.storyMomentsContext());
  }

  descend(events: GameEvent[]): void {
    domainDescend({
      depth: this.depth,
      maxDepth: this.maxDepth,
      isInBranchDungeon: this.hostContext !== null,
      events,
      enterFloor: (depth) => {
        this.enterFloor(depth);
        return { depth: this.depth, gimmick: this.floor.gimmick };
      },
      returnFromBranchDungeon: (evts) => this.returnFromBranchDungeon(evts),
      maybePlayMountainCoreEnding: (evts) => this.maybePlayMountainCoreEnding(evts),
      completeRun: (reason, evts) => this.completeRun(reason, evts),
    });
  }

  /** ダイブを成功扱いで終える(踏破・区切りで共通)。status="cleared"にし、理由メッセージ・gameOverイベントを出す */
  private completeRun(reason: string, events: GameEvent[]): void {
    this.status = "cleared";
    this.endReason = reason;
    events.push({ type: "message", text: reason });
    events.push({ type: "gameOver", reason });
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
  bankRun(events: GameEvent[]): boolean {
    return domainBankRun({
      playerPos: this.player.pos,
      stairs: this.floor.stairs,
      isCarrying: this.player.carrying !== null,
      depth: this.depth,
      events,
      pushBackFromStairs: (evts) => this.pushBackFromStairs(evts),
      maybePlayMountainCoreEnding: (evts) => this.maybePlayMountainCoreEnding(evts),
      completeRun: (reason, evts) => this.completeRun(reason, evts),
    });
  }

  /**
   * ボスの間の扉を開ける(plan/game/dungeon-boss-rooms.md)。扉のすぐ前
   * (8方向いずれかの隣接マス)に立っていなければ弾く。開けるとその場で
   * ボスの気配を告げるメッセージを出し、doorOpenedイベントでBGM切り替えを
   * main.ts側に伝える。開閉そのものはターンを消費しない(仕度を挟める、
   * というdocの意図どおり)
   */
  openDoor(events: GameEvent[]): boolean {
    return domainOpenDoor(this.floor.door, this.player.pos, events);
  }

  /**
   * 横穴(分岐ダンジョン、plan/game/dungeon-per-region.md)の入り口に立って
   * 確定したときに呼ぶ。入り口のマスに立っていなければ弾く
   */
  enterBranchTile(events: GameEvent[]): boolean {
    const branchDungeonId = domainFindBranchEntranceDungeonId(this.floor, this.player.pos);
    if (!branchDungeonId) {
      events.push({ type: "message", text: "ここに横穴はない。" });
      return false;
    }
    return this.enterBranchDungeon(branchDungeonId, events);
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

    return resolveCommandDispatch(this, cmd, events);
  }

  // ------------------------------------------------------------ 仲間への指示

  /** 構えを設定する。指示そのものはターンを消費しない */
  setAllyStance(
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
  useArt(id: ArtId, events: GameEvent[]): boolean {
    return domainUseArt(id, events, { player: this.player, floor: this.floor });
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
  throwCarriedBarrel(events: GameEvent[]): boolean {
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
  openCarriedBarrel(events: GameEvent[]): boolean {
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
    domainResolveTarukurabeHit(hit, events, this.tarukurabeContext());
  }

  /**
   * 樽比べ(plan/tarukurabe-minigame.md): 1投の解決後に呼ぶ。タルを1個消費し、
   * 終了条件(全ての的に命中済み、またはタルを使い切った)を満たしていれば
   * 専用モードを終了する。満たしていなければ次の1個を投擲台に供給する
   */
  finishTarukurabeThrow(events: GameEvent[]): void {
    domainFinishTarukurabeThrow(events, this.tarukurabeContext());
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


  movePlayer(dir: Dir, events: GameEvent[]): boolean {
    return domainMovePlayer(dir, events, {
      player: this.player,
      floor: this.floor,
      rng: this.rng,
      allies: this.allies,
      ids: this.ids,
      checkTrap: (pos, evts) => this.checkTrap(pos, evts),
      collectGold: (pos, evts) => this.collectGold(pos, evts),
      checkShoplifting: (from, to, evts) => this.checkShoplifting(from, to, evts),
      announceGround: (pos, evts) => this.announceGround(pos, evts),
      checkMonsterHouseWarning: (pos, evts) => this.checkMonsterHouseWarning(pos, evts),
      checkSecretPassageHint: (pos, evts) => this.checkSecretPassageHint(pos, evts),
    });
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

  private checkSecretPassageHint(pos: Vec2, events: GameEvent[]): void {
    domainCheckSecretPassageHint(this.floor, pos, events);
  }

  private collectGold(pos: Vec2, events: GameEvent[]): void {
    domainCollectGold(this.floor, this.player, pos, events);
  }

  /** checkShoplifting/sellItem(domain/dungeon/shop.ts)に渡す、narrowなGameアクセス */
  private shopContext(): ShopContext {
    return {
      floor: this.floor,
      player: this.player,
      getShopWary: () => this.shopWary,
      setShopWary: (wary) => {
        this.shopWary = wary;
      },
    };
  }

  private checkShoplifting(from: Vec2, to: Vec2, events: GameEvent[]): void {
    domainCheckShoplifting(from, to, events, this.shopContext());
  }

  private announceGround(pos: Vec2, events: GameEvent[]): void {
    domainAnnounceGround({ floor: this.floor, pos, dungeonId: this.dungeon.id, depth: this.depth, events });
  }

  private checkMonsterHouseWarning(pos: Vec2, events: GameEvent[]): void {
    this.monsterHouseWarned = domainCheckMonsterHouseWarning({
      floor: this.floor,
      pos,
      player: this.player,
      monsterHouseWarned: this.monsterHouseWarned,
      events,
    });
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
  resolvePlayerAttack(dir: Dir, events: GameEvent[]): void {
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

  pickUp(events: GameEvent[]): boolean {
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

  /** useItem/useTool/throwItem(domain/item/itemActions.ts)に渡す、narrowなGameアクセス */
  private itemActionContext(): ItemActionContext {
    return {
      player: this.player,
      floor: this.floor,
      allies: this.allies,
      rng: this.rng,
      runSkills: this.runSkills,
      damageActor: (target, damage, critical, evts) => this.damageActor(target, damage, critical, evts),
      freeSpotNear: (center) => this.freeSpotNear(center),
      completeRun: (reason, evts) => this.completeRun(reason, evts),
      setTorchTurnsLeft: (turns) => {
        this.torchTurnsLeft = turns;
      },
      markUsedItemThisRun: () => {
        this.usedItemThisRun = true;
      },
    };
  }

  useItem(uid: number, events: GameEvent[]): boolean {
    return domainUseItem(uid, events, this.itemActionContext());
  }

  equipItem(uid: number, events: GameEvent[]): boolean {
    const player = this.player;
    const item = findItem(player.inventory, uid);
    if (!item) return false;
    const def = itemDef(item.defId);
    // 実績帳「挑戦」カテゴリ(plan/challenge-achievements.md): 武器の
    // 持ち替えを記録する。装備中の武器を「はずす」操作(トグルの逆方向)
    // は持ち替えに数えない。素手・未装備からの初回装備も系統を記録する
    // だけで持ち替えに数えない
    if (def.category === "weapon" && player.inventory.weaponUid !== uid) {
      const kind = weaponKindOf(item.defId);
      if (this.weaponKindThisRun !== undefined && this.weaponKindThisRun !== kind) {
        this.usedMultipleWeaponsThisRun = true;
      }
      this.weaponKindThisRun = kind;
    }
    equip(player.inventory, uid);
    events.push({ type: "equip", actorId: player.id, itemUid: uid, name: def.name });
    events.push({
      type: "message",
      text: `${displayName(player.inventory, item)}を装備した。`,
    });
    return true;
  }

  throwItem(uid: number, events: GameEvent[]): boolean {
    return domainThrowItem(uid, events, this.itemActionContext());
  }

  dropItem(uid: number, events: GameEvent[]): boolean {
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
    return domainSellItem(uid, events, this.shopContext());
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

  /** 地方ボスの大技(domain/dungeon/bossMoves.tsのBOSS_MOVES)に渡す、narrowなGameアクセス */
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
