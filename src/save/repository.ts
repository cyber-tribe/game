import type { RunSnapshot, SaveData, SaveSlotSummary } from "./types";

/**
 * セーブの読み書きを抽象化する境界(plan/game/ddd-phase7-save-boundary.md)。
 * localStorageへの直接アクセスは`LocalStorageSaveRepository`(localStorage.ts)に
 * 隔離し、テストからはインメモリ実装に差し替えられるようにする。
 */
export interface SaveRepository {
  load(slot?: number): SaveData;
  save(data: SaveData, slot?: number): void;
  delete(slot: number): void;
  listSummaries(): SaveSlotSummary[];
  setActiveSlot(slot: number): void;
  loadRunSnapshot(slot?: number): RunSnapshot | null;
  /** snapshotにnullを渡すと、そのスロットのオートセーブを消す(clearRunSnapshotと同じ) */
  saveRunSnapshot(snapshot: RunSnapshot | null, slot?: number): void;
}
