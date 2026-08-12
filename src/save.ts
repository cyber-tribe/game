import { TUTORIAL_TIP_IDS, type TutorialTipId } from "./core/tutorial";
import type { Actor, FloorState, Item, MarkId, SkillId, Tile } from "./core/types";
import { ACHIEVEMENTS, achievementDef } from "./entities/achievements";
import { COSTUMES, DEFAULT_COSTUME_ID, type CostumeDef } from "./entities/costumes";
import { DIFFICULTY_MODES, type DifficultyMode } from "./entities/difficulty";
import { MAIN_CAVE_ID, MAIN_CAVE_MAX_DEPTH, NIGHTLY_DREAM_ID, REGION_SIZE, TRIAL_CHAMBER_ID } from "./entities/dungeons";
import { MAX_RECENT_FUSION_MATERIALS, tryEvolve } from "./entities/evolution";
import { FESTIVAL_SHOP_OFFERS, isYoimatsuri } from "./entities/festivals";
import { HOKORA_DUST_DEF_ID, MARKS, MAX_MARK_SLOTS, MAX_PLUS } from "./entities/forging";
import { MAX_ACTIVE_QUESTS, QUESTS, questDef, questsForDate, todayKey } from "./entities/quests";
import type { TrainingFocus } from "./entities/player";
import { type BondStage, bondStage } from "./entities/companionBond";
import {
  OTAMA_VISIT_STORY,
  type SideStoryDef,
  type SideStoryStage,
  sideStoryFor,
} from "./entities/sideStories";
import { storyChapter } from "./entities/story";
import {
  VILLAGE_NPCS,
  canDevelopVillage,
  hutCapacity,
  nextVillageStageRequirement,
  type VillageNpcId,
  type VillageStage,
} from "./entities/village";
import { MAX_SKILLS, NATIVE_SKILL_BY_SPECIES, SKILLS, fullSkillSet } from "./entities/skills";
import { HAJIME_NO_YUME_ID, REGION_BOSS_ORDER, SPECIES, speciesById } from "./entities/species";
import type { StoredMonster } from "./entities/storedMonster";
import type { RunSnapshot, RunStatus } from "./game";
import { ITEMS } from "./items/catalog";

export type { StoredMonster };

const LEGACY_KEY = "garudo-dungeon/v1";
const LEGACY_SNAPSHOT_KEY = "garudo-dungeon/v1/run-snapshot";

/** セーブ枠(plan/save-slots.md)。当面3枠固定 */
export const SAVE_SLOT_COUNT = 3;

function slotKey(slot: number): string {
  return `garudo-dungeon/v1/slot${slot}`;
}

/** ダイブ中オートセーブ(plan/mid-dive-autosave.md)。セーブ枠ごとに1つだけ持つ */
function slotSnapshotKey(slot: number): string {
  return `garudo-dungeon/v1/slot${slot}/run-snapshot`;
}

/**
 * セーブ枠(plan/save-slots.md)導入前の単一キーにデータが残っていれば、
 * slot0として1回だけコピーし、旧キーは削除する。ゲーム起動時に1回だけ呼ぶ。
 */
export function migrateLegacySaveIfNeeded(): void {
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy !== null && localStorage.getItem(slotKey(0)) === null) {
      localStorage.setItem(slotKey(0), legacy);
      localStorage.removeItem(LEGACY_KEY);
      const legacySnapshot = localStorage.getItem(LEGACY_SNAPSHOT_KEY);
      if (legacySnapshot !== null) {
        localStorage.setItem(slotSnapshotKey(0), legacySnapshot);
        localStorage.removeItem(LEGACY_SNAPSHOT_KEY);
      }
    }
  } catch {
    // 移行できなくても、以後は空のslot0として遊べるので握りつぶす
  }
}

/** スロット選択画面の一覧表示用の要約 */
export interface SaveSlotSummary {
  slot: number;
  /** そのスロットにセーブデータが存在するか。falseなら「はじめる」表記にする */
  exists: boolean;
  deepest: number;
  villageStage: VillageStage;
  /** ISO8601。existsがfalseならundefined */
  lastPlayedAt?: string;
}

/** スロット選択画面に並べる、全スロットぶんの要約を返す */
export function listSaveSlotSummaries(): SaveSlotSummary[] {
  const summaries: SaveSlotSummary[] = [];
  for (let slot = 0; slot < SAVE_SLOT_COUNT; slot++) {
    const raw = (() => {
      try {
        return localStorage.getItem(slotKey(slot));
      } catch {
        return null;
      }
    })();
    if (raw === null) {
      summaries.push({ slot, exists: false, deepest: 0, villageStage: 1 });
      continue;
    }
    const data = loadSave(slot);
    summaries.push({
      slot,
      exists: true,
      deepest: data.deepest,
      villageStage: data.villageStage,
      lastPlayedAt: data.lastPlayedAt,
    });
  }
  return summaries;
}

/** スロットの削除(やり直し)。本編セーブ・ダイブ中スナップショットの両方を消す */
export function deleteSaveSlot(slot: number): void {
  try {
    localStorage.removeItem(slotKey(slot));
    localStorage.removeItem(slotSnapshotKey(slot));
  } catch {
    // 消せなくても遊べはするので握りつぶす
  }
}

/** 倉庫に預けてあるアイテム。uid は挑戦ごとに振り直すので保存しない */
export interface StoredItem {
  defId: string;
  charges?: number;
  /** 強化値(+n)。武器・盾のみ。plan/equipment-forging.md 参照 */
  plus?: number;
  /** 刻んだ印。武器・盾のみ、最大2件(plan/dual-mark-equipment.md) */
  markIds?: MarkId[];
}


export interface SaveData {
  /** これまでに到達した最も深い階 */
  deepest: number;
  /** 挑戦した回数 */
  runs: number;
  /** 踏破した回数 */
  clears: number;
  /** 最高到達レベル */
  bestLevel: number;
  /** 拠点の倉庫 */
  storage: StoredItem[];
  /**
   * 既知のめざめの階段(チェックポイント)がある階。1階(入口)は常に含む。
   * ダイブの結果(踏破・全滅)によらず、足を踏み入れた瞬間に記録される
   * (plan/checkpoint-select.md の「知識は失われない」原則)。
   */
  knownCheckpoints: number[];
  /** 表示済みのチュートリアルヒントid(plan/tutorial.md、アーカイブ済み) */
  seenTutorialTips: TutorialTipId[];
  /**
   * 鍛え方(plan/protagonist-training.md、アーカイブ済み)。拠点で選んだ
   * 方針を次回も引き継ぐ。一度決めておけば以後は何も聞かれない。
   */
  trainingFocus: TrainingFocus;
  /**
   * ねむり小屋(plan/monster-fusion.md、アーカイブ済み)に預けてある仲間。
   * 収容数の上限は設けない(倉庫と同じ扱い)。
   */
  hut: StoredMonster[];
  /** ねむり小屋の次の連番。uidの衝突を避けるためだけに使う */
  nextHutUid: number;
  /**
   * 記録の間(plan/records-hall.md)。累計ダイブ回数(runs)・踏破回数
   * (clears)・最深記録(deepest)は既存フィールドをそのまま流用する
   */
  records: DiveRecords;
  /**
   * モンスター図鑑(plan/monster-compendium.md)。種族idごとに
   * "seen"(見た)/"captured"(捕まえた)を記録する。未登録キーは「未確認」扱い
   */
  compendium: Record<string, CompendiumStatus>;
  /**
   * 実績帳(plan/achievements.md)。実績id → 達成日時(ISO文字列)。
   * 一度記録した実績は、条件を後から満たさなくなっても取り消さない
   * (design/balance-philosophy.md の「知識・記録はロストしない」原則)
   */
  achievements: Record<string, string>;
  /** 現在身につけている称号の実績id。未選択ならundefined */
  equippedTitle?: string;
  /**
   * 装備図鑑(plan/equipment-compendium.md)。武器・頭防具・装身具のdefIdごとに
   * "owned"(入手済み)/"mastered"(極めた)を記録する。武器は+9かつ印を刻んで
   * 初めて"mastered"になり、頭防具・装身具は入手した時点で自動的に"mastered"
   * (強化・刻印の概念が無いため)
   */
  equipmentCompendium: Record<string, EquipmentCompendiumStatus>;
  /** 装備図鑑: 一度でも刻んだことのある印(plan/equipment-forging.md)。defIdではなくMarkIdをキーにする */
  markCompendium: Record<string, "owned">;
  /** 装備図鑑: 一度でも入手したことのある素材(ほこら粉・刻印石) */
  materialCompendium: Record<string, "owned">;
  /**
   * 難易度モード(plan/difficulty-modes.md)。拠点でいつでも選び直せる。
   * 次回ダイブから反映される(ダイブ中の切り替えは想定しない)
   */
  difficulty: DifficultyMode;
  /**
   * 持ち帰った所持金(plan/shops-and-thieves.md)。ダイブ中の`PlayerState.gold`
   * は毎回0から始まり、踏破・区切りで帰還した分だけここに積み上がる
   * (道具・仲間と同じロスト規則)
   */
  gold: number;
  /** 依頼板(plan/quest-board.md)。最後に依頼板を更新した日付キー(YYYY-MM-DD) */
  boardDate: string;
  /** 依頼板に並んでいる、まだ受注していない依頼id(最大 MAX_ACTIVE_QUESTS 件からactiveQuestsの分を引いた数) */
  boardOffers: string[];
  /** 受注中の依頼。最大 MAX_ACTIVE_QUESTS 件 */
  activeQuests: { defId: string; progress: number }[];
  /** 達成した依頼idの履歴。ロストしない */
  completedQuestIds: string[];
  /**
   * 複数のダンジョン(plan/multiple-dungeons.md)。「夜ごとの夢」(終わりのない
   * 周回モード)で過去に到達した最も深い階。表の寝穴のdeepestとは別に持つ
   * (上限のあるダンジョンと単純比較できないため)
   */
  nightlyDreamBestDepth: number;
  /**
   * 村の発展(plan/village-development.md)。既定は1(始まりの村)。
   * ねむり小屋の収容数上限(hutCapacity)はここから算出する
   */
  villageStage: VillageStage;
  /**
   * アクセシビリティ(plan/difficulty-modes.md)。メッセージログ・メニューの
   * 文字サイズ。既定は"normal"
   */
  fontSize: FontSize;
  /** 衣装・見た目カスタマイズ(plan/costumes.md)。解放済みの衣装id一覧("default"は常に含む) */
  unlockedCostumes: string[];
  /** 現在身につけている衣装id。既定は"default" */
  equippedCostume: string;
  /** 腕試しの間(plan/hidden-dungeon.md)。踏破するたびに記録が積み上がる。削除されない */
  arenaRecords: ArenaRecord[];
  /** 村の暮らし(plan/village-life.md)。NPCのid → 絆レベル(0始まり) */
  bonds: Record<string, number>;
  /** 村の暮らし: 一度見た挿話のid(演出の再生防止)。例: "bond:mogurababa:familiar" */
  seenVillageEvents: string[];
  /** 村の暮らし: NPCのid → 最後に素材を渡した日付キー(YYYY-MM-DD)。1日1回の献上制限に使う */
  lastGiftDates: Record<string, string>;
  /** 忘れ物蔵(plan/lost-and-found-vault.md)。見つけた隠し通路の地方id("region1"〜"region8")。削除されない */
  foundVaultPassages: string[];
  /**
   * セーブ枠(plan/save-slots.md)。ISO8601、最後にこのスロットへ書き込んだ日時。
   * スロット選択画面の一覧表示用。saveDataが呼ばれるたびに更新される
   */
  lastPlayedAt: string;
  /**
   * 山の芯(plan/mountain-core.md)。撃破済みの地方ボスのspeciesId一覧。
   * 初出のIDだけ追加し、重複しない。design/postgame.mdの「全地方ボス撃破」
   * 判定にも使い回せる
   */
  defeatedRegionBosses: string[];
  /**
   * 山の芯(plan/mountain-core.md)。3階の会話イベントを経験した時点でtrueになる。
   * design/postgame.mdが前提とする「物語クリア」の直接判定に使う
   */
  storyCleared: boolean;
  /**
   * 真の目覚め(plan/true-awakening.md)。「はじめの夢」との決着イベントを
   * 経験した時点でtrueになる。一度trueになったら戻らない(実績・かがやきの
   * 夢のかけら出現率ボーナスの判定に使う恒久フラグ)
   */
  trueAwakeningCleared: boolean;
}

