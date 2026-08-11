import { TUTORIAL_TIP_IDS, type TutorialTipId } from "./core/tutorial";
import type { Actor, Item, MarkId, SkillId } from "./core/types";
import { MARKS, MAX_PLUS } from "./entities/forging";
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
  };
  saveData(next);
  return next;
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
  const next: SaveData = { ...current, hut };
  saveData(next);
  return { save: next, result };
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
