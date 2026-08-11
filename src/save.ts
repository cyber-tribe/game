import { TUTORIAL_TIP_IDS, type TutorialTipId } from "./core/tutorial";
import type { Item } from "./core/types";
import { ITEMS } from "./items/catalog";

const KEY = "garudo-dungeon/v1";

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