/** 腕試しの間(plan/hidden-dungeon.md)。踏破1回ぶんの記録 */
export interface ArenaRecord {
  clearedAt: string;
  turns: number;
  damageTaken: number;
}

/** アクセシビリティ(plan/difficulty-modes.md)。メッセージログ・メニューの文字サイズ */
export type FontSize = "normal" | "large";

/** "seen": 遭遇した。"captured": タルで捕まえた、または夢あわせの糧にした */
export type CompendiumStatus = "seen" | "captured";

export type EquipmentCompendiumStatus = "owned" | "mastered";

export interface DiveRecords {
  /** 倒したモンスターの累計数 */
  totalDefeats: number;
  /** タルで捕まえた累計数(夢に還した分も含む) */
  totalCaptures: number;
}

/** 一番最初の持ち物。手ぶらで放り出さない程度に */
const STARTER: StoredItem[] = [
  { defId: "healLeaf" },
  { defId: "healLeaf" },
  { defId: "hardBread" },
  { defId: "hatchet" },
];

const VALID_IDS = new Set(ITEMS.map((i) => i.id));

export function initialSave(): SaveData {
  return {
    deepest: 0,
    runs: 0,
    clears: 0,
    bestLevel: 1,
    storage: STARTER.map((s) => ({ ...s })),
    knownCheckpoints: [1],
    seenTutorialTips: [],
    trainingFocus: "balance",
    hut: [],
    nextHutUid: 1,
    records: { totalDefeats: 0, totalCaptures: 0 },
    compendium: {},
    achievements: {},
    equipmentCompendium: {},
    markCompendium: {},
    materialCompendium: {},
    difficulty: "normal",
    gold: 0,
    boardDate: "",
    boardOffers: [],
    activeQuests: [],
    completedQuestIds: [],
    nightlyDreamBestDepth: 0,
    villageStage: 1,
    fontSize: "normal",
    unlockedCostumes: [DEFAULT_COSTUME_ID],
    equippedCostume: DEFAULT_COSTUME_ID,
    arenaRecords: [],
    bonds: {},
    seenVillageEvents: [],
    lastGiftDates: {},
    foundVaultPassages: [],
    lastPlayedAt: new Date().toISOString(),
    defeatedRegionBosses: [],
    storyCleared: false,
    trueAwakeningCleared: false,
  };
}

/** @param slot セーブ枠(plan/save-slots.md)。省略時は現在のアクティブ枠 */
export function loadSave(slot: number = activeSlot): SaveData {
  try {
    const raw = localStorage.getItem(slotKey(slot));
    if (!raw) return initialSave();
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return {
      deepest: numberOr(parsed.deepest, 0),
      runs: numberOr(parsed.runs, 0),
      clears: numberOr(parsed.clears, 0),
      bestLevel: numberOr(parsed.bestLevel, 1),
      storage: sanitizeStorage(parsed.storage),
      knownCheckpoints: sanitizeCheckpoints(parsed.knownCheckpoints),
      seenTutorialTips: sanitizeTutorialTips(parsed.seenTutorialTips),
      trainingFocus: sanitizeTrainingFocus(parsed.trainingFocus),
      hut: sanitizeHut(parsed.hut),
      nextHutUid: numberOr(parsed.nextHutUid, nextHutUidFrom(sanitizeHut(parsed.hut))),
      records: sanitizeRecords(parsed.records),
      compendium: sanitizeCompendium(parsed.compendium),
      achievements: sanitizeAchievements(parsed.achievements),
      equippedTitle: sanitizeEquippedTitle(parsed.equippedTitle, sanitizeAchievements(parsed.achievements)),
      equipmentCompendium: sanitizeEquipmentCompendium(parsed.equipmentCompendium),
      markCompendium: sanitizeMarkCompendium(parsed.markCompendium),
      materialCompendium: sanitizeMaterialCompendium(parsed.materialCompendium),
      difficulty: sanitizeDifficulty(parsed.difficulty),
      gold: Math.max(0, numberOr(parsed.gold, 0)),
      boardDate: typeof parsed.boardDate === "string" ? parsed.boardDate : "",
      boardOffers: sanitizeQuestIdList(parsed.boardOffers),
      activeQuests: sanitizeActiveQuests(parsed.activeQuests),
      completedQuestIds: sanitizeQuestIdList(parsed.completedQuestIds),
      nightlyDreamBestDepth: Math.max(0, numberOr(parsed.nightlyDreamBestDepth, 0)),
      villageStage: sanitizeVillageStage(parsed.villageStage),
      fontSize: parsed.fontSize === "large" ? "large" : "normal",
      unlockedCostumes: sanitizeUnlockedCostumes(parsed.unlockedCostumes),
      equippedCostume: sanitizeEquippedCostume(
        parsed.equippedCostume,
        sanitizeUnlockedCostumes(parsed.unlockedCostumes),
      ),
      arenaRecords: sanitizeArenaRecords(parsed.arenaRecords),
      bonds: sanitizeBonds(parsed.bonds),
      seenVillageEvents: sanitizeStringList(parsed.seenVillageEvents),
      lastGiftDates: sanitizeLastGiftDates(parsed.lastGiftDates),
      foundVaultPassages: sanitizeFoundVaultPassages(parsed.foundVaultPassages),
      lastPlayedAt: typeof parsed.lastPlayedAt === "string" ? parsed.lastPlayedAt : new Date(0).toISOString(),
      defeatedRegionBosses: sanitizeDefeatedRegionBosses(parsed.defeatedRegionBosses),
      storyCleared: parsed.storyCleared === true,
      trueAwakeningCleared: parsed.trueAwakeningCleared === true,
    };
  } catch {
    // 壊れた保存データで起動できなくなるほうが困るので、黙って初期値に戻す
    return initialSave();
  }
}

/**
 * セーブ枠(plan/save-slots.md)。現在アクティブな枠番号。既存の
 * loadSave()/saveData()/saveRunSnapshot()/loadRunSnapshot()/clearRunSnapshot()の
 * 呼び出し側(記録まわりの各関数・main.ts・既存テスト)は、枠を意識せずに
 * 呼べば自動的にこの枠を読み書きする。main.tsはスロット選択直後に
 * setActiveSlot()を1回呼ぶだけでよい
 */
let activeSlot = 0;

export function setActiveSlot(slot: number): void {
  activeSlot = slot;
}

/** @param slot セーブ枠(plan/save-slots.md)。省略時は現在のアクティブ枠 */
export function saveData(data: SaveData, slot: number = activeSlot): void {
  if (batchDepth > 0) {
    // まとめ書きの最中。最後の1つだけが本物なので、上書きしていく
    pendingSave = data;
    pendingSlot = slot;
    return;
  }
  writeSave(data, slot);
}

function writeSave(data: SaveData, slot: number): void {
  try {
    // lastPlayedAtはsaveDataが呼ばれるたびに現在時刻で更新する(plan/save-slots.md)
    const withTimestamp: SaveData = { ...data, lastPlayedAt: new Date().toISOString() };
    localStorage.setItem(slotKey(slot), JSON.stringify(withTimestamp));
  } catch {
    // 保存できなくても遊べはするので、失敗は握りつぶす
  }
}

let batchDepth = 0;
let pendingSave: SaveData | null = null;
let pendingSlot = 0;

/**
 * 中で何度 saveData() が呼ばれても、書き込みは最後の1回にまとめる。
 *
 * 記録まわりの関数(addKnownCheckpoint / markSpeciesSeen / …)はどれも
 * 「新しい SaveData を返しつつ自分で保存する」作りになっている。1ターンの
 * イベントを処理すると、新しい部屋に入って未見の敵を何体か見た、といった
 * 場合にこれらが立て続けに走り、そのたびにセーブ全体を JSON 化して
 * localStorage へ同期書き込みしてしまう。呼び出し側でまとめられるように、
 * ここで一段挟んでおく。
 *
 * 途中で例外が出ても、それまでの変更は書き出す(finally)。
 */
