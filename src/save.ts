const KEY = "garudo-dungeon/v1";

export interface SaveData {
  /** これまでに到達した最も深い階 */
  deepest: number;
  /** 挑戦した回数 */
  runs: number;
  /** 踏破した回数 */
  clears: number;
  /** 最高到達レベル */
  bestLevel: number;
}

const EMPTY: SaveData = { deepest: 0, runs: 0, clears: 0, bestLevel: 1 };

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return {
      deepest: numberOr(parsed.deepest, 0),
      runs: numberOr(parsed.runs, 0),
      clears: numberOr(parsed.clears, 0),
      bestLevel: numberOr(parsed.bestLevel, 1),
    };
  } catch {
    // 壊れた保存データで起動できなくなるほうが困るので、黙って初期値に戻す
    return { ...EMPTY };
  }
}

export function saveData(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // 保存できなくても遊べはするので、失敗は握りつぶす
  }
}

export function recordRun(
  current: SaveData,
  result: { depth: number; level: number; cleared: boolean },
): SaveData {
  const next: SaveData = {
    deepest: Math.max(current.deepest, result.depth),
    runs: current.runs + 1,
    clears: current.clears + (result.cleared ? 1 : 0),
    bestLevel: Math.max(current.bestLevel, result.level),
  };
  saveData(next);
  return next;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
