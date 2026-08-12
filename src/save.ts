import { TUTORIAL_TIP_IDS, type TutorialTipId } from "./core/tutorial";
import type { Actor, Item, MarkId, SkillId } from "./core/types";
import { ACHIEVEMENTS, achievementDef } from "./entities/achievements";
import { DIFFICULTY_MODES, type DifficultyMode } from "./entities/difficulty";
import { MARKS, MAX_PLUS } from "./entities/forging";
import { MAX_ACTIVE_QUESTS, QUESTS, questDef, questsForDate } from "./entities/quests";
import type { TrainingFocus } from "./entities/player";
import { MAX_SKILLS, NATIVE_SKILL_BY_SPECIES, SKILLS, fullSkillSet } from "./entities/skills";
import { SPECIES } from "./entities/species";
import type { StoredMonster } from "./entities/storedMonster";
import type { RunSnapshot, RunStatus } from "./game";
import { ITEMS } from "./items/catalog";

export type { StoredMonster };

const KEY = "garudo-dungeon/v1";
/**
 * ダイブ中オートセーブ(plan/mid-dive-autosave.md)。拠点の SaveData とは
 * 別キーに、セーブ枠に紐づく形で1つだけ持つ想定だが、セーブ枠そのもの
 * (design/ui-flow.md)が未実装のため、現状は単一キーで近似している。
 */
const SNAPSHOT_KEY = "garudo-dungeon/v1/run-snapshot";

/** 倉庫に預けてあるアイテム。uid は挑戦ごとに振り直すので保存しない */
export interface StoredItem {
  defId: string;
  charges?: number;
  /** 強化値(+n)。武器・盾のみ。plan/equipment-forging.md 参照 */
  plus?: number;
  /** 刻んだ印。武器・盾のみ */
  markId?: MarkId;
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
}

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
  };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
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
    };
  } catch {
    // 壊れた保存データで起動できなくなるほうが困るので、黙って初期値に戻す
    return initialSave();
  }
}

export function saveData(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // 保存できなくても遊べはするので、失敗は握りつぶす
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
  },
): SaveData {
  let nextHutUid = current.nextHutUid;
  const newlyStored: StoredMonster[] = (result.broughtBackAllies ?? []).map((actor) => {
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
  saveData(withAchievements);
  return withAchievements;
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
  return {
    ...current,
    gold,
    storage,
    activeQuests: remaining,
    completedQuestIds: [...current.completedQuestIds, ...completed],
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

  // 種族由来(native)の特技は暗黙で持つため、比較・上限判定は完全な特技一式で行う。
  // 実際に保存するのは夢あわせで追加した分だけ
  const axisFull = fullSkillSet(axis.speciesId, axis.skills);
  const foodFull = fullSkillSet(food.speciesId, food.skills);
  const inheritable = foodFull.find((s) => !axisFull.includes(s));
  const skills =
    inheritable && axisFull.length < MAX_SKILLS ? [...axis.skills, inheritable] : [...axis.skills];

  const result: StoredMonster = {
    ...axis,
    level: axis.level + Math.floor(food.level / 2) + 1,
    skills,
  };

  const hut = current.hut
    .filter((m) => m.uid !== foodUid)
    .map((m) => (m.uid === axisUid ? result : m));
  // 図鑑(plan/monster-compendium.md): 夢あわせの糧にした種族も「捕まえた」扱いにする
  const compendium: Record<string, CompendiumStatus> = {
    ...current.compendium,
    [axis.speciesId]: "captured",
    [food.speciesId]: "captured",
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
  if (item.markId !== undefined) stored.markId = item.markId;
  return stored;
}

/** 倉庫のStoredItemを、ダイブに持ち込むItemへ戻す(uidはダイブごとに振り直す) */
export function fromStored(stored: StoredItem, uid: number): Item {
  const item: Item = { uid, defId: stored.defId };
  if (stored.charges !== undefined) item.charges = stored.charges;
  if (stored.plus !== undefined) item.plus = stored.plus;
  if (stored.markId !== undefined) item.markId = stored.markId;
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
    const markId = (entry as StoredItem).markId;
    if (typeof markId === "string" && VALID_MARK_IDS.has(markId as MarkId)) {
      stored.markId = markId as MarkId;
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

/** 全種族を「捕まえた」まで埋めているか(かがやきの夢のかけらの出現率upの条件) */
export function isCompendiumComplete(current: SaveData): boolean {
  return SPECIES.every((s) => current.compendium[s.id] === "captured");
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
  const forgedMarkIds = new Set(items.map((i) => i.markId).filter((m): m is MarkId => m !== undefined));
  if (MARKS.every((m) => forgedMarkIds.has(m.id))) next = unlockAchievement(next, "allMarksForged");

  // 装備図鑑(plan/equipment-compendium.md): 武器図鑑コンプリートの称号
  if (isWeaponCompendiumComplete(next)) next = unlockAchievement(next, "weaponCompendiumComplete");

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
      const mastered = !isWeapon || ((item.plus ?? 0) >= MAX_PLUS && item.markId !== undefined);
      equipmentCompendium[item.defId] = mastered ? "mastered" : "owned";
    }
    if (VALID_MATERIAL_DEF_IDS.has(item.defId)) materialCompendium[item.defId] = "owned";
    if (item.markId !== undefined) markCompendium[item.markId] = "owned";
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
    out.push({
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
    });
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
export function saveRunSnapshot(snapshot: RunSnapshot): void {
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // オートセーブが書き込めなくても遊べはするので、失敗は握りつぶす
  }
}

/**
 * 残っているスナップショットを読む。壊れている・形が合わない場合は
 * 復帰できるものが無かったものとして null を返す(1回限りの保証なので、
 * 中途半端な状態を無理に復元するより諦めた方が安全)。
 */
export function loadRunSnapshot(): RunSnapshot | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RunSnapshot>;
    return isValidSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** 復帰した瞬間、または通常の終了(全滅・踏破・区切り)で消費する */
export function clearRunSnapshot(): void {
  try {
    localStorage.removeItem(SNAPSHOT_KEY);
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