export function batchSaves<T>(run: () => T): T {
  batchDepth++;
  try {
    return run();
  } finally {
    batchDepth--;
    if (batchDepth === 0 && pendingSave !== null) {
      const data = pendingSave;
      const slot = pendingSlot;
      pendingSave = null;
      writeSave(data, slot);
    }
  }
}

/** めざめの階段(チェックポイント)を既知にする。すでに知っていれば何もしない */
export function addKnownCheckpoint(current: SaveData, depth: number): SaveData {
  if (current.knownCheckpoints.includes(depth)) return current;
  const next: SaveData = {
    ...current,
    knownCheckpoints: [...current.knownCheckpoints, depth].sort((a, b) => a - b),
  };
  saveData(next);
  return next;
}

/**
 * チュートリアルヒントを既読にする。すでに既読なら何もしない
 * (呼び出し側は既読かどうかを問わず毎回呼んでよい)。
 */
export function markTutorialTipSeen(current: SaveData, id: TutorialTipId): SaveData {
  if (current.seenTutorialTips.includes(id)) return current;
  const next: SaveData = {
    ...current,
    seenTutorialTips: [...current.seenTutorialTips, id],
  };
  saveData(next);
  return next;
}

/** 鍛え方を保存する。次に拠点を開いたときの既定値になる */
export function setTrainingFocus(current: SaveData, focus: TrainingFocus): SaveData {
  if (current.trainingFocus === focus) return current;
  const next: SaveData = { ...current, trainingFocus: focus };
  saveData(next);
  return next;
}

/**
 * 難易度モード(plan/difficulty-modes.md)を保存する。あとから拠点でいつでも
 * 変更でき、ペナルティは無い(次回ダイブから反映される)
 */
export function setDifficulty(current: SaveData, difficulty: DifficultyMode): SaveData {
  if (current.difficulty === difficulty) return current;
  const next: SaveData = { ...current, difficulty };
  saveData(next);
  return next;
}

/** アクセシビリティ(plan/difficulty-modes.md)。メッセージログ・メニューの文字サイズを切り替える */
export function setFontSize(current: SaveData, fontSize: FontSize): SaveData {
  if (current.fontSize === fontSize) return current;
  const next: SaveData = { ...current, fontSize };
  saveData(next);
  return next;
}

function isCostumeUnlocked(costume: CostumeDef, save: SaveData): boolean {
  if (costume.unlock === "always") return true;
  switch (costume.unlock.kind) {
    case "compendiumComplete":
      return isCompendiumComplete(save);
    case "villageStage":
      return save.villageStage >= costume.unlock.stage;
    case "nightlyDreamDepth":
      return save.nightlyDreamBestDepth >= costume.unlock.depth;
    // NPCサイドストーリー(plan/side-stories-part2.md): 自動判定はしない。
    // talkToNpc側が対応する段の解放時に直接unlockedCostumesへ加える
    case "npcSideStory":
      return false;
  }
}

/**
 * 衣装(plan/costumes.md): 満たしている解放条件を確認し、新たに解放された
 * ものを記録に加える。実績帳と同じ「一度解放すれば記録はロストしない」方針
 */
export function refreshUnlockedCostumes(current: SaveData): SaveData {
  const newlyUnlocked = COSTUMES.filter(
    (c) => !current.unlockedCostumes.includes(c.id) && isCostumeUnlocked(c, current),
  ).map((c) => c.id);
  if (newlyUnlocked.length === 0) return current;
  const next: SaveData = { ...current, unlockedCostumes: [...current.unlockedCostumes, ...newlyUnlocked] };
  saveData(next);
  return next;
}

/** 衣装(plan/costumes.md): 解放済みの衣装だけを身につけられる */
export function equipCostume(current: SaveData, id: string): SaveData {
  if (current.equippedCostume === id) return current;
  if (!current.unlockedCostumes.includes(id)) return current;
  const next: SaveData = { ...current, equippedCostume: id };
  saveData(next);
  return next;
}

/**
 * 村の発展(plan/village-development.md)。次の段階の条件(最深到達記録・
 * ゴールド)を満たしていなければ何もしない
 */
export function developVillage(current: SaveData): SaveData {
  if (!canDevelopVillage(current.villageStage, current.deepest, current.gold)) return current;
  const requirement = nextVillageStageRequirement(current.villageStage);
  if (!requirement) return current;
  const next: SaveData = {
    ...current,
    villageStage: requirement.stage,
    gold: current.gold - requirement.cost,
  };
  saveData(next);
  return next;
}

/**
 * 宵祭りの出店(plan/yoimatsuri-festival.md)。宵祭りの日以外、または
 * 所持金が足りない場合は何もしない。品揃え・価格は固定(補充・売り切れの概念は持たない)
 */
export function buyFestivalItem(current: SaveData, defId: string, dateKey: string = todayKey()): SaveData {
  if (!isYoimatsuri(dateKey)) return current;
  const offer = FESTIVAL_SHOP_OFFERS.find((o) => o.defId === defId);
  if (!offer || current.gold < offer.price) return current;
  const next: SaveData = {
    ...current,
    gold: current.gold - offer.price,
    storage: [...current.storage, { defId: offer.defId }],
  };
  saveData(next);
  return next;
}

export function recordRun(
  current: SaveData,
  result: {
    depth: number;
    level: number;
    cleared: boolean;
    broughtBack: Item[];
    /**
     * 踏破・区切りで生きて連れ帰った仲間(plan/monster-fusion.mdの
     * 「帰還時の処理」)。全滅時は呼び出し側が空配列を渡す(道具と同じ扱い)
     */
    broughtBackAllies?: Actor[];
    /** 記録の間(plan/records-hall.md)。このダイブ中に倒した・捕まえた数 */
    defeats?: number;
    captures?: number;
    /** 踏破・区切りで持ち帰った所持金(plan/shops-and-thieves.md)。全滅時は0(持ち物と同じロスト規則) */
    goldBroughtBack?: number;
    /** 依頼板(plan/quest-board.md): このダイブ中に種族ごとに倒した数(討伐依頼の判定用) */
    huntKills?: Record<string, number>;
    /** 依頼板: このダイブ中に新たに図鑑「見た」にした種族数(図鑑依頼の判定用) */
    newlySeenCount?: number;
    /** 依頼板: このダイブ中に到達しためざめの階段の階(探索依頼の判定用) */
    reachedDepths?: number[];
    /** 複数のダンジョン(plan/multiple-dungeons.md): 潜っていたダンジョンid。省略時は表の寝穴 */
    dungeonId?: string;
    /** 腕試しの間(plan/hidden-dungeon.md): このダイブの経過ターン数・被ダメージ累計 */
    turns?: number;
    damageTaken?: number;
    /** 実績帳「挑戦」カテゴリ(plan/challenge-achievements.md): このダイブ中に道具(杖・巻物・食料等)を使ったか */
    usedItem?: boolean;
    /** 実績帳「挑戦」カテゴリ: このダイブ中に武器を持ち替えたか(素手・未装備からの初回装備は数えない) */
    usedMultipleWeapons?: boolean;
    /** 山の芯(plan/mountain-core.md): このダイブ中に撃破した地方ボスのspeciesId */
    defeatedRegionBosses?: string[];
    /** 山の芯(plan/mountain-core.md): このダイブで最終フロアの会話イベントを経験したか */
    mountainCoreCleared?: boolean;
    /** 真の目覚め(plan/true-awakening.md): このダイブで「はじめの夢」との決着イベントを経験したか */
    trueAwakeningCleared?: boolean;
  },
): SaveData {
  let nextHutUid = current.nextHutUid;
  // 村の発展(plan/village-development.md): ねむり小屋の収容数上限を超える分は
  // 連れ帰れない(小屋がいっぱいならそのぶんは夢の中に置いてくる)
  const remainingHutCapacity = Math.max(0, hutCapacity(current.villageStage) - current.hut.length);
  const newlyStored: StoredMonster[] = (result.broughtBackAllies ?? [])
    .slice(0, remainingHutCapacity)
    .map((actor) => {
      const stored = actorToStoredMonster(nextHutUid, actor);
      nextHutUid++;
      return stored;
    });

  const next: SaveData = {
    deepest: Math.max(current.deepest, result.depth),
    runs: current.runs + 1,
    clears: current.clears + (result.cleared ? 1 : 0),
    bestLevel: Math.max(current.bestLevel, result.level),
    // 踏破して帰ってきたぶんだけが倉庫に加わる。倒れた場合は持ち込み品が丸ごと消える
    storage: [...current.storage, ...result.broughtBack.map(toStored)],
    knownCheckpoints: current.knownCheckpoints,
    seenTutorialTips: current.seenTutorialTips,
    trainingFocus: current.trainingFocus,
    // 生きて連れ帰った仲間だけがねむり小屋に加わる。全滅時は何も加わらない
    hut: [...current.hut, ...newlyStored],
    nextHutUid,
    records: {
      totalDefeats: current.records.totalDefeats + (result.defeats ?? 0),
      totalCaptures: current.records.totalCaptures + (result.captures ?? 0),
    },
    // 図鑑(plan/monster-compendium.md): 生きて連れ帰った仲間の種族を「捕まえた」にする
    compendium: newlyStored.reduce(
      (acc, m) => (m.speciesId ? { ...acc, [m.speciesId]: "captured" as const } : acc),
      current.compendium,
    ),
    achievements: current.achievements,
    equippedTitle: current.equippedTitle,
    equipmentCompendium: current.equipmentCompendium,
    markCompendium: current.markCompendium,
    materialCompendium: current.materialCompendium,
    difficulty: current.difficulty,
    gold: current.gold + (result.goldBroughtBack ?? 0),
    boardDate: current.boardDate,
    boardOffers: current.boardOffers,
    activeQuests: current.activeQuests,
    completedQuestIds: current.completedQuestIds,
    nightlyDreamBestDepth:
      result.dungeonId === NIGHTLY_DREAM_ID
        ? Math.max(current.nightlyDreamBestDepth, result.depth)
        : current.nightlyDreamBestDepth,
    villageStage: current.villageStage,
    fontSize: current.fontSize,
    unlockedCostumes: current.unlockedCostumes,
    equippedCostume: current.equippedCostume,
    // 腕試しの間(plan/hidden-dungeon.md): 踏破したときだけ記録を1件積む。ロストしない
    arenaRecords:
      result.dungeonId === TRIAL_CHAMBER_ID && result.cleared
        ? [
            ...current.arenaRecords,
            {
              clearedAt: new Date().toISOString(),
              turns: result.turns ?? 0,
              damageTaken: result.damageTaken ?? 0,
            },
          ]
        : current.arenaRecords,
    bonds: current.bonds,
    seenVillageEvents: current.seenVillageEvents,
    lastGiftDates: current.lastGiftDates,
    foundVaultPassages: current.foundVaultPassages,
    lastPlayedAt: current.lastPlayedAt,
    defeatedRegionBosses: Array.from(
      new Set([...current.defeatedRegionBosses, ...(result.defeatedRegionBosses ?? [])]),
    ),
    storyCleared: current.storyCleared || (result.mountainCoreCleared ?? false),
    trueAwakeningCleared: current.trueAwakeningCleared || (result.trueAwakeningCleared ?? false),
  };
  // 依頼板(plan/quest-board.md): 受注中の依頼を判定し、達成していれば報酬を渡して外す
  const withQuests = resolveQuests(next, result);
  // 装備図鑑(plan/equipment-compendium.md): 持ち帰った装備・素材を反映してから、
  // 実績帳(plan/achievements.md)の判定に渡す
  const withEquipmentCompendium = checkEquipmentCompendium(withQuests);
  let withAchievements = checkAchievements(withEquipmentCompendium);
  // 難易度モード(plan/difficulty-modes.md): 「きびしい」専用の称号
  if (result.cleared && current.difficulty === "hard") {
    withAchievements = unlockAchievement(withAchievements, "hardModeClear");
  }
  withAchievements = checkChallengeAchievements(withAchievements, result);
  saveData(withAchievements);
  return withAchievements;
}

