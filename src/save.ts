import { TUTORIAL_TIP_IDS, type TutorialTipId } from "./core/tutorial";
import type { Item } from "./core/types";
import type { TrainingFocus } from "./entities/player";
import type { RunSnapshot, RunStatus } from "./game";
import { ITEMS } from "./items/catalog";

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
  result: { depth: number; level: number; cleared: boolean; broughtBack: Item[] },
): SaveData {
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
  };
  saveData(next);
  return next;
}

export function toStored(item: Item): StoredItem {
  return item.charges === undefined
    ? { defId: item.defId }
    : { defId: item.defId, charges: item.charges };
}

function sanitizeStorage(value: unknown): StoredItem[] {
  if (!Array.isArray(value)) return initialSave().storage;
  const out: StoredItem[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const defId = (entry as StoredItem).defId;
    if (typeof defId !== "string" || !VALID_IDS.has(defId)) continue;
    const charges = (entry as StoredItem).charges;
    out.push(typeof charges === "number" ? { defId, charges } : { defId });
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
