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
  ALLY_STANCE_NAMES,
  BARREL_NAMES,
  STATUS_CONFUSE,
  STATUS_FEAR,
  STATUS_INVISIBLE,
  STATUS_POISON,
  STATUS_RECOVER,
  STATUS_SEAL,
  STATUS_SLEEP,
  type Actor,
  type AllyStance,
  type Barrel,
  type BarrelKind,
  type FieldSkillId,
  type FloorGimmickKind,
  type FloorState,
  type Item,
  type ItemDef,
  type Room,
  type StatusKind,
  type Trap,
  type WeaponPattern,
  TILE_CORRIDOR,
  TILE_ROOM,
  actorAt,
  barrelAt,
  hasStatus,
  isFree,
  isHostile,
  roomContains,
  tileAt,
  walkableAt,
  walkLine,
} from "./core/types";
import { type ArtId, artDef } from "./entities/arts";
import { hasSkill } from "./entities/skills";
import { generateFloor } from "./dungeon/generate";
import { GIMMICK_MESSAGES, pickFloorGimmick } from "./dungeon/gimmicks";
import {
  type IdSource,
  choosePlayerStart,
  createAlly,
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
import {
  CHAPTER3_COLLAPSE_DEPTH,
  type DungeonDef,
  MAIN_CAVE_ID,
  MOUNTAIN_CORE_ID,
  NIGHTLY_DREAM_ID,
  REGION_SIZE,
  TRIAL_CHAMBER_ID,
  TRUE_AWAKENING_ID,
  dungeonById,
  nightlyDreamStatMultiplier,
} from "./entities/dungeons";
import { storyChapter } from "./entities/story";
import { DEFAULT_MOOD_ID, type MoodDef, type MoodId, moodDef } from "./entities/moods";
import type { StoredMonster } from "./entities/storedMonster";
import { isVisible, updateVisibility } from "./dungeon/visibility";
import {
  GUARD_COUNTER_BONUS,
  buildDistanceField,
  canStep,
  decideAllyAction,
  decideMonsterAction,
} from "./entities/ai";
import {
  GIMMICK_CHANCE_MULTIPLIER,
  GOLD_REWARD_MULTIPLIER,
  MONSTER_ATK_MULTIPLIER,
  MONSTER_HOUSE_CHANCE_MULTIPLIER,
  SATIETY_RATE_MULTIPLIER,
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
  gainExp,
  totalAttack,
  totalDefense,
} from "./entities/player";
import { HAJIME_NO_YUME_ID, REGION_BOSS_FLOORS, REGION_BOSS_ORDER, speciesById } from "./entities/species";
import { REGIONS, regionByIndex } from "./entities/regions";
import { type BondStage, bondStage } from "./entities/companionBond";
import { itemDef } from "./items/catalog";
import { type EffectContext, addStatus, applyEffect } from "./items/effects";
import {
  addItem,
  charmDefId,
  displayName,
  equip,
  findItem,
  headDefId,
  isFull,
  removeItem,
  shieldMarkIds,
  weaponMarkIds,
} from "./items/inventory";
import { attackOffsets, computeDamage } from "./systems/combat";

/** 双樽鉤(quickSingle)の会心率の上乗せ分 */
const QUICK_SINGLE_CRIT_BONUS = 0.15;
/** 主の大槌(heavySingle)の反動。1ターン分の行動を失わせる(既存の状態異常と同じ off-by-one 消化) */
const HEAVY_RECOVER_TURNS = 2;

/** 毒罠にかかったときの持続ターン数 */
const POISON_TRAP_TURNS = 8;
/** 毒が1ターンごとに削るHP */
const POISON_DAMAGE_PER_TURN = 2;

/** 身構え(足踏み直後)による被ダメージ軽減率 */
const GUARD_DAMAGE_REDUCTION = 0.2;

/** 状態異常が明けたときにプレイヤーへ表示するメッセージ */
const STATUS_END_MESSAGES: Record<StatusKind, string> = {
  [STATUS_SLEEP]: "目が覚めた。",
  [STATUS_CONFUSE]: "混乱がおさまった。",
  [STATUS_SEAL]: "封じが解けた。",
  [STATUS_RECOVER]: "体勢を立て直した。",
  [STATUS_POISON]: "毒が抜けた。",
  [STATUS_INVISIBLE]: "透明が解けた。",
  [STATUS_FEAR]: "おびえがおさまった。",
};

/** attacker.inflicts で状態異常を付与したときのメッセージ */
const STATUS_INFLICT_MESSAGES: Partial<Record<StatusKind, string>> = {
  [STATUS_SLEEP]: "眠ってしまった",
  [STATUS_CONFUSE]: "混乱した",
  [STATUS_SEAL]: "封じられた",
};

// ---- plan/monster-compendium.md: 新しい特技・特性の各種係数 ----
/** 特技「みだしのつめ」が混乱を付与する確率 */
const CONFUSING_CLAW_CHANCE = 0.15;
/** 特技「ふうじのキバ」が封じを付与する確率 */
const SEAL_BITE_CHANCE = 0.15;
/** 夢あわせで得た付与系特技(みだしのつめ・ふうじのキバ)が状態異常を持続させるターン数 */
const INHERITED_INFLICT_TURNS = 3;
/** 特技「はねひらり」が被弾を完全にかわす確率 */
const FLUTTER_DODGE_CHANCE = 0.2;
/** regenIfUnhit(うるみぐま)・特技「しずけさのいやし」が回復させるHP */
const REGEN_IF_UNHIT_AMOUNT = 2;
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
  | { type: "move"; dir: Dir }
  /** 向きだけ変える。ターンを消費しない */
  | { type: "face"; dir: Dir }
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
  /** 仲間への指示(構え)。"all" なら連れている全員に一括で出す */
  | { type: "setStance"; allyId: number | "all"; stance: AllyStance }
  /** めざめの階段を使って、ここで区切ってダイブを成功させる */
  | { type: "bank" }
  /** 樽守りの技(plan/protagonist-arts.md)を繰り出す */
  | { type: "useArt"; id: ArtId };

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
   * SaveData.deepest(これまでの最深到達記録)。省略時は0(序章扱い)。
   * 骨積みの回廊(第四地方)最終階の崩落は、既に一度そこを越えて
   * deepest>=30(章立て上の第三章)まで進んだあとの「戻り」のダイブ
   * でだけ発生させる。そうしないと、まだ壊せる仲間を持たない
   * 初回プレイヤーがこの階で足止めされてしまうため
   */
  deepest?: number;
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
  allies: Actor[];
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
}

/** 満腹度がこのターン数ぶん減る。100 / 0.2 = 500ターンもつ */
const SATIETY_PER_TURN = 0.2;
/** 満腹度がある間、このターンごとにHPが1回復する */
const REGEN_INTERVAL = 8;
/** このターンごとにモンスターが1体湧く */
const SPAWN_INTERVAL = 45;

/** 第三地方(まどろみの茸林)固有ギミック(plan/spore-grove.md): 胞子部屋のパルス間隔・睡眠確率・持続ターン */
const SPORE_PULSE_INTERVAL = 8;
const SPORE_SLEEP_CHANCE = 0.6;
const SPORE_SLEEP_TURNS = 3;

/** 地方ボス(plan/region-boss-honezuka.md): 大技(aoeSeal)の封じ確率・持続ターン */
const HONEZUKA_SEAL_CHANCE = 0.6;
const HONEZUKA_SEAL_TURNS = 3;

/** 第五地方(なみだの滝つぼ)固有ギミック(plan/waterfall-torrent.md): 奔流タイルの連鎖上限 */
const TORRENT_PUSH_LIMIT = 4;

/** 地方ボス(plan/region-boss-fuchinonushi.md): 大技(summonTorrent)で設置する奔流タイルの持続ターン */
const SUMMON_TORRENT_DURATION = 3;

/** 第六地方(こだまの尾根)固有ギミック(plan/echoing-ridge.md): 物音を立てる行動で気づかせる範囲 */
const ECHO_ALERT_RANGE = 6;

/** 地方ボス(plan/region-boss-misemonononushi.md): 大技(summonMirror)の幻影が自然に消えるまでのターン数 */
const MIRROR_AUTO_DISPEL_TURNS = 5;

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

/** 地方ボス(plan/region-boss-horikuinonushi.md): 大技(groundSpikes)の威力 */
const GROUND_SPIKES_DAMAGE = 26;

/** 地方ごとの成熟系統(plan/companion-evolution-expansion.md): こだまぎつねの反響攻撃の最大追加回数 */
const ECHO_ATTACK_MAX = 2;

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

/** タルの飛距離 */
const BARREL_RANGE = 8;
/** アイテムの飛距離 */
const ITEM_THROW_RANGE = 10;
/** タルをぶつけたときの基本ダメージ */
const BARREL_DAMAGE = 8;
/** 爆発タルの威力と巻き込む範囲 */
const BOMB_DAMAGE = 22;
/** スリガラス(plan/shops-and-thieves.md)が盗みを成功させる確率 */
const THIEF_STEAL_CHANCE = 0.4;
const BOMB_RADIUS = 1;

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
 * 空のタルでモンスターを吸い込める確率。
 * 満タンの相手にはめったに効かず、瀕死ならほぼ確実に入る。
 * 「弱らせてから捕まえる」が自然な手順になるように振ってある。
 */