/**
 * 実績帳「挑戦」カテゴリ(plan/challenge-achievements.md、縛りプレイ実績)。
 * ダイブ結果に応じた即時判定。討伐累計等の「積み上がる系」の実績
 * (checkAchievements)とは別枠で扱う(性質が違うため無理に同じ関数にまとめない)。
 */
function checkChallengeAchievements(
  current: SaveData,
  result: { depth: number; cleared: boolean; dungeonId?: string; usedItem?: boolean; usedMultipleWeapons?: boolean },
): SaveData {
  if (!result.cleared) return current;
  // 「地方」は表の寝穴(plan/region-expansion.md)だけの概念。他のダンジョンは
  // 全階がチェックポイントになる(design/multiple-dungeons.mdどおり地方の
  // 区切りを持たない)ため、挑戦実績の対象も表の寝穴に限る
  const isMainCave = result.dungeonId === undefined || result.dungeonId === MAIN_CAVE_ID;
  if (!isMainCave) return current;
  let next = current;
  // 「1地方踏破」の判定は地方境界(plan/checkpoint-select.mdが
  // チェックポイントにする、深さがREGION_SIZEの倍数)を使う。区切って
  // 持ち帰ったタイミングと自然に一致する
  if (!result.usedItem && result.depth % REGION_SIZE === 0) {
    next = unlockAchievement(next, "noItemRegion");
  }
  const isMainCaveFullClear = result.depth >= MAIN_CAVE_MAX_DEPTH;
  if (!isMainCaveFullClear) return next;
  if (!result.usedItem) next = unlockAchievement(next, "noItemFullClear");
  if (!result.usedMultipleWeapons) next = unlockAchievement(next, "singleWeapon");
  if (!result.usedItem && !result.usedMultipleWeapons) {
    next = unlockAchievement(next, "noItemSingleWeapon");
  }
  return next;
}

/**
 * 依頼板(plan/quest-board.md)。受注中の依頼それぞれについて、このダイブの
 * 成果から達成条件を満たしたかを判定する。全滅時(result.broughtBack が
 * 空)は採取依頼が判定材料を失うため自然に不達成のままになる
 * (`design/balance-philosophy.md`の「その場の持ち物はロストする」原則どおり)。
 */
function resolveQuests(
  current: SaveData,
  result: {
    broughtBack: Item[];
    huntKills?: Record<string, number>;
    newlySeenCount?: number;
    reachedDepths?: number[];
  },
): SaveData {
  let gold = current.gold;
  let storage = current.storage;
  const remaining: { defId: string; progress: number }[] = [];
  const completed: string[] = [];

  for (const active of current.activeQuests) {
    const def = questDef(active.defId);
    if (!def) continue;
    const achieved = (() => {
      switch (def.kind) {
        case "hunt":
          return (result.huntKills?.[def.target.speciesId ?? ""] ?? 0) >= def.target.count;
        case "gather":
          return (
            result.broughtBack.filter((i) => i.defId === def.target.itemDefId).length >= def.target.count
          );
        case "explore":
          return (result.reachedDepths ?? []).includes(def.target.depth ?? -1);
        case "compendium":
          return (result.newlySeenCount ?? 0) >= def.target.count;
      }
    })();

    if (!achieved) {
      remaining.push(active);
      continue;
    }
    completed.push(def.id);
    gold += def.reward.gold ?? 0;
    for (const material of def.reward.materials ?? []) {
      storage = [...storage, ...Array.from({ length: material.count }, () => ({ defId: material.defId }))];
    }
  }

  if (completed.length === 0) return current;
  // 村の暮らし(plan/village-life.md): 依頼達成は肝いりのオトネの絆を上げる
  // (依頼板の「顔」がオトネであるため、達成数ぶん一律で加算する単純な割り当て)
  const bonds = { ...current.bonds, otone: (current.bonds.otone ?? 0) + completed.length };
  return {
    ...current,
    gold,
    storage,
    activeQuests: remaining,
    completedQuestIds: [...current.completedQuestIds, ...completed],
    bonds,
  };
}

/** ダイブ中のAllyアクターを、ねむり小屋に保存する形へ変換する */
export function actorToStoredMonster(uid: number, actor: Actor): StoredMonster {
  const speciesId = actor.speciesId ?? "";
  const native = NATIVE_SKILL_BY_SPECIES[speciesId];
  return {
    uid,
    speciesId,
    level: actor.level,
    // 仲間自身の経験値蓄積・レベルアップはまだ実装されていないため、常に0
    exp: 0,
    // native(種族由来)はfullSkillSetで暗黙に復元されるため、夢あわせで得た分だけ保存する
    skills: actor.skills ? actor.skills.filter((s) => s !== native) : [],
    nickname: actor.nickname,
    // なじみ(plan/companion-bond-growth.md): この呼び出し自体が「生きて連れ帰った」
    // 成功なので+1する。連れ出していない新規個体はactor.bondSuccessCountがundefinedのまま
    bondSuccessCount: (actor.bondSuccessCount ?? 0) + 1,
    // 成熟(plan/companion-evolution.md): ダイブ中は変化しないため、そのまま引き継ぐ
    recentFusionMaterials: actor.recentFusionMaterials ?? [],
  };
}

/**
 * ねむり小屋から、出発に連れて行く仲間を取り出す(小屋からは消える)。
 * 見つからないuidは無視する。
 */
export function takeFromHut(
  current: SaveData,
  uids: readonly number[],
): { save: SaveData; taken: StoredMonster[] } {
  const taken: StoredMonster[] = [];
  const remaining: StoredMonster[] = [];
  for (const m of current.hut) {
    if (uids.includes(m.uid) && taken.length < uids.length) taken.push(m);
    else remaining.push(m);
  }
  const next: SaveData = { ...current, hut: remaining };
  saveData(next);
  return { save: next, taken };
}

/** 夢に還す(plan/release-companion.md)ときに残すほこら粉の数。ごくわずか、に留める */
export const RELEASE_COMPANION_HOKORA_DUST = 1;

/**
 * 夢に還す(plan/release-companion.md)。ねむり小屋からuidの個体を取り除き、
 * ごくわずかなほこら粉を残す。図鑑(plan/monster-compendium.md)の記録は
 * hut配列とは独立しているため、何もしなくても消えない。見つからないuidは無視する
 */
export function releaseCompanion(current: SaveData, uid: number): SaveData {
  const target = current.hut.find((m) => m.uid === uid);
  // お気に入りロック(plan/companion-favorite-lock.md): 誤操作防止のガード。
  // 通常はUI側(先にお気に入りを外させる)が呼ばせないが、念のためここでも弾く
  if (!target || target.favorite) return current;
  const next: SaveData = {
    ...current,
    hut: current.hut.filter((m) => m.uid !== uid),
    storage: [
      ...current.storage,
      ...Array.from({ length: RELEASE_COMPANION_HOKORA_DUST }, () => ({ defId: HOKORA_DUST_DEF_ID })),
    ],
  };
  saveData(next);
  return next;
}

/**
 * ねむり小屋の個体を改名する(plan/companion-naming.md)。
 * uidが見つからなければ null を返す(何もしない)。nicknameにundefinedを
 * 渡すと、名前を消して種族名表示に戻す。
 */
export function renameStoredMonster(
  current: SaveData,
  uid: number,
  nickname: string | undefined,
): SaveData | null {
  if (!current.hut.some((m) => m.uid === uid)) return null;
  const hut = current.hut.map((m) => (m.uid === uid ? { ...m, nickname } : m));
  const next: SaveData = { ...current, hut };
  saveData(next);
  return next;
}

/**
 * お気に入り(plan/companion-favorite-lock.md)の切り替え。
 * uidが見つからなければ null を返す(何もしない)。
 */
export function toggleFavorite(current: SaveData, uid: number): SaveData | null {
  if (!current.hut.some((m) => m.uid === uid)) return null;
  const hut = current.hut.map((m) => (m.uid === uid ? { ...m, favorite: !m.favorite } : m));
  const next: SaveData = { ...current, hut };
  saveData(next);
  return next;
}

/**
 * 夢あわせ。軸(残す側)に糧(消える側)を溶け込ませる。
 * どちらかのuidが見つからなければ null を返す(何もしない)。
 */
export function fuseMonsters(
  current: SaveData,
  axisUid: number,
  foodUid: number,
): { save: SaveData; result: StoredMonster } | null {
  if (axisUid === foodUid) return null;
  const axis = current.hut.find((m) => m.uid === axisUid);
  const food = current.hut.find((m) => m.uid === foodUid);
  if (!axis || !food) return null;
  // お気に入りロック(plan/companion-favorite-lock.md): 糧側だけを禁止する。
  // 軸(残る側)は消えないため制限しない。通常はUI側が呼ばせないが念のため
  if (food.favorite) return null;

  // 種族由来(native)の特技は暗黙で持つため、比較・上限判定は完全な特技一式で行う。
  // 実際に保存するのは夢あわせで追加した分だけ
  const axisFull = fullSkillSet(axis.speciesId, axis.skills);
  const foodFull = fullSkillSet(food.speciesId, food.skills);
  const inheritable = foodFull.find((s) => !axisFull.includes(s));
  const skills =
    inheritable && axisFull.length < MAX_SKILLS ? [...axis.skills, inheritable] : [...axis.skills];

  // 成熟(plan/companion-evolution.md): 直近の糧の種族履歴を更新してから、成熟条件を判定する
  const recentFusionMaterials = [...axis.recentFusionMaterials, food.speciesId].slice(
    -MAX_RECENT_FUSION_MATERIALS,
  );
  // 地方ボス(plan/region-bosses.md): 糧にすると通常個体3体分の経験値換算になる
  // (仲間にする体験を、単なる効率アイテムにしないための特別ルール)
  const foodValueMultiplier = speciesById(food.speciesId).isRegionBoss ? 3 : 1;
  const fused: StoredMonster = {
    ...axis,
    level: axis.level + Math.floor((food.level * foodValueMultiplier) / 2) + 1,
    skills,
    recentFusionMaterials,
  };
  const result = tryEvolve(fused);

  const hut = current.hut
    .filter((m) => m.uid !== foodUid)
    .map((m) => (m.uid === axisUid ? result : m));
  // 図鑑(plan/monster-compendium.md): 夢あわせの糧にした種族も「捕まえた」扱いにする。
  // 成熟が起きた場合は、進化後の姿も別エントリとして「捕まえた」にする
  const compendium: Record<string, CompendiumStatus> = {
    ...current.compendium,
    [axis.speciesId]: "captured",
    [food.speciesId]: "captured",
    ...(result.speciesId !== fused.speciesId ? { [result.speciesId]: "captured" as const } : {}),
  };
  const next: SaveData = { ...current, hut, compendium };
  const withAchievements = checkAchievements(next);
  saveData(withAchievements);
  return { save: withAchievements, result };
}

export function toStored(item: Item): StoredItem {
  const stored: StoredItem = { defId: item.defId };
  if (item.charges !== undefined) stored.charges = item.charges;
  if (item.plus !== undefined) stored.plus = item.plus;
  if (item.markIds !== undefined && item.markIds.length > 0) stored.markIds = item.markIds;
  return stored;
}

/** 倉庫のStoredItemを、ダイブに持ち込むItemへ戻す(uidはダイブごとに振り直す) */
export function fromStored(stored: StoredItem, uid: number): Item {
  const item: Item = { uid, defId: stored.defId };
  if (stored.charges !== undefined) item.charges = stored.charges;
  if (stored.plus !== undefined) item.plus = stored.plus;
  if (stored.markIds !== undefined && stored.markIds.length > 0) item.markIds = stored.markIds;
  return item;
}

const VALID_MARK_IDS = new Set(MARKS.map((m) => m.id));

function sanitizeStorage(value: unknown): StoredItem[] {
  if (!Array.isArray(value)) return initialSave().storage;
  const out: StoredItem[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const defId = (entry as StoredItem).defId;
    if (typeof defId !== "string" || !VALID_IDS.has(defId)) continue;
    const stored: StoredItem = { defId };
    const charges = (entry as StoredItem).charges;
    if (typeof charges === "number") stored.charges = charges;
    const plus = (entry as StoredItem).plus;
    if (typeof plus === "number" && Number.isInteger(plus) && plus >= 0 && plus <= MAX_PLUS) {
      stored.plus = plus;
    }
    // dual-mark-equipment.md以前のセーブは単数形markIdを持つ。
    // markIds: [markId] へ読み替える(この1箇所限りのマイグレーション)
    const legacyMarkId = (entry as { markId?: unknown }).markId;
    const rawMarkIds = (entry as { markIds?: unknown }).markIds;
    let markIds: MarkId[] | undefined;
    if (Array.isArray(rawMarkIds)) {
      markIds = rawMarkIds.filter((m): m is MarkId => typeof m === "string" && VALID_MARK_IDS.has(m as MarkId));
    } else if (typeof legacyMarkId === "string" && VALID_MARK_IDS.has(legacyMarkId as MarkId)) {
      markIds = [legacyMarkId as MarkId];
    }
    if (markIds && markIds.length > 0) {
      stored.markIds = markIds.slice(0, MAX_MARK_SLOTS);
    }
    out.push(stored);
  }
  return out;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function sanitizeRecords(value: unknown): DiveRecords {
  const v = (value ?? {}) as Partial<DiveRecords>;
  return {
    totalDefeats: numberOr(v.totalDefeats, 0),
    totalCaptures: numberOr(v.totalCaptures, 0),
  };
}

const VALID_COMPENDIUM_STATUSES: readonly CompendiumStatus[] = ["seen", "captured"];

function sanitizeCompendium(value: unknown): Record<string, CompendiumStatus> {
  const out: Record<string, CompendiumStatus> = {};
  if (typeof value !== "object" || value === null) return out;
  for (const [speciesId, status] of Object.entries(value as Record<string, unknown>)) {
    if (!VALID_SPECIES_IDS.has(speciesId)) continue;
    if (typeof status !== "string" || !(VALID_COMPENDIUM_STATUSES as readonly string[]).includes(status)) continue;
    out[speciesId] = status as CompendiumStatus;
  }
  return out;
}

const VALID_QUEST_IDS = new Set(QUESTS.map((q) => q.id));

function sanitizeQuestIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && VALID_QUEST_IDS.has(v));
}

function sanitizeActiveQuests(value: unknown): { defId: string; progress: number }[] {
  if (!Array.isArray(value)) return [];
  const out: { defId: string; progress: number }[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const defId = (entry as { defId?: unknown }).defId;
    const progress = (entry as { progress?: unknown }).progress;
    if (typeof defId !== "string" || !VALID_QUEST_IDS.has(defId)) continue;
    out.push({ defId, progress: typeof progress === "number" && Number.isFinite(progress) ? progress : 0 });
  }
  return out.slice(0, MAX_ACTIVE_QUESTS);
}

/**
 * 依頼板(plan/quest-board.md)。日付が変わっていれば、受注していない
 * 残り枠だけを新しいオファーで補充する。受注済みの依頼(activeQuests)は
 * 日付が変わっても消えない
 */
export function refreshBoard(current: SaveData, dateKey: string): SaveData {
  if (current.boardDate === dateKey) return current;
  const activeIds = new Set(current.activeQuests.map((q) => q.defId));
  const excluded = new Set([...activeIds, ...current.completedQuestIds]);
  const openSlots = Math.max(0, MAX_ACTIVE_QUESTS - current.activeQuests.length);
  const offers = questsForDate(dateKey)
    .filter((q) => !excluded.has(q.id))
    .slice(0, openSlots)
    .map((q) => q.id);
  const next: SaveData = { ...current, boardDate: dateKey, boardOffers: offers };
  saveData(next);
  return next;
}

/** 依頼を受注する。既に3件受注済み、または既に受注中/達成済みなら何もしない */
export function acceptQuest(current: SaveData, defId: string): SaveData {
  if (current.activeQuests.length >= MAX_ACTIVE_QUESTS) return current;
  if (current.activeQuests.some((q) => q.defId === defId)) return current;
  if (current.completedQuestIds.includes(defId)) return current;
  if (!questDef(defId)) return current;
  const next: SaveData = {
    ...current,
    activeQuests: [...current.activeQuests, { defId, progress: 0 }],
    boardOffers: current.boardOffers.filter((id) => id !== defId),
  };
  saveData(next);
  return next;
}

/** 受注中の依頼を明示的に破棄する(達成扱いにはならない) */
export function abandonQuest(current: SaveData, defId: string): SaveData {
  if (!current.activeQuests.some((q) => q.defId === defId)) return current;
  const next: SaveData = {
    ...current,
    activeQuests: current.activeQuests.filter((q) => q.defId !== defId),
  };
  saveData(next);
  return next;
}

/**
 * 図鑑(plan/monster-compendium.md)に「見た」を記録する。既に「見た」以上
 * (見た・捕まえた)なら何もしない
 */
export function markSpeciesSeen(current: SaveData, speciesId: string): SaveData {
  if (current.compendium[speciesId] !== undefined) return current;
  const next: SaveData = { ...current, compendium: { ...current.compendium, [speciesId]: "seen" } };
  saveData(next);
  return next;
}

/**
 * 図鑑に「捕まえた」を記録する。タルで仲間にした、または夢あわせの
 * 糧にした種族のどちらもここを通る
 */
export function markSpeciesCaptured(current: SaveData, speciesId: string): SaveData {
  if (current.compendium[speciesId] === "captured") return current;
  const next: SaveData = { ...current, compendium: { ...current.compendium, [speciesId]: "captured" } };
  // 実績帳(plan/achievements.md): 図鑑を半分/全部埋めた実績をここで確定させる
  const withAchievements = checkAchievements(next);
  saveData(withAchievements);
  return withAchievements;
}