export function captureChance(target: Actor): number {
  const wounded = 1 - target.hp / target.maxHp;
  return Math.min(0.85, 0.12 + 0.68 * wounded);
}

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
  readonly maxDepth: number;
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
  allies: Actor[] = [];

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
  private dungeon: DungeonDef = dungeonById(MAIN_CAVE_ID);

  /**
   * 第三章「仲間探し」の崩落イベント(plan/chapter3-collapse-event.md)用。
   * SaveData.deepest(このダイブ開始前の最深到達記録)
   */
  private readonly deepestAtStart: number;

  /** 潜っているダンジョンid(plan/multiple-dungeons.md)。記録の間の集計などに使う */
  get dungeonId(): string {
    return this.dungeon.id;
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
      this.deepestAtStart = 0;
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

      // JSON化を経由すると、本来は同じオブジェクトを指していたはずの
      // player/allies と floor.actors 内の対応する要素が別オブジェクトに
      // なってしまう。以後のコードは「floor.actors 内の当人 === player/allies
      // の要素」という前提で書かれているため、id を頼りに参照を統一し直す
      const canonical = new Map<number, Actor>();
      canonical.set(this.player.id, this.player);
      for (const ally of this.allies) canonical.set(ally.id, ally);
      this.floor.actors = this.floor.actors.map((a) => canonical.get(a.id) ?? a);

      updateVisibility(this.floor, this.player.pos, this.visionExtraRange());
      return;
    }

    this.rng = new Rng(opts.seed);
    this.deepestAtStart = opts.deepest ?? 0;
    this.dungeon = dungeonById(opts.dungeonId ?? MAIN_CAVE_ID);
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

    const startDepth = Math.min(Math.max(1, Math.floor(opts.startDepth ?? 1)), this.maxDepth);
    this.enterFloor(startDepth);
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
    };
  }

  // ------------------------------------------------------------ フロア遷移

  private enterFloor(depth: number): void {
    this.depth = depth;
    this.monsterHouseWarned = false;
    // 第八地方(めざめの前庭)固有ギミック(plan/dream-garden-mosaic.md): 43〜48階は、
    // 第二〜第七地方の固有ギミックのうち1〜2種類をランダムに選んで、そのフロアだけに適用する
    this.mosaicRegions =
      this.dungeon.id === MAIN_CAVE_ID && depth >= 43 && depth <= 48
        ? this.rng.shuffled(MOSAIC_CANDIDATE_REGIONS).slice(0, this.rng.int(1, 2))
        : [];
    // 地方ボス(plan/region-bosses.md): 表の寝穴のボス階には、通常の野生モンスターも
    // フロアギミックも乗せない(ボス以外の変数を減らす、本文どおりの方針)。
    // 腕試しの間(plan/hidden-dungeon.md)は、全階がボス階の再戦だけで構成される
    const bossSpeciesId =
      this.dungeon.id === MAIN_CAVE_ID
        ? REGION_BOSS_FLOORS[depth]
        : this.dungeon.id === TRIAL_CHAMBER_ID
          ? REGION_BOSS_ORDER[depth - 1]
          : // 真の目覚め(plan/true-awakening.md): 最終階にだけ「はじめの夢」を配置する
            this.dungeon.id === TRUE_AWAKENING_ID && depth === this.maxDepth
            ? HAJIME_NO_YUME_ID
            : undefined;
    const gimmick = bossSpeciesId
      ? undefined
      : pickFloorGimmick(
          this.rng,
          depth,
          this.previousGimmick,
          GIMMICK_CHANCE_MULTIPLIER[this.difficulty] * (this.mood.floorGimmickRateMul ?? 1),
          this.dungeon.id === MAIN_CAVE_ID,
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
          // 第四地方(骨積みの回廊)固有ギミック(plan/bonepile-corridor.md): 19〜24階はモンスターハウスが出やすい
          (this.dungeon.id === MAIN_CAVE_ID &&
          this.regionGimmickApplies(depth, BONEPILE_REGION.floors[0], BONEPILE_REGION.floors[1], BONEPILE_REGION.index)
            ? (BONEPILE_REGION.monsterHouseRateMul ?? 1)
            : 1),
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
    const boostedItemDefId =
      charmDefId(this.player.inventory) === "dustLureSachet" ? "hokoraDust" : undefined;
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
      monsterCountMultiplier: this.dungeon.monsterCountMul ?? 1,
      // 夜ごとの夢のモンスター強化カーブ(plan/nightly-dream-scaling.md)
      statMultiplier: this.dungeon.id === NIGHTLY_DREAM_ID ? nightlyDreamStatMultiplier(depth) : 1,
      // ヨリシロの気分(plan/yorishiro-moods.md)
      itemCountMultiplier: this.mood.dropRateMul ?? 1,
      thiefWeightMultiplier: this.mood.thiefRateMul ?? 1,
    });

    // 忘れ物蔵(plan/lost-and-found-vault.md): 表の寝穴の各地方の2階目
    // (depth % REGION_SIZE === 2)にだけ、隠し通路の候補を1本配置する
    if (this.dungeon.id === MAIN_CAVE_ID && depth % REGION_SIZE === 2) {
      const regionIndex = Math.floor((depth - 1) / REGION_SIZE);
      placeSecretPassage(this.rng, this.floor, `region${regionIndex + 1}`);
    }

    // 地方固有の地形ギミック(plan/wetland-quagmire.md 等): 地方の階層範囲内、または
    // 第八地方のモザイク抽選(plan/dream-garden-mosaic.md)でその地方番号が選ばれていれば、
    // REGION_GIMMICK_PLACERS に登録された地方ごとの配置フックを呼ぶ
    if (this.dungeon.id === MAIN_CAVE_ID) {
      for (const region of REGIONS) {
        const place = REGION_GIMMICK_PLACERS[region.index];
        if (place && this.regionGimmickApplies(depth, region.floors[0], region.floors[1], region.index)) {
          place(this.rng, this.floor, this.ids);
        }
      }
    }

    // 第三章「仲間探し」の崩落イベント(plan/chapter3-collapse-event.md): 骨積みの
    // 回廊(第四地方)最終階の階段部屋の出口に、瓦礫の崩落を固定配置する。
    // 既にdeepest>=30(章立て上の第三章)まで進んだあとの「戻り」のダイブ
    // でだけ発生させる(初回プレイヤーがこの階で足止めされないように)
    if (
      this.dungeon.id === MAIN_CAVE_ID &&
      depth === CHAPTER3_COLLAPSE_DEPTH &&
      storyChapter(this.deepestAtStart, false) >= 3
    ) {
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
   * 地方固有ギミックの適用条件。実際のdepthがその地方の範囲内か、または
   * 第八地方(めざめの前庭)固有ギミック(plan/dream-garden-mosaic.md)で
   * その地方番号が今回のフロアのmosaicRegionsに選ばれていれば true
   */
  private regionGimmickApplies(depth: number, from: number, to: number, region: number): boolean {
    return (depth >= from && depth <= to) || this.mosaicRegions.includes(region);
  }

  /**
   * 地方ボス(plan/region-boss-horikuinonushi.md): 大技(groundSpikes)の予兆。
   * 対象の位置を中心とした十字型(中心+上下左右)のうち、部屋タイルにだけ
   * crackWarningを立てる。実際に立てた位置を返す
   */
  private markGroundSpikeWarnings(center: Vec2): Vec2[] {
    const candidates: Vec2[] = [
      center,
      { x: center.x - 1, y: center.y },
      { x: center.x + 1, y: center.y },
      { x: center.x, y: center.y - 1 },
      { x: center.x, y: center.y + 1 },
    ];
    const marked: Vec2[] = [];
    for (const pos of candidates) {
      const tile = tileAt(this.floor, pos);
      if (!tile || tile.kind !== TILE_ROOM) continue;
      tile.crackWarning = true;
      marked.push(pos);
    }
    return marked;
  }

  /** 指定位置の近くで、誰も立っていないマスを探す */
  private freeSpotNear(center: Vec2, maxRing = 3): Vec2 | null {
    for (let ring = 1; ring <= maxRing; ring++) {
      const candidates: Vec2[] = [];
      for (let dy = -ring; dy <= ring; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          const p = { x: center.x + dx, y: center.y + dy };
          if (isFree(this.floor, p)) candidates.push(p);
        }
      }
      if (candidates.length > 0) return this.rng.pick(candidates);
    }
    return null;
  }

  /**
   * プレイヤーと敵モンスターの重なりフェイルセーフ(plan/actor-overlap-failsafe.md):
   * 上下左右→斜めの順で最初に見つかった、隣接する歩行可能マス
   */
  private static readonly OVERLAP_ESCAPE_DIRS: readonly Dir[] = [0, 2, 4, 6, 1, 3, 5, 7];

  private adjacentFreeSpot(center: Vec2): Vec2 | null {
    for (const dir of Game.OVERLAP_ESCAPE_DIRS) {
      const delta = dirDelta(dir);
      const p = { x: center.x + delta.x, y: center.y + delta.y };
      if (isFree(this.floor, p)) return p;
    }
    return null;
  }

  /**
   * プレイヤーと敵モンスターは同じマスに同時に存在しない、という不変条件の
   * フェイルセーフ(plan/actor-overlap-failsafe.md)。根本原因(#180)を問わず、
   * 万一重なりが起きた場合は毎ターン検知して後始末する。
   * 味方(仲間)との重なりは対象外(README記載の入れ替え仕様のまま)。
   */
  private resolveActorOverlaps(events: GameEvent[], playerPosBeforeCommand: Vec2): void {
    const player = this.player;
    const overlapping = this.floor.actors.find(
      (a) => a.alive && a.kind === "monster" && isHostile(player, a) && eq(a.pos, player.pos),
    );
    if (!overlapping) return;

    const spot = this.adjacentFreeSpot(player.pos);
    if (spot) {
      const from = overlapping.pos;
      overlapping.pos = spot;
      events.push({ type: "move", actorId: overlapping.id, from, to: spot });
      return;
    }

    // 退避先が一切見つからない極端な場合は、プレイヤー側を直前にいたマスへ1歩押し戻す
    if (!eq(player.pos, playerPosBeforeCommand)) {
      const from = player.pos;
      player.pos = playerPosBeforeCommand;
      events.push({ type: "move", actorId: player.id, from, to: playerPosBeforeCommand });
    }
  }

  /**
   * タルを抱えたまま階段を使おうとした場合のフェイルセーフ(plan/barrel-stairs-safeguard.md):
   * 階段の上に居座らせず、隣接する空きマスへ押し戻す。「直前にいたマス」を
   * 厳密に追跡する仕組みは持たないため、actor-overlap-failsafeで導入した
   * adjacentFreeSpotを再利用し、直近の空きマスへ最小移動させる
   */
  private pushBackFromStairs(events: GameEvent[]): void {
    const player = this.player;
    const spot = this.adjacentFreeSpot(player.pos);
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
  private trueAwakeningEnding(target: Actor, events: GameEvent[]): void {
    target.alive = false;
    target.hp = 0;
    events.push({ type: "die", actorId: target.id, kind: target.kind, speciesId: target.speciesId });
    // summonEcho(地方ボス、plan/region-boss-kodamanonushi.md)で分身を出していた
    // 場合、本体と同時に消す(killActorの同等処理を踏襲)
    for (const echo of this.floor.actors) {
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
      this.maybePlayMountainCoreEnding(events);
      this.status = "cleared";
      this.endReason = `${this.maxDepth}階を踏破した!`;
      events.push({ type: "message", text: this.endReason });
      events.push({ type: "gameOver", reason: this.endReason });
      return;
    }
    this.enterFloor(this.depth + 1);
    events.push({ type: "descend", depth: this.depth });
    events.push({ type: "message", text: `地下${this.depth}階に降りた。` });
    if (this.floor.gimmick) {
      events.push({ type: "message", text: GIMMICK_MESSAGES[this.floor.gimmick] });
    }
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
    this.endReason = `地下${this.depth}階のめざめの階段で区切って持ち帰った!`;
    events.push({ type: "message", text: this.endReason });
    events.push({ type: "gameOver", reason: this.endReason });
    return true;
  }

  // ------------------------------------------------------------ コマンド処理

  command(cmd: Command): GameEvent[] {
    const events: GameEvent[] = [];
    if (this.status !== "playing") return events;

    this.hitThisTurn = new Set();
    const posBeforeCommand = { ...this.player.pos };
    const consumedTurn = this.resolvePlayerCommand(cmd, events);

    if (consumedTurn && this.status === "playing") {
      this.runActors(events);
      // 第二地方(忘れ潮の湿地)固有ギミック(plan/wetland-quagmire.md): 実際に
      // 移動して深みタイルへ足を踏み入れた直後だけ、モンスター行動をもう1手
      // ぶん先に進める(「足を取られてワンテンポ遅れる」)。攻撃・アイテム
      // 使用のような移動を伴わない行動には適用しない
      const moved = !eq(posBeforeCommand, this.player.pos);
      if (moved && tileAt(this.floor, this.player.pos)?.quagmire) {
        this.runActors(events);
      }
      this.upkeep(events);
      this.turnCount++;
      if (this.status === "playing") this.resolveActorOverlaps(events, posBeforeCommand);
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

    switch (cmd.type) {
      case "face":
        player.facing = cmd.dir;
        events.push({ type: "face", actorId: player.id, dir: cmd.dir });
        return false;

      case "wait":
        player.guarding = true;
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
        return this.liftOrPutBarrel(events);

      case "throwBarrel":
        return this.throwCarriedBarrel(events);

      case "setStance":
        return this.setAllyStance(cmd.allyId, cmd.stance, events);

      case "useArt":
        return this.useArt(cmd.id, events);
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
        if (target && isHostile(player, target)) {
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

  /** 抱えていなければ持ち上げ、抱えていれば下ろす */
  private liftOrPutBarrel(events: GameEvent[]): boolean {
    const player = this.player;

    if (player.carrying) {
      const delta = dirDelta(player.facing);
      const front = { x: player.pos.x + delta.x, y: player.pos.y + delta.y };
      const spot = isFree(this.floor, front) ? front : this.freeSpotNear(player.pos, 1);
      if (!spot) {
        events.push({ type: "message", text: "タルを置く場所がない。" });
        return false;
      }
      const barrel = player.carrying;
      player.carrying = null;
      barrel.pos = spot;
      this.floor.barrels.push(barrel);
      events.push({ type: "putBarrel", actorId: player.id, barrelId: barrel.id, pos: spot });
      events.push({ type: "message", text: `${BARREL_NAMES[barrel.kind]}を置いた。` });
      return true;
    }

    // 正面を優先し、無ければ足元を見る
    const delta = dirDelta(player.facing);
    const front = { x: player.pos.x + delta.x, y: player.pos.y + delta.y };
    const barrel = barrelAt(this.floor, front) ?? barrelAt(this.floor, player.pos);
    if (!barrel) {
      events.push({ type: "message", text: "持ち上げられるタルがない。" });
      return false;
    }

    // 第七地方(わすれられた祭りの跡)固有ギミック(plan/festival-mirage.md): 偽のタル
    if (barrel.decoy) {
      this.floor.barrels = this.floor.barrels.filter((b) => b.id !== barrel.id);
      events.push({ type: "message", text: "――タルだと思ったが、幻だった。" });
      return true;
    }

    this.floor.barrels = this.floor.barrels.filter((b) => b.id !== barrel.id);
    player.carrying = barrel;
    events.push({
      type: "liftBarrel",
      actorId: player.id,
      barrelId: barrel.id,
      kind: barrel.kind,
    });
    events.push({ type: "message", text: `${BARREL_NAMES[barrel.kind]}を持ち上げた。` });
    events.push({ type: "tutorialTip", id: "barrel" });
    return true;
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
    const pierce = player.pierceReady;
    player.critBarrelReady = false;
    player.pierceReady = false;

    player.carrying = null;
    const from = player.pos;
    let landing = from;
    const hits: Actor[] = [];

    for (const p of walkLine(this.floor, from, player.facing, BARREL_RANGE)) {
      const blocker = barrelAt(this.floor, p);
      if (blocker) break;
      landing = p;
      const actor = actorAt(this.floor, p);
      if (actor && actor.id !== player.id) {
        hits.push(actor);
        // 「抱え投げの奥義」でなければ、最初に当たった相手で止まる
        if (!pierce) break;
      }
    }

    events.push({
      type: "throwBarrel",
      actorId: player.id,
      barrelId: barrel.id,
      from,
      to: landing,
    });
    events.push({ type: "message", text: `${BARREL_NAMES[barrel.kind]}を投げた!` });

    switch (barrel.kind) {
      case "bomb":
        this.explode(landing, events, player.id);
        events.push({ type: "barrelBreak", barrelId: barrel.id, pos: landing });
        return true;

      case "caught":
        this.releaseFromBarrel(barrel, landing, events);
        return true;

      case "empty": {
        // 貫通で複数体に当たった場合、手前の相手には通過ダメージだけを与え、
        // 最後に当たった相手にだけダメージ+捕獲判定を行う(タルは1体しか収まらない)
        const barrelDamage = this.barrelThrowDamage();
        for (const passThrough of hits.slice(0, -1)) {
          if (!passThrough.alive) continue;
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
        return this.resolveEmptyBarrel(
          barrel,
          landing,
          last && last.alive ? last : null,
          events,
          critForced,
        );
      }
    }
  }

  private resolveEmptyBarrel(
    barrel: Barrel,
    landing: Vec2,
    hit: Actor | null,
    events: GameEvent[],
    critForced = false,
  ): boolean {
    if (!hit) {
      this.dropBarrelNear(barrel, landing, events);
      return true;
    }

    const { damage, critical } = computeDamage(
      this.rng,
      this.barrelThrowDamage(),
      hit.def,
      critForced ? { forceCrit: true } : undefined,
    );
    events.push({ type: "message", text: `${hit.name}に${damage}のダメージ!` });
    this.damageActor(hit, damage, critical, events);

    // 倒れてしまったら吸い込めない。タルは砕けずその場に落ちる
    if (!hit.alive) {
      this.dropBarrelNear(barrel, landing, events);
      return true;
    }

    // 仲間にできるのはモンスターだけ。すでに手一杯なら吸い込まない
    if (hit.kind !== "monster" || hit.speciesId === undefined) {
      this.dropBarrelNear(barrel, landing, events);
      return true;
    }
    if (this.allies.length >= MAX_ALLIES) {
      events.push({ type: "message", text: "これ以上は連れて歩けない。" });
      this.dropBarrelNear(barrel, landing, events);
      return true;
    }

    // 「なだめの手つき」で受けた弱らせ(captureBonus)は、この判定で消費する
    const bonus = hit.captureBonus ?? 0;
    hit.captureBonus = 0;
    // 樽なじみの腕輪(plan/protagonist-equipment.md): 捕獲確率+10%
    const charmBonus = charmDefId(this.player.inventory) === "barrelKinshipBracelet" ? 0.1 : 0;
    const captured =
      critForced || this.rng.chance(Math.min(0.9, captureChance(hit) + bonus + charmBonus));
    if (!captured) {
      events.push({ type: "captureFailed", actorId: hit.id, name: hit.name });
      events.push({ type: "message", text: `${hit.name}は吸い込まれなかった。` });
      this.dropBarrelNear(barrel, landing, events);
      return true;
    }

    // 吸い込み成功。モンスターは盤面から消え、タルが中身入りになって落ちる
    hit.alive = false;
    this.floor.actors = this.floor.actors.filter((a) => a.id !== hit.id);
    barrel.kind = "caught";
    barrel.speciesId = hit.speciesId;
    events.push({ type: "capture", actorId: hit.id, barrelId: barrel.id, name: hit.name });
    events.push({ type: "message", text: `${hit.name}をタルに吸い込んだ!` });
    this.dropBarrelNear(barrel, hit.pos, events);
    return true;
  }

  /** タルを着地点に置く。塞がっていれば近くの空きマスへ転がす */
  private dropBarrelNear(barrel: Barrel, preferred: Vec2, events: GameEvent[]): void {
    const spot = isFree(this.floor, preferred) ? preferred : this.freeSpotNear(preferred, 2);
    if (!spot) {
      // 置き場所が無ければ壊れたことにする。宙に浮かせるよりは筋が通る
      events.push({ type: "barrelBreak", barrelId: barrel.id, pos: preferred });
      events.push({ type: "message", text: `${BARREL_NAMES[barrel.kind]}は砕けてしまった。` });
      return;
    }
    barrel.pos = spot;
    this.floor.barrels.push(barrel);
  }

  /** 中身入りのタルを開けて、モンスターを仲間として盤面に出す */
  private releaseFromBarrel(barrel: Barrel, landing: Vec2, events: GameEvent[]): void {
    events.push({ type: "barrelBreak", barrelId: barrel.id, pos: landing });

    if (barrel.speciesId === undefined) return;
    const spot = isFree(this.floor, landing) ? landing : this.freeSpotNear(landing, 2);
    if (!spot) {
      events.push({ type: "message", text: "出てくる場所がなかった……" });
      return;
    }
    if (this.allies.length >= MAX_ALLIES) {
      events.push({ type: "message", text: "これ以上は連れて歩けない。" });
      return;
    }

    const species = speciesById(barrel.speciesId);
    const ally = createAlly(this.ids.nextActorId(), species, spot);
    this.allies.push(ally);
    this.floor.actors.push(ally);
    events.push({ type: "spawn", actorId: ally.id });
    events.push({ type: "recruit", actorId: ally.id, name: ally.name });
    events.push({ type: "message", text: `${ally.name}が仲間になった!` });
    events.push({ type: "tutorialTip", id: "capture" });
    if (this.allies.length === 2) events.push({ type: "tutorialTip", id: "allyOrders" });
  }

  /**
   * 爆発。中心とその周囲にいるものをまとめて巻き込む。
   *
   * 投げた本人だけはダメージを半分にしている。飛距離は壁までなので、
   * 狭い通路では真横に落ちることがあり、満タンから一撃で倒れてしまうと
   * 理不尽に感じる。半分でも十分痛いので、危険であることは伝わる。
   */
  private explode(center: Vec2, events: GameEvent[], throwerId?: number): void {
    events.push({ type: "explosion", pos: center, radius: BOMB_RADIUS });
    events.push({ type: "message", text: "タルが爆発した!" });

    const caught = this.floor.actors.filter(
      (a) => a.alive && chebyshev(a.pos, center) <= BOMB_RADIUS,
    );
    for (const actor of caught) {
      const result = computeDamage(this.rng, BOMB_DAMAGE, actor.def);
      const isThrower = actor.id === throwerId;
      const damage = isThrower ? Math.max(1, Math.floor(result.damage / 2)) : result.damage;
      events.push({
        type: "message",
        text: isThrower
          ? `巻き込まれた! ${displayActorName(actor)}に${damage}のダメージ!`
          : `${displayActorName(actor)}に${damage}のダメージ!`,
      });
      this.damageActor(actor, damage, result.critical, events);
      if (this.status !== "playing") return;
    }

    // 巻き込まれたタルは誘爆させず、その場で壊れるだけにしておく。
    // 連鎖させると1発で階が壊滅しかねない
    const destroyed = this.floor.barrels.filter((b) => chebyshev(b.pos, center) <= BOMB_RADIUS);
    for (const barrel of destroyed) {
      events.push({ type: "barrelBreak", barrelId: barrel.id, pos: barrel.pos });
    }
    this.floor.barrels = this.floor.barrels.filter(
      (b) => chebyshev(b.pos, center) > BOMB_RADIUS,
    );

    // 第三地方(まどろみの茸林)固有ギミック(plan/spore-grove.md): 爆心の部屋の
    // 胞子を吹き飛ばして無効化する(そのフロア滞在中は解除されたまま)
    const room = this.floor.rooms.find((r) => roomContains(r, center));
    if (room?.spored) room.spored = false;

    // 第三地方ボス(plan/region-boss-oomadoromi.md): 爆心と同じ部屋に予兆中の
    // ボスがいれば、大技を解除する(クールダウンはそのまま消費済み扱い)
    if (room) {
      const chargingBoss = this.floor.actors.find(
        (a) => a.alive && a.telegraphCharge && roomContains(room, a.pos),
      );
      if (chargingBoss) {
        chargingBoss.telegraphCharge = false;
        events.push({ type: "message", text: "大技の気配が霧散した!" });
        // 地方ボス(plan/region-boss-horikuinonushi.md): 解除時、発動しないまま
        // 残り続けてしまう部屋内のひび割れ予告も一緒に消す
        for (let y = room.y; y < room.y + room.h; y++) {
          for (let x = room.x; x < room.x + room.w; x++) {
            const tile = tileAt(this.floor, { x, y });
            if (tile) tile.crackWarning = false;
          }
        }
      }
    }
  }

  private movePlayer(dir: Dir, events: GameEvent[]): boolean {
    const player = this.player;
    const delta = dirDelta(dir);
    const to = { x: player.pos.x + delta.x, y: player.pos.y + delta.y };

    const target = actorAt(this.floor, to);
    if (target && target.id !== player.id) {
      if (isHostile(player, target)) {
        this.resolvePlayerAttack(dir, events);
        return true;
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
    events.push({ type: "message", text: `${pile!.amount}ゴールドを拾った。` });
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
      (a) => a.alive && a.aiKind === "shopkeeper" && roomContains(shopRoom, a.pos),
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
      const isCheckpointFloor = this.dungeon.id !== MAIN_CAVE_ID || this.depth % REGION_SIZE === 0;
      if (isCheckpointFloor) {
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

    const range = headDefId(this.player.inventory) === "farsightRing" ? 2 : 1;
    if (!isNearRoom(room, pos, range)) return;

    this.monsterHouseWarned = true;
    events.push({ type: "message", text: "――部屋の奥で何かがひしめいている気配がする。" });
  }

  /** 見晴らしのはちまき(plan/protagonist-equipment.md)・松明(plan/region-darkness.md)ぶんの視界拡張。単純に加算する */
  private visionExtraRange(): number {
    const headband = headDefId(this.player.inventory) === "lookoutHeadband" ? 1 : 0;
    const torch = this.torchTurnsLeft > 0 ? TORCH_VISION_BONUS : 0;
    return headband + torch;
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
    const pattern: WeaponPattern = weapon?.attackPattern ?? "single";
    const critBonus = pattern === "quickSingle" ? QUICK_SINGLE_CRIT_BONUS : 0;
    let forceCrit = pattern === "quickSingle" && this.firstStrikeAvailable;

    const seen = new Set<number>();
    let hitAny = false;
    for (const offset of attackOffsets(pattern, dir)) {
      const pos = { x: player.pos.x + offset.x, y: player.pos.y + offset.y };
      const target = actorAt(this.floor, pos);
      if (!target || target.id === player.id || seen.has(target.id)) continue;
      if (!isHostile(player, target)) continue;
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

      // 地方ボス(plan/region-boss-misemonononushi.md): 本体に命中すると、
      // 残っている幻影は見破られてすべて消える
      if (this.floor.actors.some((a) => a.mirrorOf === target.id)) {
        this.floor.actors = this.floor.actors.filter((a) => a.mirrorOf !== target.id);
        target.mirrorTurnsLeft = undefined;
        events.push({ type: "message", text: "幻影が見破られ、消え去った!" });
      }
    }
    player.facing = dir;
    this.alertNearbyMonsters(player.pos);

    if (hitAny && pattern === "quickSingle") this.firstStrikeAvailable = false;
    if (hitAny && pattern === "heavySingle") {
      addStatus(this.effectContext(events), player, STATUS_RECOVER, HEAVY_RECOVER_TURNS, "隙ができた");
    }
  }

  /** スリガラス(plan/shops-and-thieves.md)の盗み。成功率は控えめにし、盗む額もほどほどに留める */
  private attemptSteal(thief: Actor, target: Actor, events: GameEvent[]): void {
    thief.facing = dirFromDelta(target.pos.x - thief.pos.x, target.pos.y - thief.pos.y);
    events.push({ type: "attack", attackerId: thief.id, targetId: target.id });
    const gold = this.player.gold;
    if (gold <= 0 || !this.rng.chance(THIEF_STEAL_CHANCE)) {
      events.push({ type: "message", text: `${displayActorName(thief)}は何も盗めなかった。` });
      return;
    }
    const stolen = Math.max(1, Math.round(gold * this.rng.float(0.2, 0.5)));
    this.player.gold -= stolen;
    thief.stolenGold = stolen;
    events.push({ type: "message", text: `${displayActorName(thief)}に${stolen}ゴールド盗まれた!` });
  }

  private attack(
    attacker: Actor,
    target: Actor,
    attackPower: number,
    events: GameEvent[],
    combatOpts?: { critBonus?: number; forceCrit?: boolean },
  ): void {
    attacker.facing = dirFromDelta(target.pos.x - attacker.pos.x, target.pos.y - attacker.pos.y);
    events.push({ type: "attack", attackerId: attacker.id, targetId: target.id });
    events.push({ type: "message", text: `${displayActorName(attacker)}のこうげき!` });
    if (attacker.kind === "player" && target.kind === "monster") {
      events.push({ type: "tutorialTip", id: "weakenThenThrow" });
    }

    // 不意打ち: まだ気づいていないモンスターへの攻撃は必ず会心になる
    const sneakAttack = target.kind === "monster" && !target.aware;
    if (sneakAttack) events.push({ type: "message", text: "不意打ち!" });

    // 特技「ふいうち」(plan/monster-fusion.md)、またはガジリねずみの印
    // (plan/equipment-forging.md): そのダイブで最初の1手は必ず会心
    const hasQuickStartEffect =
      (attacker.kind === "ally" && hasSkill(attacker, "quickStart")) ||
      (attacker.kind === "player" && weaponMarkIds(this.player.inventory).includes("gajiri"));
    const quickStart = hasQuickStartEffect && !this.oncePerRun.hasUsed("quickStart", attacker.id);
    if (hasQuickStartEffect) this.oncePerRun.markUsed("quickStart", attacker.id);

    // ambush・mimic AI(plan/monster-compendium.md): 隣接されるまで潜んでいた
    // モンスターが、気づいた直後の1撃で会心になる
    const ambushSurprise = attacker.ambushReady === true;
    if (attacker.ambushReady) attacker.ambushReady = false;

    // 特技「ふいのいちげき」(ambushStrike、plan/monster-compendium.md):
    // そのランの最初の1撃のダメージ+50%
    const hasAmbushStrikeEffect = attacker.kind === "ally" && hasSkill(attacker, "ambushStrike");
    const ambushStrike = hasAmbushStrikeEffect && !this.oncePerRun.hasUsed("ambushStrike", attacker.id);
    if (hasAmbushStrikeEffect) this.oncePerRun.markUsed("ambushStrike", attacker.id);

    // 地方ごとの成熟系統(plan/companion-evolution-expansion.md): かすみウツボは
    // 確率で攻撃をまるごと回避する
    const evadeChance = target.speciesId ? speciesById(target.speciesId).evadeChance ?? 0 : 0;
    if (evadeChance > 0 && this.rng.chance(evadeChance)) {
      events.push({ type: "message", text: `${displayActorName(target)}はひらりと攻撃をかわした!` });
      if (target.kind === "monster") target.aware = true;
      return;
    }

    const defense = target.kind === "player" ? totalDefense(this.player) : target.def;
    // 地方ごとの成熟系統(plan/companion-evolution-expansion.md): なみだぐまは
    // HPが減るほど攻撃力が上がる(HP満タンで+0%、HP0近くで最大値に近づく)
    const lowHpBonusMax = attacker.speciesId ? speciesById(attacker.speciesId).lowHpAtkBonusMax ?? 0 : 0;
    const hpRatio = attacker.maxHp > 0 ? Math.max(0, attacker.hp) / attacker.maxHp : 1;
    const lowHpMultiplier = 1 + lowHpBonusMax * (1 - hpRatio);
    const effectivePower = Math.round((ambushStrike ? attackPower * 1.5 : attackPower) * lowHpMultiplier);
    const { damage, critical } = computeDamage(this.rng, effectivePower, defense, {
      ...combatOpts,
      forceCrit: combatOpts?.forceCrit || sneakAttack || quickStart || ambushSurprise,
    });
    if (critical) events.push({ type: "message", text: "会心の一撃!" });

    // オイテケボシ(drainsSatiety、plan/monster-compendium.md): HPではなく
    // プレイヤーの満腹度を削る特殊効果。防御・軽減の計算はそのまま流用する
    const drainsSatiety =
      target.kind === "player" && attacker.speciesId !== undefined && speciesById(attacker.speciesId).drainsSatiety;
    if (drainsSatiety) {
      const drained = Math.max(1, Math.round(damage / 2));
      this.player.satiety = Math.max(0, this.player.satiety - drained);
      events.push({ type: "message", text: `満腹度が${drained}減った!` });
    } else {
      const finalDamage = this.mitigateIncomingDamage(target, damage, events);
      events.push({ type: "message", text: `${displayActorName(target)}に${finalDamage}のダメージ!` });
      this.damageActor(target, finalDamage, critical, events);

      // 地方ごとの成熟系統(plan/companion-evolution-expansion.md): ヨロイオイテケは
      // 被弾するたび、受けたダメージの一部を攻撃者に返す。プランの原案は
      // 「相手の満腹度を削り返す」だったが、満腹度はプレイヤー専用のステータスで
      // 攻撃者(モンスター)には存在しないため、ダメージ反射に差し替えた
      const counterRatio = target.speciesId ? speciesById(target.speciesId).counterDamageRatio ?? 0 : 0;
      if (counterRatio > 0 && attacker.alive) {
        const counter = Math.max(1, Math.round(finalDamage * counterRatio));
        events.push({ type: "message", text: `${displayActorName(target)}が身を固めて${counter}のダメージを返した!` });
        this.damageActor(attacker, counter, false, events);
      }
    }

    // 攻撃してきた相手には気づく
    if (target.kind === "monster") target.aware = true;

    // 特技「ねむりごな」、またはマドロミダケの印(plan/equipment-forging.md):
    // 隣接する敵への攻撃に、眠り付与の確率+10%を上乗せする
    const hasDrowsyEffect =
      (attacker.kind === "ally" && hasSkill(attacker, "drowsyBreath")) ||
      (attacker.kind === "player" && weaponMarkIds(this.player.inventory).includes("madoromi"));
    const drowsyBonus = hasDrowsyEffect ? 0.1 : 0;
    const inflictChance = (attacker.inflicts?.chance ?? 0) + drowsyBonus;
    // かなしばりの杖で封じられている間は、特技(状態異常の追加付与)が出せない
    const sealed = hasStatus(attacker, STATUS_SEAL);
    if (target.alive && inflictChance > 0 && !sealed && this.rng.chance(inflictChance)) {
      const kind = attacker.inflicts?.kind ?? STATUS_SLEEP;
      const turns = attacker.inflicts?.turns ?? 4;
      addStatus(this.effectContext(events), target, kind, turns, STATUS_INFLICT_MESSAGES[kind] ?? "様子がおかしくなった");
    }

    // 特技「みだしのつめ」「ふうじのキバ」(plan/monster-compendium.md): 種族の
    // 素の inflicts を持たない個体でも、夢あわせで得た特技ぶんは独立して付与を狙える
    if (target.alive && !sealed) {
      if (hasSkill(attacker, "confusingClaw") && this.rng.chance(CONFUSING_CLAW_CHANCE)) {
        addStatus(this.effectContext(events), target, STATUS_CONFUSE, INHERITED_INFLICT_TURNS, "混乱した");
      }
      if (target.alive && hasSkill(attacker, "sealBite") && this.rng.chance(SEAL_BITE_CHANCE)) {
        addStatus(this.effectContext(events), target, STATUS_SEAL, INHERITED_INFLICT_TURNS, "封じられた");
      }
    }

    // 地方ごとの成熟系統(plan/companion-evolution-expansion.md): こだまぎつねは
    // 命中のたび確率で追加の1撃を同じ相手に放つ(最大2回まで反響)
    const echoChance = attacker.speciesId ? speciesById(attacker.speciesId).echoAttackChance ?? 0 : 0;
    if (echoChance > 0) {
      for (let echo = 0; echo < ECHO_ATTACK_MAX && target.alive && this.rng.chance(echoChance); echo++) {
        events.push({ type: "message", text: `${displayActorName(attacker)}のこうげきがこだました!` });
        const echoDefense = target.kind === "player" ? totalDefense(this.player) : target.def;
        const { damage: echoDamage, critical: echoCritical } = computeDamage(this.rng, effectivePower, echoDefense);
        const finalEchoDamage = this.mitigateIncomingDamage(target, echoDamage, events);
        events.push({ type: "message", text: `${displayActorName(target)}に${finalEchoDamage}のダメージ!` });
        this.damageActor(target, finalEchoDamage, echoCritical, events);
      }
    }
  }

  /**
   * 被ダメージへの軽減を適用する。プレイヤーには樽受け身(全無効・最優先)、
   * 身構え(2割軽減)、ぷるんの印(plan/equipment-forging.md、5割の確率で1割軽減)、
   * 仲間には特技「みをまもる」(5割の確率で1割軽減)を適用する。
   */
  private mitigateIncomingDamage(target: Actor, damage: number, events: GameEvent[]): number {
    if (target.kind === "player") {
      if (this.player.ukemiReady) {
        this.player.ukemiReady = false;
        events.push({ type: "message", text: "樽受け身で衝撃を受け流した!" });
        return 0;
      }
      if (this.player.guarding) {
        this.player.guarding = false;
        events.push({ type: "message", text: "身構えていたので、ダメージをおさえた!" });
        return Math.max(1, Math.floor(damage * (1 - GUARD_DAMAGE_REDUCTION)));
      }
      if (shieldMarkIds(this.player.inventory).includes("purun") && this.rng.chance(0.5)) {
        events.push({ type: "message", text: "印の力で衝撃をやわらげた!" });
        return Math.max(1, Math.floor(damage * 0.9));
      }
      return damage;
    }

    if (target.kind === "ally") {
      // 特技「はねひらり」(flutterDodge、plan/monster-compendium.md): 確率で被弾を完全にかわす
      if (hasSkill(target, "flutterDodge") && this.rng.chance(FLUTTER_DODGE_CHANCE)) {
        events.push({ type: "message", text: `${displayActorName(target)}はひらりとかわした!` });
        return 0;
      }
      // 特技「とんずら」(burrowEscape、plan/monster-compendium.md): 瀕死になる一撃を
      // 1ラン1回だけ、とっさに離脱して避ける
      if (
        hasSkill(target, "burrowEscape") &&
        !this.oncePerRun.hasUsed("burrowEscape", target.id) &&
        target.hp - damage <= target.maxHp * 0.3
      ) {
        this.oncePerRun.markUsed("burrowEscape", target.id);
        events.push({ type: "message", text: `${displayActorName(target)}はとっさに離脱してダメージを避けた!` });
        return 0;
      }
    }

    if (target.kind === "ally" && hasSkill(target, "steadfastBody")) {
      // 特技「ゆるがぬからだ」(plan/companion-evolution.md): 「みをまもる」の常時発動版
      events.push({ type: "message", text: `${displayActorName(target)}は衝撃をやわらげた!` });
      return Math.max(1, Math.floor(damage * 0.9));
    }
    if (target.kind === "ally" && hasSkill(target, "softBody") && this.rng.chance(0.5)) {
      // 特技「みをまもる」: 確率5割で被弾ダメージを1割軽減する
      events.push({ type: "message", text: `${displayActorName(target)}は衝撃をやわらげた!` });
      return Math.max(1, Math.floor(damage * 0.9));
    }
    return damage;
  }

  /** タルを投げたときの基礎ダメージ。ツブテガエルの印(plan/equipment-forging.md)で+2 */
  private barrelThrowDamage(): number {
    return BARREL_DAMAGE + (weaponMarkIds(this.player.inventory).includes("tsubute") ? 2 : 0);
  }

  private damageActor(target: Actor, damage: number, critical: boolean, events: GameEvent[]): void {
    // 地方ボス(plan/region-boss-kodamanonushi.md): 分身はHPを共有する。実際の
    // 増減・生死判定は本体側のActorに対して行う
    const hpOwner = this.hpOwnerOf(target);
    hpOwner.hp -= damage;
    this.hitThisTurn.add(target.id);
    if (target.kind === "player") this.damageTakenThisRun += damage;
    events.push({
      type: "damage",
      actorId: target.id,
      amount: damage,
      hpAfter: Math.max(0, hpOwner.hp),
      critical,
    });
    // 攻撃を受ければ目が覚める
    const sleep = target.statuses.find((s) => s.kind === STATUS_SLEEP);
    if (sleep) {
      sleep.turns = 0;
      events.push({ type: "statusEnd", actorId: target.id, kind: STATUS_SLEEP });
    }
    if (hpOwner.hp <= 0) {
      // 特技「ふんばり」、ホネガラミの印(plan/equipment-forging.md)、または
      // 身がわりの鈴(plan/protagonist-equipment.md): HPが1残っていた状態
      // からの致死ダメージを1ダイブ1回だけ耐える
      const hpBeforeThisHit = hpOwner.hp + damage;
      const hasStubbornEffect =
        (hpOwner.kind === "ally" && hasSkill(hpOwner, "stubborn")) ||
        (hpOwner.kind === "player" &&
          (shieldMarkIds(this.player.inventory).includes("honegarami") ||
            charmDefId(this.player.inventory) === "guardianBell"));
      if (hpBeforeThisHit === 1 && hasStubbornEffect && !this.oncePerRun.hasUsed("stubborn", hpOwner.id)) {
        hpOwner.hp = 1;
        this.oncePerRun.markUsed("stubborn", hpOwner.id);
        events.push({ type: "message", text: `${displayActorName(hpOwner)}はふんばりこらえた!` });
      } else if (hpOwner.speciesId === HAJIME_NO_YUME_ID) {
        this.trueAwakeningEnding(hpOwner, events);
      } else {
        this.killActor(hpOwner, events);
      }
    }
    this.mirrorSharedHp(hpOwner);
  }

  /** 地方ボス(plan/region-boss-kodamanonushi.md): 分身が紐づく本体を返す。紐づいていなければそのまま */
  private hpOwnerOf(actor: Actor): Actor {
    if (actor.sharesHpWith === undefined) return actor;
    return this.floor.actors.find((a) => a.id === actor.sharesHpWith) ?? actor;
  }

  /** 本体のhpを、紐づく分身全員のhpフィールドへミラーする(表示用。増減判定には使わない) */
  private mirrorSharedHp(owner: Actor): void {
    for (const actor of this.floor.actors) {
      if (actor.sharesHpWith === owner.id) actor.hp = owner.hp;
    }
  }

  private killActor(target: Actor, events: GameEvent[]): void {
    target.alive = false;
    target.hp = 0;
    events.push({ type: "die", actorId: target.id, kind: target.kind, speciesId: target.speciesId });

    if (target.kind === "player") {
      this.status = "dead";
      this.endReason = `地下${this.depth}階で力尽きた……`;
      events.push({ type: "message", text: this.endReason });
      events.push({ type: "gameOver", reason: this.endReason });
      events.push({ type: "tutorialTip", id: "death" });
      return;
    }

    if (target.kind === "ally") {
      this.allies = this.allies.filter((a) => a.id !== target.id);
      events.push({ type: "message", text: `${displayActorName(target)}は力尽きた……` });
      return;
    }

    events.push({ type: "message", text: `${displayActorName(target)}をたおした!` });
    // スリガラス(plan/shops-and-thieves.md): 盗品を持ったまま倒すと、その場に落とす
    if (target.aiKind === "thief" && target.stolenGold !== undefined) {
      this.floor.goldPiles.push({
        id: this.ids.nextItemUid(),
        pos: { ...target.pos },
        amount: target.stolenGold,
      });
      events.push({ type: "message", text: "盗まれた金を取り戻した!" });
    }
    // かがやきの夢のかけら(plan/monster-compendium.md): 倒すと上質な素材を1つ落とす
    if (target.shining) {
      const materialIds = [HOKORA_DUST_DEF_ID, ...MARKS.map((m) => MARK_STONE_DEF_ID[m.id])];
      const defId = this.rng.pick(materialIds);
      this.floor.items.push({ item: createItem(this.ids.nextItemUid(), defId), pos: { ...target.pos } });
      events.push({ type: "message", text: "かがやく残り香から、上質な素材が現れた!" });
    }
    // 地方ボス(plan/region-bosses.md): 撃破すると、その地方限定の素材を確定ドロップする
    const bossDrop = target.speciesId ? speciesById(target.speciesId).bossGuaranteedDrop : undefined;
    if (bossDrop) {
      this.floor.items.push({ item: createItem(this.ids.nextItemUid(), bossDrop), pos: { ...target.pos } });
      events.push({ type: "message", text: "地方ボスの証となる、特別な素材が現れた!" });
    }
    // 山の芯(plan/mountain-core.md): 撃破した地方ボスを記録する
    if (target.speciesId && speciesById(target.speciesId).isRegionBoss) {
      this.defeatedRegionBossesThisRun.add(target.speciesId);
    }
    const exp = target.exp ?? 0;
    if (exp > 0) {
      const levels = gainExp(this.player, exp, this.trainingFocus);
      events.push({ type: "message", text: `経験値を${exp}かくとく。` });
      for (let i = 0; i < levels; i++) {
        events.push({ type: "levelUp", actorId: this.player.id, level: this.player.level });
        events.push({ type: "message", text: `レベルが${this.player.level}に上がった!` });
      }
      if (levels > 0) events.push({ type: "tutorialTip", id: "levelUp" });
    }

    // 地方ボス(plan/region-boss-kodamanonushi.md): 本体が倒れたら、紐づく分身も
    // 同時に消える。経験値・ドロップの重複を避けるため、通常のkillActor処理は
    // 分身側には通さない
    for (const echo of this.floor.actors) {
      if (echo.id === target.id || echo.sharesHpWith !== target.id || !echo.alive) continue;
      echo.alive = false;
      echo.hp = 0;
      events.push({ type: "die", actorId: echo.id, kind: echo.kind, speciesId: echo.speciesId });
    }
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

    if (def.category === "staff") {
      if (worked) item.charges = (item.charges ?? 1) - 1;
    } else {
      removeItem(inv, uid);
    }
    return true;
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
    const trap = this.floor.traps.find((t) => eq(t.pos, pos));
    if (!trap) return;
    trap.revealed = true;
    events.push({ type: "trap", pos, kind: trap.kind });
    this.alertNearbyMonsters(pos);
    this.triggerTrap(trap, events);
  }

  /**
   * 第六地方(こだまの尾根)固有ギミック(plan/echoing-ridge.md): プレイヤーが
   * 攻撃する・罠を踏むなど物音を立てる行動を取るたびに、視界に関係なく
   * 周囲(チェビシェフ距離6)のモンスターをawareにする。既存のalarm罠
   * (階全体をawareにする)より弱い、範囲限定の効果として書き分ける
   */
  private alertNearbyMonsters(pos: Vec2): void {
    if (!(this.dungeon.id === MAIN_CAVE_ID && this.regionGimmickApplies(this.depth, 31, 36, 6))) return;
    for (const actor of this.floor.actors) {
      if (actor.kind !== "monster" || !actor.alive) continue;
      if (chebyshev(actor.pos, pos) <= ECHO_ALERT_RANGE) actor.aware = true;
    }
  }

  private triggerTrap(trap: Trap, events: GameEvent[]): void {
    switch (trap.kind) {
      case "damage": {
        const damage = 4 + this.depth;
        events.push({ type: "message", text: `矢が飛んできた! ${damage}のダメージ!` });
        this.damageActor(this.player, damage, false, events);
        break;
      }
      case "sleep": {
        events.push({ type: "message", text: "眠りガスが噴き出した!" });
        addStatus(this.effectContext(events), this.player, STATUS_SLEEP, 4, "眠ってしまった");
        break;
      }
      case "alarm": {
        events.push({ type: "message", text: "けたたましい音が鳴り響いた!" });
        for (const actor of this.floor.actors) {
          if (actor.kind === "monster" && actor.alive) actor.aware = true;
        }
        break;
      }
      case "pitfall": {
        events.push({ type: "message", text: "落とし穴だ!" });
        this.descend(events);
        break;
      }
      case "poison": {
        events.push({ type: "message", text: "毒の針が刺さった!" });
        addStatus(this.effectContext(events), this.player, STATUS_POISON, POISON_TRAP_TURNS, "毒を受けた");
        break;
      }
    }
  }

  // ------------------------------------------------------------ モンスターの行動

  /**
   * プレイヤー以外の全員を動かす。仲間もモンスターも同じ枠で処理する。
   *
   * 距離場は陣営ごとに1本ずつ作って全員で使い回す。始点を「その陣営の敵全員」に
   * しておけば、各自が自然といちばん近い相手へ向かう。
   */
  private runActors(events: GameEvent[]): void {
    const alive = (a: Actor) => a.alive;
    const friendlyPositions = this.floor.actors
      .filter((a) => alive(a) && a.kind !== "monster")
      .map((a) => a.pos);
    const foePositions = this.floor.actors
      .filter((a) => alive(a) && a.kind === "monster")
      .map((a) => a.pos);

    const towardsFriendly = buildDistanceField(this.floor, friendlyPositions);
    const towardsFoe =
      foePositions.length > 0 ? buildDistanceField(this.floor, foePositions) : null;
    // プレイヤーへ向かう距離場は仲間だけが使う。仲間は最大2体で、連れていない
    // ことのほうが多いので、実際に必要になるまで作らない
    let leaderField: Int32Array | null = null;
    const towardsLeader = (): Int32Array =>
      (leaderField ??= buildDistanceField(this.floor, this.player.pos));

    // 行動中に配列が変化しても安全なようにコピーしてから回す
    const movers = this.floor.actors.filter((a) => alive(a) && a.kind !== "player");

    for (const actor of movers) {
      if (!actor.alive || this.status !== "playing") continue;
      if (hasStatus(actor, STATUS_SLEEP)) continue;

      if (hasStatus(actor, STATUS_CONFUSE)) {
        const options = ALL_DIRS.filter((d) => canStep(this.floor, actor.pos, d));
        if (options.length > 0) this.moveActor(actor, this.rng.pick(options), events);
        continue;
      }

      const action =
        actor.kind === "ally"
          ? decideAllyAction(
              this.rng,
              this.floor,
              actor,
              this.player,
              towardsFoe ?? towardsLeader(),
              towardsLeader(),
            )
          : decideMonsterAction(
              this.rng,
              this.floor,
              actor,
              this.player,
              towardsFriendly,
              this.mood.awareDistanceMul ?? 1,
            );

      switch (action.type) {
        case "wait":
          break;
        case "move":
          this.moveActor(actor, action.dir, events);
          // スリガラス(plan/shops-and-thieves.md): 盗んだあと、プレイヤーの
          // 視界から外れると、盗んだ金ごと消える
          if (
            actor.alive &&
            actor.aiKind === "thief" &&
            actor.stolenGold !== undefined &&
            !isVisible(this.floor, actor.pos)
          ) {
            actor.alive = false;
            this.floor.actors = this.floor.actors.filter((a) => a.id !== actor.id);
          }
          break;
        case "attack": {
          const target = this.floor.actors.find((a) => a.id === action.targetId && a.alive);
          if (!target) break;
          if (actor.aiKind === "thief" && actor.stolenGold === undefined) {
            this.attemptSteal(actor, target, events);
          } else {
            // 地方ボス(plan/region-bosses.md): 予兆を消費した一撃は大技として、
            // 通常のダメージ計算にmultiplierを掛けたぶんだけ底上げする
            const bossTelegraph =
              action.empowered && actor.speciesId ? speciesById(actor.speciesId).bossTelegraph : undefined;
            // guard(plan/monster-compendium.md): 隣接されたときの反撃力が高い
            const attackPower = bossTelegraph
              ? Math.round(actor.atk * bossTelegraph.multiplier)
              : actor.aiKind === "guard"
                ? Math.round(actor.atk * GUARD_COUNTER_BONUS)
                : actor.atk;
            this.attack(actor, target, attackPower, events);
            if (bossTelegraph) {
              events.push({ type: "message", text: `${displayActorName(actor)}の大技が炸裂した!` });
            }
          }
          break;
        }
        case "telegraph": {
          // 地方ボス(plan/region-bosses.md): この手は攻撃せず、警告メッセージだけ出す。
          // 既存のGameEvent(message)の枠組みで実装し、新規UIは増やさない
          const target = this.floor.actors.find((a) => a.id === action.targetId && a.alive);
          const telegraph = actor.speciesId ? speciesById(actor.speciesId).bossTelegraph : undefined;
          if (target && telegraph) {
            actor.facing = dirFromDelta(target.pos.x - actor.pos.x, target.pos.y - actor.pos.y);
            events.push({ type: "message", text: `${displayActorName(actor)}は${telegraph.message}――!` });
            // 地方ボス(plan/region-boss-horikuinonushi.md): groundSpikesだけは、
            // 予兆ターンの時点で床にひび割れ(crackWarning)を立てて危険地帯を可視化する
            if (telegraph.effect === "groundSpikes") {
              const positions = this.markGroundSpikeWarnings(target.pos);
              if (positions.length > 0) events.push({ type: "crackWarning", positions });
            }
          }
          break;
        }
        case "ranged": {
          const target = this.floor.actors.find((a) => a.id === action.targetId && a.alive);
          if (!target) break;
          actor.facing = dirFromDelta(target.pos.x - actor.pos.x, target.pos.y - actor.pos.y);
          events.push({ type: "attack", attackerId: actor.id, targetId: target.id });
          events.push({ type: "message", text: `${displayActorName(actor)}が つぶてを投げた!` });
          const defense =
            target.kind === "player" ? totalDefense(this.player) : target.def;
          const { damage, critical } = computeDamage(this.rng, actor.atk, defense);
          const finalDamage = this.mitigateIncomingDamage(target, damage, events);
          events.push({ type: "message", text: `${displayActorName(target)}に${finalDamage}のダメージ!` });
          this.damageActor(target, finalDamage, critical, events);
          break;
        }
        case "boomAoeSleep": {
          // 地方ボス(plan/region-boss-oomadoromi.md): 予兆を消費した大技。
          // 隣接攻撃ではなく、自分のいる部屋の全アクターに睡眠を放つ
          events.push({ type: "message", text: `${displayActorName(actor)}が胞子をまき散らした!` });
          const room = this.floor.rooms.find((r) => roomContains(r, actor.pos));
          if (room) {
            const occupants = this.floor.actors.filter((a) => a.alive && roomContains(room, a.pos));
            this.applyRoomWideStatus(occupants, STATUS_SLEEP, SPORE_SLEEP_CHANCE, SPORE_SLEEP_TURNS, "眠ってしまった", events);
          }
          break;
        }
        case "boomAoeSeal": {
          // 地方ボス(plan/region-boss-honezuka.md): 予兆を消費した大技。
          // 隣接攻撃ではなく、自分のいる部屋の全アクターに封じを放つ
          events.push({ type: "message", text: `${displayActorName(actor)}の骨が一斉に鳴り響いた!` });
          const room = this.floor.rooms.find((r) => roomContains(r, actor.pos));
          if (room) {
            const occupants = this.floor.actors.filter((a) => a.alive && roomContains(room, a.pos));
            this.applyRoomWideStatus(occupants, STATUS_SEAL, HONEZUKA_SEAL_CHANCE, HONEZUKA_SEAL_TURNS, "封じられた", events);
          }
          break;
        }
        case "summonTorrent": {
          // 地方ボス(plan/region-boss-fuchinonushi.md): 予兆を消費した大技。
          // 隣接攻撃ではなく、自分のいる部屋の外周タイルへ一時的に奔流を呼び込む
          events.push({ type: "message", text: `${displayActorName(actor)}が奔流を呼び込んだ!` });
          const room = this.floor.rooms.find((r) => roomContains(r, actor.pos));
          if (room) {
            actor.summonedTorrentTiles ??= [];
            const cx = room.x + (room.w >> 1);
            const cy = room.y + (room.h >> 1);
            for (let x = room.x; x < room.x + room.w; x++) {
              for (let y = room.y; y < room.y + room.h; y++) {
                const onPerimeter = x === room.x || x === room.x + room.w - 1 || y === room.y || y === room.y + room.h - 1;
                if (!onPerimeter) continue;
                const tile = tileAt(this.floor, { x, y });
                if (!tile || tile.kind !== TILE_ROOM) continue;
                tile.torrent = dirFromDelta(cx - x, cy - y);
                actor.summonedTorrentTiles.push({ pos: { x, y }, expiresIn: SUMMON_TORRENT_DURATION });
              }
            }
          }
          break;
        }
        case "summonEcho": {
          // 地方ボス(plan/region-boss-kodamanonushi.md): 予兆を消費した大技。
          // HPを共有する分身を、既存の生存数に応じて最大2体まで補充する
          const existingEchoes = this.floor.actors.filter((a) => a.alive && a.sharesHpWith === actor.id);
          const toSpawn = Math.max(0, 2 - existingEchoes.length);
          const species = actor.speciesId ? speciesById(actor.speciesId) : undefined;
          if (toSpawn > 0 && species) {
            events.push({ type: "message", text: `${displayActorName(actor)}が分身を呼び出した!` });
          }
          for (let i = 0; i < toSpawn && species; i++) {
            const pos = this.freeSpotNear(actor.pos);
            if (!pos) break;
            const echo = createMonster(this.ids.nextActorId(), species, pos);
            echo.sharesHpWith = actor.id;
            echo.hp = actor.hp;
            echo.atk = Math.round(actor.atk * 0.5);
            echo.aware = true;
            this.floor.actors.push(echo);
          }
          break;
        }
        case "summonMirror": {
          // 地方ボス(plan/region-boss-misemonononushi.md): 予兆を消費した大技。
          // 本体そっくりの幻影を3体呼び出す。当てても消えるだけの偽物で、
          // 本体を選び当てる駆け引きになる
          const species = actor.speciesId ? speciesById(actor.speciesId) : undefined;
          if (species) {
            events.push({ type: "message", text: `${displayActorName(actor)}の周りに幻影が現れた!` });
            for (let i = 0; i < 3; i++) {
              const spot = this.freeSpotNear(actor.pos);
              if (!spot) break;
              const mirror = createMonster(this.ids.nextActorId(), species, spot);
              mirror.mirrorOf = actor.id;
              mirror.aware = true;
              this.floor.actors.push(mirror);
            }
            actor.mirrorTurnsLeft = MIRROR_AUTO_DISPEL_TURNS;
          }
          break;
        }
        case "burrowSurface": {
          // burrow(plan/monster-compendium.md): 潜伏から地上へ現れる。teleportイベントを
          // 出さずに座標だけ書き換えると、表示側(ActorView)が古い位置のまま取り残され、
          // 次に動いたときに離れた本来の位置まで一気に「飛ぶ」ように見えてしまう(#180)
          const from = actor.pos;
          actor.pos = action.to;
          events.push({ type: "teleport", actorId: actor.id, from, to: action.to });
          break;
        }
        case "groundSpikes": {
          // 地方ボス(plan/region-boss-horikuinonushi.md): 予兆を消費した大技。
          // crackWarningの立つ全マスについて、上にいるアクターへダメージを
          // 適用し、その後crackWarningをすべて解除する
          events.push({ type: "message", text: `${displayActorName(actor)}が地面から杭を突き上げた!` });
          for (let i = 0; i < this.floor.tiles.length; i++) {
            const tile = this.floor.tiles[i]!;
            if (!tile.crackWarning) continue;
            tile.crackWarning = false;
            const pos = { x: i % this.floor.width, y: Math.floor(i / this.floor.width) };
            const hit = actorAt(this.floor, pos);
            if (!hit || !hit.alive) continue;
            const result = computeDamage(this.rng, GROUND_SPIKES_DAMAGE, hit.def);
            events.push({ type: "message", text: `${displayActorName(hit)}に${result.damage}のダメージ!` });
            this.damageActor(hit, result.damage, result.critical, events);
            if (this.status !== "playing") return;
          }
          break;
        }
      }

      // 地方ボス(plan/region-boss-nushigaeru.md): 深みタイルの上にいる間、
      // 毎ターンSTATUS_INVISIBLEを付与し直す。深みタイルを離れれば次の
      // upkeepで自然にturnsが尽きて解ける
      if (
        actor.alive &&
        actor.speciesId &&
        speciesById(actor.speciesId).hidesInQuagmire &&
        tileAt(this.floor, actor.pos)?.quagmire
      ) {
        // upkeepのtickStatusesが同じcommand内で直後に走りturnsを1減らすため、
        // 2を設定して次ターン開始時点でも生存させる(1だとその場で0になり消える)
        const existing = actor.statuses.find((s) => s.kind === STATUS_INVISIBLE);
        if (existing) existing.turns = 2;
        else actor.statuses.push({ kind: STATUS_INVISIBLE, turns: 2 });
      }
    }
  }

  private moveActor(actor: Actor, dir: Dir, events: GameEvent[]): void {
    if (!canStep(this.floor, actor.pos, dir)) return;
    const delta = dirDelta(dir);
    const from = actor.pos;
    const to = { x: from.x + delta.x, y: from.y + delta.y };
    actor.pos = to;
    actor.facing = dir;
    events.push({ type: "move", actorId: actor.id, from, to });
    this.applyTorrentPush(actor, events);
  }

  /**
   * 第五地方(なみだの滝つぼ)固有ギミック(plan/waterfall-torrent.md): 奔流タイルへ
   * 移動すると、その向きへ連鎖的に押し流される(最大4マス)。壁・他アクター・タルが
   * あれば手前で止まる。プレイヤー・仲間・モンスターの移動処理の末尾で共通に呼ぶ
   */
  private applyTorrentPush(actor: Actor, events: GameEvent[]): Vec2 {
    const start = actor.pos;
    let current = start;
    for (let i = 0; i < TORRENT_PUSH_LIMIT; i++) {
      const tile = tileAt(this.floor, current);
      if (!tile?.torrent) break;
      const delta = dirDelta(tile.torrent);
      const next = { x: current.x + delta.x, y: current.y + delta.y };
      if (!walkableAt(this.floor, next) || barrelAt(this.floor, next)) break;
      const occupant = actorAt(this.floor, next);
      if (occupant && occupant.id !== actor.id) break;
      current = next;
    }
    if (!eq(current, start)) {
      actor.pos = current;
      events.push({ type: "move", actorId: actor.id, from: start, to: current });
      if (actor.kind === "player") {
        events.push({ type: "message", text: "奔流に押し流された!" });
      }
    }
    return current;
  }

  // ------------------------------------------------------------ 毎ターンの処理

  private upkeep(events: GameEvent[]): void {
    this.tickStatuses(events);
    this.tickHunger(events);
    this.tickArtCooldowns();
    this.tickRegen();
    this.tickSporeRooms(events);
    this.tickSummonedTorrentTiles();
    this.tickMirrors(events);
    this.tickTorch(events);

    if (this.status !== "playing") return;

    if (this.turnCount > 0 && this.turnCount % SPAWN_INTERVAL === 0) {
      spawnWanderingMonster(this.rng, this.floor, this.ids, this.player.pos, this.dungeon.floorOffset ?? 0);
    }

    // 倒された者を取り除く。プレイヤーは死んでも参照が要るので残す
    this.floor.actors = this.floor.actors.filter((a) => a.alive || a.kind === "player");
    this.allies = this.allies.filter((a) => a.alive);
  }

  /**
   * 技のクールダウンを1ターンぶん減らす。「樽受け身」は発動から1ターンだけ
   * 有効な予約なので、被弾で消費されなければここで期限切れにする。
   */
  private tickArtCooldowns(): void {
    for (const id of Object.keys(this.player.artCooldowns) as ArtId[]) {
      if (this.player.artCooldowns[id] > 0) this.player.artCooldowns[id]--;
    }
    this.player.ukemiReady = false;
  }

  /** 松明(plan/region-darkness.md)。残りターンを減らし、切れた瞬間だけ知らせる */
  private tickTorch(events: GameEvent[]): void {
    if (this.torchTurnsLeft <= 0) return;
    this.torchTurnsLeft--;
    if (this.torchTurnsLeft === 0) {
      events.push({ type: "message", text: "松明の火が消えた。" });
    }
  }

  private tickStatuses(events: GameEvent[]): void {
    // 毒はターン経過でじわじわHPを削る。行動そのものは妨げない
    for (const actor of this.floor.actors) {
      if (!actor.alive || !hasStatus(actor, STATUS_POISON)) continue;
      this.damageActor(actor, POISON_DAMAGE_PER_TURN, false, events);
      if (this.status !== "playing") return;
    }

    for (const actor of this.floor.actors) {
      if (!actor.alive) continue;
      for (const status of actor.statuses) {
        if (status.turns <= 0) continue;
        status.turns--;
        if (status.turns === 0) {
          events.push({ type: "statusEnd", actorId: actor.id, kind: status.kind });
          if (actor.kind === "player") {
            events.push({ type: "message", text: STATUS_END_MESSAGES[status.kind] });
          }
        }
      }
      actor.statuses = actor.statuses.filter((s) => s.turns > 0);
    }
  }

  private tickHunger(events: GameEvent[]): void {
    // 毒などですでにこのターン力尽きていれば、満腹度の処理は行わない
    if (this.status !== "playing") return;
    const player = this.player;
    const before = player.satiety;
    const feastMultiplier = this.floor.gimmick === "feast" ? 0.5 : 1;
    // 満たされ石(plan/protagonist-equipment.md): 満腹度の減りが2割ゆるやかになる
    const charmMultiplier = charmDefId(player.inventory) === "fulfillingStone" ? 0.8 : 1;
    // 忘れ物蔵(plan/lost-and-found-vault.md): 満腹度の減りがやや早い(長居できない蔵)
    const dungeonMultiplier = this.dungeon.satietyDrainMul ?? 1;
    const rate =
      SATIETY_PER_TURN *
      feastMultiplier *
      charmMultiplier *
      dungeonMultiplier *
      SATIETY_RATE_MULTIPLIER[this.difficulty];
    player.satiety = Math.max(0, player.satiety - rate);

    if (before > 20 && player.satiety <= 20) {
      events.push({ type: "hungerWarning", level: "low" });
      events.push({ type: "message", text: "おなかがへってきた……" });
      events.push({ type: "tutorialTip", id: "hunger" });
    }
    if (before > 0 && player.satiety === 0) {
      events.push({ type: "hungerWarning", level: "empty" });
      events.push({ type: "message", text: "おなかがすいて目がまわる!" });
    }

    if (player.satiety <= 0) {
      this.damageActor(player, 1, false, events);
    } else if (this.turnCount % REGEN_INTERVAL === 0 && player.hp < player.maxHp) {
      player.hp = Math.min(player.maxHp, player.hp + 1);
    }
  }

  /**
   * regenIfUnhit(うるみぐま)・特技「しずけさのいやし」(slowMend、
   * plan/monster-compendium.md): このターン被弾しなかった対象を少しだけ回復する
   */
  private tickRegen(): void {
    for (const actor of this.floor.actors) {
      if (!actor.alive || actor.kind === "player") continue;
      if (this.hitThisTurn.has(actor.id)) continue;
      if (actor.hp >= actor.maxHp) continue;
      const nativeRegen = actor.speciesId !== undefined && speciesById(actor.speciesId).regenIfUnhit === true;
      const skillRegen = actor.kind === "ally" && hasSkill(actor, "slowMend");
      if (!nativeRegen && !skillRegen) continue;
      actor.hp = Math.min(actor.maxHp, actor.hp + REGEN_IF_UNHIT_AMOUNT);
    }
  }

  /**
   * 第三地方(まどろみの茸林)固有ギミック(plan/spore-grove.md): 胞子部屋に
   * 誰か(敵味方問わず)が居続けると、8ターンごとに部屋全体へ睡眠を判定する。
   * 誰もいないターンはカウントしない
   */
  private tickSporeRooms(events: GameEvent[]): void {
    for (const room of this.floor.rooms) {
      if (!room.spored) continue;
      const occupants = this.floor.actors.filter((a) => a.alive && roomContains(room, a.pos));
      if (occupants.length === 0) continue;
      room.sporeTimer = (room.sporeTimer ?? 0) + 1;
      if (room.sporeTimer < SPORE_PULSE_INTERVAL) continue;
      room.sporeTimer = 0;
      events.push({ type: "message", text: "むわっと、胞子が満ちた……" });
      this.applyRoomWideStatus(occupants, STATUS_SLEEP, SPORE_SLEEP_CHANCE, SPORE_SLEEP_TURNS, "眠ってしまった", events);
    }
  }

  /**
   * 地方ボス(plan/region-boss-fuchinonushi.md): 大技(summonTorrent)で一時的に
   * 設置した奔流タイルを、毎ターンexpiresInぶん減らし、0になったら元に戻す
   */
  private tickSummonedTorrentTiles(): void {
    for (const actor of this.floor.actors) {
      if (!actor.summonedTorrentTiles || actor.summonedTorrentTiles.length === 0) continue;
      const remaining: { pos: Vec2; expiresIn: number }[] = [];
      for (const entry of actor.summonedTorrentTiles) {
        entry.expiresIn--;
        if (entry.expiresIn <= 0) {
          const tile = tileAt(this.floor, entry.pos);
          if (tile) tile.torrent = undefined;
        } else {
          remaining.push(entry);
        }
      }
      actor.summonedTorrentTiles = remaining;
    }
  }

  /**
   * 地方ボス(plan/region-boss-misemonononushi.md): 幻影を呼び出してから
   * 一定ターン(既定5)経過しても本体を当てられない場合、幻影が自然に消えて
   * 通常状態へ戻る(膠着状態を防ぐ安全弁)
   */
  private tickMirrors(events: GameEvent[]): void {
    for (const actor of this.floor.actors) {
      if (actor.mirrorTurnsLeft === undefined) continue;
      actor.mirrorTurnsLeft--;
      if (actor.mirrorTurnsLeft > 0) continue;
      actor.mirrorTurnsLeft = undefined;
      const hadMirrors = this.floor.actors.some((a) => a.mirrorOf === actor.id);
      this.floor.actors = this.floor.actors.filter((a) => a.mirrorOf !== actor.id);
      if (hadMirrors) events.push({ type: "message", text: "幻影が薄れて消えていった……" });
    }
  }

  /**
   * 部屋の在室者全員(敵味方問わず)に状態異常を判定する。plan/spore-grove.md の
   * 胞子部屋パルス、plan/region-boss-oomadoromi.md の大技(aoeSleep)、
   * plan/region-boss-honezuka.md の大技(aoeSeal)で共有する
   */
  private applyRoomWideStatus(
    occupants: readonly Actor[],
    kind: StatusKind,
    chance: number,
    turns: number,
    verb: string,
    events: GameEvent[],
  ): void {
    for (const actor of occupants) {
      if (!actor.alive || !this.rng.chance(chance)) continue;
      addStatus(this.effectContext(events), actor, kind, turns, verb);
    }
  }

  // ------------------------------------------------------------ 補助

  private effectContext(events: GameEvent[]): EffectContext {
    return { rng: this.rng, floor: this.floor, player: this.player, events };
  }

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

  /** 連れている仲間(表示や判定の入口) */
  get allyList(): readonly Actor[] {
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