/**
 * 全種族を「捕まえた」まで埋めているか(かがやきの夢のかけらの出現率upの条件)。
 * 「はじめの夢」(plan/true-awakening.md)は判定対象から除く――isTrueAwakening
 * Unlockedがこの関数を条件のひとつに使っており、かつ「はじめの夢」自体は
 * その局面でしか出会えないため、含めてしまうと「図鑑を完成させないと局面に
 * 入れないが、その局面でしか捕まえられない種族がいる」という循環になって
 * しまう。「はじめの夢」ぶんは、文字どおりの完全制覇を望むプレイヤー向けの
 * おまけの捕獲対象という位置づけにする
 */
export function isCompendiumComplete(current: SaveData): boolean {
  return SPECIES.filter((s) => s.id !== HAJIME_NO_YUME_ID).every((s) => current.compendium[s.id] === "captured");
}

/**
 * 真の目覚め(隠し最終局面、plan/true-awakening.md)。design/postgame.md
 * どおり3系統のANDで判定する。3件目の実績数のしきい値は本文書の未決事項
 * だったため、現状の実績総数(trueAwakening自身を除く15件)の6〜7割
 * 程度を目安に、実装時の判断として10件とした
 */
const TRUE_AWAKENING_ACHIEVEMENT_THRESHOLD = 10;

export function isTrueAwakeningUnlocked(save: SaveData): boolean {
  return (
    isCompendiumComplete(save) &&
    REGION_BOSS_ORDER.every((id) => save.defeatedRegionBosses.includes(id)) &&
    Object.keys(save.achievements).length >= TRUE_AWAKENING_ACHIEVEMENT_THRESHOLD
  );
}

function sanitizeAchievements(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof value !== "object" || value === null) return out;
  for (const [id, date] of Object.entries(value as Record<string, unknown>)) {
    if (!VALID_ACHIEVEMENT_IDS.has(id)) continue;
    if (typeof date !== "string") continue;
    out[id] = date;
  }
  return out;
}

const VALID_EQUIPMENT_DEF_IDS = new Set(
  ITEMS.filter((i) => i.category === "weapon" || i.category === "head" || i.category === "charm").map(
    (i) => i.id,
  ),
);
const VALID_MATERIAL_DEF_IDS = new Set(ITEMS.filter((i) => i.category === "material").map((i) => i.id));
const WEAPON_DEF_IDS = new Set(ITEMS.filter((i) => i.category === "weapon").map((i) => i.id));

function sanitizeEquipmentCompendium(value: unknown): Record<string, EquipmentCompendiumStatus> {
  const out: Record<string, EquipmentCompendiumStatus> = {};
  if (typeof value !== "object" || value === null) return out;
  for (const [defId, status] of Object.entries(value as Record<string, unknown>)) {
    if (!VALID_EQUIPMENT_DEF_IDS.has(defId)) continue;
    if (status !== "owned" && status !== "mastered") continue;
    out[defId] = status;
  }
  return out;
}

function sanitizeEquippedTitle(value: unknown, achievements: Record<string, string>): string | undefined {
  if (typeof value !== "string") return undefined;
  if (achievements[value] === undefined) return undefined;
  if (!achievementDef(value)?.title) return undefined;
  return value;
}

/**
 * 実績帳(plan/achievements.md)。指定した実績idを、まだ未達成なら現在日時で
 * 記録する。一度記録した実績は取り消さない(既に達成済みなら何もしない)
 */
export function unlockAchievement(current: SaveData, id: string): SaveData {
  if (current.achievements[id] !== undefined) return current;
  if (!achievementDef(id)) return current;
  const next: SaveData = {
    ...current,
    achievements: { ...current.achievements, [id]: new Date().toISOString() },
  };
  saveData(next);
  return next;
}

/**
 * 実績帳。既存のセーブフィールドから、しきい値ベースの実績をまとめて
 * 再評価する。達成イベント専用の監視処理を新設せず、記録の変わる箇所
 * (ダイブの成果反映・図鑑更新・拠点からの出発時など)で呼べばよい設計。
 * `extraItems` は、まだ倉庫に戻っていない持ち込み品(強化・刻印の実績判定に
 * 必要)を追加で走査したいときに渡す
 */
export function checkAchievements(current: SaveData, extraItems: readonly StoredItem[] = []): SaveData {
  let next = current;
  const captured = SPECIES.filter((s) => next.compendium[s.id] === "captured").length;
  if (captured * 2 >= SPECIES.length) next = unlockAchievement(next, "compendiumHalf");
  if (isCompendiumComplete(next)) next = unlockAchievement(next, "compendiumFull");
  if (next.records.totalDefeats >= 50) next = unlockAchievement(next, "defeats50");
  if (next.records.totalCaptures >= 10) next = unlockAchievement(next, "captures10");
  if (next.clears >= 1) next = unlockAchievement(next, "clear1");
  if (next.bestLevel >= 10) next = unlockAchievement(next, "level10");

  const items = [...next.storage, ...extraItems];
  if (items.some((i) => (i.plus ?? 0) >= MAX_PLUS)) next = unlockAchievement(next, "maxPlusReached");
  const forgedMarkIds = new Set(items.flatMap((i) => i.markIds ?? []));
  if (MARKS.every((m) => forgedMarkIds.has(m.id))) next = unlockAchievement(next, "allMarksForged");

  // 装備図鑑(plan/equipment-compendium.md): 武器図鑑コンプリートの称号
  if (isWeaponCompendiumComplete(next)) next = unlockAchievement(next, "weaponCompendiumComplete");

  // 真の目覚め(plan/true-awakening.md): 「はじめの夢」との決着イベントを経験した称号
  if (next.trueAwakeningCleared) next = unlockAchievement(next, "trueAwakening");

  return next;
}

/** 称号を身につける/外す。titleを持たない実績・未達成の実績は無視する */
export function setEquippedTitle(current: SaveData, id: string | undefined): SaveData {
  if (id !== undefined && (current.achievements[id] === undefined || !achievementDef(id)?.title)) {
    return current;
  }
  const next: SaveData = { ...current, equippedTitle: id };
  saveData(next);
  return next;
}

function sanitizeMarkCompendium(value: unknown): Record<string, "owned"> {
  const out: Record<string, "owned"> = {};
  if (typeof value !== "object" || value === null) return out;
  for (const [markId, status] of Object.entries(value as Record<string, unknown>)) {
    if (!VALID_MARK_IDS.has(markId as MarkId) || status !== "owned") continue;
    out[markId] = "owned";
  }
  return out;
}

function sanitizeMaterialCompendium(value: unknown): Record<string, "owned"> {
  const out: Record<string, "owned"> = {};
  if (typeof value !== "object" || value === null) return out;
  for (const [defId, status] of Object.entries(value as Record<string, unknown>)) {
    if (!VALID_MATERIAL_DEF_IDS.has(defId) || status !== "owned") continue;
    out[defId] = "owned";
  }
  return out;
}

/**
 * 装備図鑑(plan/equipment-compendium.md)。倉庫(+持ち込み品)を走査し、
 * 武器・頭防具・装身具・印・素材の入手/極めた状態をまとめて更新する。
 * `unlockAchievement`と同じく、一度記録した段階は取り消さない
 * (頭防具・装身具・素材・印は、入手した時点で自動的に"mastered"/"owned"扱い。
 * 強化・刻印の概念があるのは武器だけ)
 */
export function checkEquipmentCompendium(current: SaveData, extraItems: readonly StoredItem[] = []): SaveData {
  const items = [...current.storage, ...extraItems];
  const equipmentCompendium = { ...current.equipmentCompendium };
  const markCompendium = { ...current.markCompendium };
  const materialCompendium = { ...current.materialCompendium };

  for (const item of items) {
    if (VALID_EQUIPMENT_DEF_IDS.has(item.defId) && equipmentCompendium[item.defId] !== "mastered") {
      const isWeapon = WEAPON_DEF_IDS.has(item.defId);
      // 頭防具・装身具は強化・刻印の概念が無いので、入手した時点で自動的に極めた扱い。
      // 武器は+9かつ印を刻んで初めて極めたになる
      const mastered = !isWeapon || ((item.plus ?? 0) >= MAX_PLUS && (item.markIds?.length ?? 0) > 0);
      equipmentCompendium[item.defId] = mastered ? "mastered" : "owned";
    }
    if (VALID_MATERIAL_DEF_IDS.has(item.defId)) materialCompendium[item.defId] = "owned";
    for (const markId of item.markIds ?? []) markCompendium[markId] = "owned";
  }

  const next: SaveData = { ...current, equipmentCompendium, markCompendium, materialCompendium };
  saveData(next);
  return next;
}

/** 武器図鑑を全系統「極めた」まで埋めているか(称号「樽守りの目利き」の条件) */
export function isWeaponCompendiumComplete(current: SaveData): boolean {
  return [...WEAPON_DEF_IDS].every((id) => current.equipmentCompendium[id] === "mastered");
}

/** 1階(入口)は常に知っている扱いにする */
function sanitizeCheckpoints(value: unknown): number[] {
  const known = new Set<number>([1]);
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === "number" && Number.isInteger(entry) && entry >= 1) known.add(entry);
    }
  }
  return [...known].sort((a, b) => a - b);
}

const VALID_SPECIES_IDS = new Set(SPECIES.map((s) => s.id));
const VALID_SKILL_IDS = new Set(SKILLS.map((s) => s.id));
const VALID_ACHIEVEMENT_IDS = new Set(ACHIEVEMENTS.map((a) => a.id));

function sanitizeHut(value: unknown): StoredMonster[] {
  if (!Array.isArray(value)) return [];
  const out: StoredMonster[] = [];
  const seenUids = new Set<number>();
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const m = entry as Partial<StoredMonster>;
    if (typeof m.uid !== "number" || !Number.isInteger(m.uid) || seenUids.has(m.uid)) continue;
    if (typeof m.speciesId !== "string" || !VALID_SPECIES_IDS.has(m.speciesId)) continue;
    if (typeof m.level !== "number" || !Number.isFinite(m.level) || m.level < 1) continue;
    const skills = Array.isArray(m.skills)
      ? m.skills.filter((s): s is SkillId => typeof s === "string" && VALID_SKILL_IDS.has(s))
      : [];
    seenUids.add(m.uid);
    const monster: StoredMonster = {
      uid: m.uid,
      speciesId: m.speciesId,
      level: m.level,
      exp: typeof m.exp === "number" && Number.isFinite(m.exp) ? m.exp : 0,
      skills,
      nickname: typeof m.nickname === "string" ? m.nickname : undefined,
      bondSuccessCount:
        typeof m.bondSuccessCount === "number" && Number.isFinite(m.bondSuccessCount) && m.bondSuccessCount >= 0
          ? m.bondSuccessCount
          : 0,
      recentFusionMaterials: Array.isArray(m.recentFusionMaterials)
        ? m.recentFusionMaterials
            .filter((id): id is string => typeof id === "string" && VALID_SPECIES_IDS.has(id))
            .slice(-MAX_RECENT_FUSION_MATERIALS)
        : [],
    };
    if (m.favorite === true) monster.favorite = true;
    out.push(monster);
  }
  return out;
}

function nextHutUidFrom(hut: readonly StoredMonster[]): number {
  return hut.reduce((max, m) => Math.max(max, m.uid), 0) + 1;
}

const VALID_TIP_IDS = new Set<string>(TUTORIAL_TIP_IDS);

function sanitizeTutorialTips(value: unknown): TutorialTipId[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<TutorialTipId>();
  for (const entry of value) {
    if (typeof entry === "string" && VALID_TIP_IDS.has(entry)) seen.add(entry as TutorialTipId);
  }
  return [...seen];
}

// ---------------------------------------------------------------- ダイブ中オートセーブ

/**
 * ダイブ中の状態をまるごと書き出す。プレイヤーの入力で1ターンが解決する
 * たびに呼ぶ想定(README「core が1ターン分を即座に解決する」の直後)。
 */
export function saveRunSnapshot(snapshot: RunSnapshot, slot: number = activeSlot): void {
  try {
    localStorage.setItem(slotSnapshotKey(slot), JSON.stringify(packSnapshot(snapshot)));
  } catch {
    // オートセーブが書き込めなくても遊べはするので、失敗は握りつぶす
  }
}

/**
 * 残っているスナップショットを読む。壊れている・形が合わない場合は
 * 復帰できるものが無かったものとして null を返す(1回限りの保証なので、
 * 中途半端な状態を無理に復元するより諦めた方が安全)。
 *
 * 保存形式が変わったあとに残っていた古いスナップショットも、ここで
 * 「形が合わないもの」として捨てられる。ダイブ中の一時状態なので、
 * 移行を書くより拠点から始め直してもらう方が安全で単純。
 */
export function loadRunSnapshot(slot: number = activeSlot): RunSnapshot | null {
  try {
    const raw = localStorage.getItem(slotSnapshotKey(slot));
    if (!raw) return null;
    const unpacked = unpackSnapshot(JSON.parse(raw) as PackedSnapshot);
    if (!unpacked) return null;
    return isValidSnapshot(unpacked) ? unpacked : null;
  } catch {
    return null;
  }
}

// ---- スナップショットの保存形式 ----
//
// タイル格子をそのまま JSON にすると、1マスあたり
// {"kind":0,"roomId":-1,"explored":false,"visible":false} で55バイト、
// 48×36=1728マスで94KBになる。実際に持っている情報は1マス数ビットで、
// これを毎ターン同期で localStorage に書くのは割に合わない
// (実測: スナップショット全体100KBのうち94%がタイル)。
//
// そこで地形は1マス1文字の文字列、探索済みフラグはビット列に畳む。
// visible と roomId は保存しない。
//   visible … プレイヤー位置から決まる導出値。復帰時に再計算する
//   roomId  … 部屋の矩形から決まる。paintRoom が矩形内を必ず塗り、
//             digCorridor は壁しか書き換えないので、矩形から厳密に復元できる
// 深みタイルと奔流タイルは数が少ないので、位置の一覧で持つ。

/** 6ビットを1文字に詰めるときの並び。URLに出しても安全な字だけを使う */
const BIT_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function packBits(flags: readonly boolean[]): string {
  let out = "";
  for (let i = 0; i < flags.length; i += 6) {
    let six = 0;
    for (let b = 0; b < 6; b++) if (flags[i + b]) six |= 1 << b;
    out += BIT_CHARS[six];
  }
  return out;
}

function unpackBits(packed: string, count: number): boolean[] {
  const flags: boolean[] = new Array(count).fill(false);
  for (let i = 0; i < packed.length; i++) {
    const six = BIT_CHARS.indexOf(packed[i]!);
    if (six < 0) continue;
    for (let b = 0; b < 6; b++) {
      const at = i * 6 + b;
      if (at < count) flags[at] = (six & (1 << b)) !== 0;
    }
  }
  return flags;
}

interface PackedTiles {
  /** 1マス1文字。TileKind をそのまま10進1桁で並べる */
  kind: string;
  /** 一度でも見えたマスのビット列 */
  explored: string;
  /** いま見えているマスのビット列 */
  visible: string;
  /** 深みタイルの位置。無ければ省く */
  quagmire?: number[];
  /** 奔流タイルの位置と向きの組。無ければ省く */
  torrent?: [number, number][];
}

type PackedFloor = Omit<FloorState, "tiles"> & { tiles: PackedTiles };
type PackedSnapshot = Omit<RunSnapshot, "floor"> & { floor: PackedFloor };

function packSnapshot(snapshot: RunSnapshot): PackedSnapshot {
  const tiles = snapshot.floor.tiles;
  let kind = "";
  const explored: boolean[] = new Array(tiles.length);
  const visible: boolean[] = new Array(tiles.length);
  const quagmire: number[] = [];
  const torrent: [number, number][] = [];
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i]!;
    kind += String(t.kind);
    explored[i] = t.explored;
    visible[i] = t.visible;
    if (t.quagmire) quagmire.push(i);
    if (t.torrent !== undefined) torrent.push([i, t.torrent]);
  }
  const packed: PackedTiles = {
    kind,
    explored: packBits(explored),
    visible: packBits(visible),
  };
  if (quagmire.length > 0) packed.quagmire = quagmire;
  if (torrent.length > 0) packed.torrent = torrent;
  // tiles を上書きする形にすることで、フロアの他のフィールドの並びを崩さない
  return { ...snapshot, floor: { ...snapshot.floor, tiles: packed } };
}

/** 畳んだ形を元に戻す。形が合わなければ null(古い保存や壊れた保存) */
function unpackSnapshot(packed: PackedSnapshot | null): RunSnapshot | null {
  const floor = packed?.floor;
  const packedTiles = floor?.tiles as PackedTiles | undefined;
  if (!floor || !packedTiles || typeof packedTiles.kind !== "string") return null;

  const count = floor.width * floor.height;
  if (packedTiles.kind.length !== count) return null;

  const explored = unpackBits(packedTiles.explored ?? "", count);
  const visible = unpackBits(packedTiles.visible ?? "", count);
  const tiles: Tile[] = new Array(count);
  for (let i = 0; i < count; i++) {
    tiles[i] = {
      kind: Number(packedTiles.kind[i]) as Tile["kind"],
      roomId: -1,
      explored: explored[i] ?? false,
      visible: visible[i] ?? false,
    };
  }
  for (const i of packedTiles.quagmire ?? []) {
    const t = tiles[i];
    if (t) t.quagmire = true;
  }
  for (const [i, dir] of packedTiles.torrent ?? []) {
    const t = tiles[i];
    if (t) t.torrent = dir as NonNullable<Tile["torrent"]>;
  }
  // roomId は部屋の矩形から引き直す
  for (const room of floor.rooms ?? []) {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        const t = tiles[y * floor.width + x];
        if (t) t.roomId = room.id;
      }
    }
  }
  return { ...packed, floor: { ...floor, tiles } } as RunSnapshot;
}

/** 復帰した瞬間、または通常の終了(全滅・踏破・区切り)で消費する */
export function clearRunSnapshot(slot: number = activeSlot): void {
  try {
    localStorage.removeItem(slotSnapshotKey(slot));
  } catch {
    // 消せなくても致命的ではない
  }
}

const VALID_RUN_STATUSES: readonly RunStatus[] = ["playing", "dead", "cleared"];

function isValidSnapshot(value: Partial<RunSnapshot>): value is RunSnapshot {
  return (
    typeof value.rngState === "number" &&
    typeof value.maxDepth === "number" &&
    typeof value.depth === "number" &&
    typeof value.turnCount === "number" &&
    typeof value.actorIdCounter === "number" &&
    typeof value.itemUidCounter === "number" &&
    typeof value.barrelIdCounter === "number" &&
    typeof value.endReason === "string" &&
    typeof value.status === "string" &&
    VALID_RUN_STATUSES.includes(value.status as RunStatus) &&
    typeof value.floor === "object" &&
    value.floor !== null &&
    typeof value.player === "object" &&
    value.player !== null &&
    Array.isArray(value.allies) &&
    typeof value.trainingFocus === "string" &&
    (VALID_TRAINING_FOCI as readonly string[]).includes(value.trainingFocus)
  );
}

const VALID_TRAINING_FOCI: readonly TrainingFocus[] = ["offense", "defense", "balance"];

function sanitizeTrainingFocus(value: unknown): TrainingFocus {
  return typeof value === "string" && (VALID_TRAINING_FOCI as readonly string[]).includes(value)
    ? (value as TrainingFocus)
    : "balance";
}

function sanitizeDifficulty(value: unknown): DifficultyMode {
  return typeof value === "string" && (DIFFICULTY_MODES as readonly string[]).includes(value)
    ? (value as DifficultyMode)
    : "normal";
}

function sanitizeVillageStage(value: unknown): VillageStage {
  return value === 1 || value === 2 || value === 3 || value === 4 ? value : 1;
}

const VALID_COSTUME_IDS = new Set(COSTUMES.map((c) => c.id));

/** 衣装・見た目カスタマイズ(plan/costumes.md): 既知の衣装idだけを残し、"default"は必ず含める */
function sanitizeUnlockedCostumes(value: unknown): string[] {
  const known = Array.isArray(value)
    ? value.filter((id): id is string => typeof id === "string" && VALID_COSTUME_IDS.has(id))
    : [];
  return known.includes(DEFAULT_COSTUME_ID) ? known : [DEFAULT_COSTUME_ID, ...known];
}

function sanitizeEquippedCostume(value: unknown, unlocked: string[]): string {
  return typeof value === "string" && unlocked.includes(value) ? value : DEFAULT_COSTUME_ID;
}

/** 腕試しの間(plan/hidden-dungeon.md): 壊れた要素は捨て、正しい形のものだけ残す */
function sanitizeArenaRecords(value: unknown): ArenaRecord[] {
  if (!Array.isArray(value)) return [];
  const out: ArenaRecord[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const r = entry as Partial<ArenaRecord>;
    if (typeof r.clearedAt !== "string") continue;
    if (typeof r.turns !== "number" || !Number.isFinite(r.turns) || r.turns < 0) continue;
    if (typeof r.damageTaken !== "number" || !Number.isFinite(r.damageTaken) || r.damageTaken < 0) continue;
    out.push({ clearedAt: r.clearedAt, turns: r.turns, damageTaken: r.damageTaken });
  }
  return out;
}

const VALID_VILLAGE_NPC_IDS = new Set(VILLAGE_NPCS.map((n) => n.id));

/** 村の暮らし(plan/village-life.md): 既知のNPCidだけを残し、負の値は0に切り詰める */
function sanitizeBonds(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (typeof value !== "object" || value === null) return out;
  for (const [npcId, level] of Object.entries(value as Record<string, unknown>)) {
    if (!VALID_VILLAGE_NPC_IDS.has(npcId as VillageNpcId)) continue;
    if (typeof level !== "number" || !Number.isFinite(level)) continue;
    out[npcId] = Math.max(0, Math.floor(level));
  }
  return out;
}

function sanitizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function sanitizeLastGiftDates(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof value !== "object" || value === null) return out;
  for (const [npcId, date] of Object.entries(value as Record<string, unknown>)) {
    if (!VALID_VILLAGE_NPC_IDS.has(npcId as VillageNpcId)) continue;
    if (typeof date !== "string") continue;
    out[npcId] = date;
  }
  return out;
}

/** 村の暮らし(plan/village-life.md): NPCの絆を上げる。存在しないNPCidは無視する */
export function raiseBond(current: SaveData, npcId: VillageNpcId, amount = 1): SaveData {
  if (!VALID_VILLAGE_NPC_IDS.has(npcId) || amount <= 0) return current;
  const nextLevel = (current.bonds[npcId] ?? 0) + amount;
  return { ...current, bonds: { ...current.bonds, [npcId]: nextLevel } };
}

/** 村の暮らし(plan/village-life.md): 挿話を「見た」として記録する。重複しない */
export function markVillageEventSeen(current: SaveData, eventId: string): SaveData {
  if (current.seenVillageEvents.includes(eventId)) return current;
  return { ...current, seenVillageEvents: [...current.seenVillageEvents, eventId] };
}

/**
 * 村の暮らし(plan/village-life.md): 素材をNPCに献上して絆を+1する。
 * 対象の素材を1個以上持っていて、かつそのNPCへ今日まだ渡していない場合だけ成立する。
 * 条件を満たさない場合は何も変えずそのまま返す(既存のacceptQuest等と同じ、静かな失敗パターン)。
 */
export function giftMaterial(current: SaveData, npcId: VillageNpcId, defId: string): SaveData {
  if (!VALID_VILLAGE_NPC_IDS.has(npcId)) return current;
  const today = todayKey();
  if (current.lastGiftDates[npcId] === today) return current;
  const index = current.storage.findIndex((item) => item.defId === defId);
  if (index < 0) return current;
  const storage = [...current.storage];
  storage.splice(index, 1);
  return raiseBond(
    { ...current, storage, lastGiftDates: { ...current.lastGiftDates, [npcId]: today } },
    npcId,
  );
}

/** 村の暮らし(plan/village-life.md): NPCの絆段階が今の記録で新たに跨いだか確認するための補助 */
export function villageNpcBondStage(current: SaveData, npcId: VillageNpcId): ReturnType<typeof bondStage> {
  return bondStage(current.bonds[npcId] ?? 0);
}

const BOND_STAGE_RANK: readonly BondStage[] = ["none", "familiar", "close", "irreplaceable"];

/**
 * NPCサイドストーリー第1弾(plan/side-stories-part1.md)・第2弾(plan/
 * side-stories-part2.md)。話しかけた結果、新たに解放された一言があれば
 * `message`を返す(無ければ沈黙する)。モグラ婆・ゲンド・オトネ・おキヨ・
 * ポチは絆段階(+追加条件)、目覚めたおたまは訪問回数(seenVillageEvents
 * の件数)で段が進む
 */
export function talkToNpc(current: SaveData, npcId: VillageNpcId): { save: SaveData; message?: string } {
  const story = sideStoryFor(npcId);
  if (story) return talkSideStoryNpc(current, npcId, story);
  if (npcId === "otama") return talkToOtama(current);
  return { save: current };
}

/** おキヨ第2段(plan/side-stories-part2.md): 図鑑を半分以上「捕まえた」で埋めているか */
function isCompendiumHalf(save: SaveData): boolean {
  const captured = SPECIES.filter((s) => save.compendium[s.id] === "captured").length;
  return captured * 2 >= SPECIES.length;
}

function sideStoryStageMet(current: SaveData, bondStageOfNpc: BondStage, s: SideStoryStage): boolean {
  if (BOND_STAGE_RANK.indexOf(bondStageOfNpc) < BOND_STAGE_RANK.indexOf(s.minBondStage)) return false;
  if (s.minDeepest !== undefined && current.deepest < s.minDeepest) return false;
  if (s.minCompletedQuests !== undefined && current.completedQuestIds.length < s.minCompletedQuests) return false;
  if (s.minVillageStage !== undefined && current.villageStage < s.minVillageStage) return false;
  if (s.requiresCompendiumHalf && !isCompendiumHalf(current)) return false;
  if (s.requiresCompendiumComplete && !isCompendiumComplete(current)) return false;
  if (
    s.minStoryChapter !== undefined &&
    storyChapter(current.deepest, current.storyCleared) < s.minStoryChapter
  ) {
    return false;
  }
  if (s.requiresStoryCleared && !current.storyCleared) return false;
  if (
    s.requiredMaterialDefIds &&
    !s.requiredMaterialDefIds.every((defId) => current.storage.some((item) => item.defId === defId))
  ) {
    return false;
  }
  return true;
}

function talkSideStoryNpc(
  current: SaveData,
  npcId: VillageNpcId,
  story: SideStoryDef,
): { save: SaveData; message?: string } {
  const stage = bondStage(current.bonds[npcId] ?? 0);
  let resolvedIndex = -1;
  story.stages.forEach((s, i) => {
    if (sideStoryStageMet(current, stage, s)) resolvedIndex = i;
  });
  if (resolvedIndex < 0) return { save: current };

  const eventId = `sideStory:${npcId}:${resolvedIndex}`;
  if (current.seenVillageEvents.includes(eventId)) return { save: current };

  const resolvedStage = story.stages[resolvedIndex]!;
  let next = markVillageEventSeen(current, eventId);
  if (resolvedStage.rewardItemDefId) {
    let storage = [...next.storage];
    for (const defId of resolvedStage.requiredMaterialDefIds ?? []) {
      const idx = storage.findIndex((item) => item.defId === defId);
      if (idx >= 0) storage.splice(idx, 1);
    }
    storage = [...storage, { defId: resolvedStage.rewardItemDefId }];
    next = { ...next, storage };
  }
  if (resolvedStage.rewardCostumeId && !next.unlockedCostumes.includes(resolvedStage.rewardCostumeId)) {
    next = { ...next, unlockedCostumes: [...next.unlockedCostumes, resolvedStage.rewardCostumeId] };
  }
  saveData(next);
  return { save: next, message: resolvedStage.text };
}

function talkToOtama(current: SaveData): { save: SaveData; message?: string } {
  const seenCount = current.seenVillageEvents.filter((id) => id.startsWith("sideStory:otama:")).length;
  if (seenCount >= OTAMA_VISIT_STORY.length) return { save: current };
  const stage = OTAMA_VISIT_STORY[seenCount]!;
  if (stage.requiresStoryChapter3 && storyChapter(current.deepest, current.storyCleared) !== 3) {
    return { save: current };
  }
  const eventId = `sideStory:otama:${seenCount}`;
  const next = markVillageEventSeen(current, eventId);
  saveData(next);
  return { save: next, message: stage.text };
}

const VALID_REGION_IDS = new Set(Array.from({ length: 8 }, (_, i) => `region${i + 1}`));

/** 忘れ物蔵(plan/lost-and-found-vault.md): 既知の地方idだけを残す */
function sanitizeFoundVaultPassages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const found = new Set(value.filter((v): v is string => typeof v === "string" && VALID_REGION_IDS.has(v)));
  return [...found];
}

/** 山の芯(plan/mountain-core.md): 実在する種族idだけを残す。重複しない */
function sanitizeDefeatedRegionBosses(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const found = new Set(value.filter((v): v is string => typeof v === "string" && VALID_SPECIES_IDS.has(v)));
  return [...found];
}

/** 忘れ物蔵(plan/lost-and-found-vault.md): 隠し通路を見つけた記録を追加する。重複しない */
export function addFoundVaultPassage(current: SaveData, regionId: string): SaveData {
  if (!VALID_REGION_IDS.has(regionId) || current.foundVaultPassages.includes(regionId)) return current;
  const next = { ...current, foundVaultPassages: [...current.foundVaultPassages, regionId] };
  saveData(next);
  return next;
}
