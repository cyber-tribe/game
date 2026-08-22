import { afterEach, describe, expect, it } from "vitest";
import { Game } from "../src/application/dungeonRun/game";
import {
  SAVE_SLOT_COUNT,
  clearRunSnapshot,
  deleteSaveSlot,
  initialSave,
  listSaveSlotSummaries,
  loadRunSnapshot,
  loadSave,
  migrateLegacySaveIfNeeded,
  saveData,
  saveRunSnapshot,
  setActiveSlot,
  type SaveData,
} from "../src/save";
import { withMockedLocalStorage } from "./helpers/localStorage";

function sampleSnapshot() {
  return new Game({ seed: 1, maxDepth: 10 }).toSnapshot();
}

describe("save.ts: セーブ枠(plan/save-slots.md)", () => {
  afterEach(() => {
    // 他のテストへ影響しないよう、アクティブ枠を毎回既定に戻す
    setActiveSlot(0);
  });

  it("スロットごとに別のキーへ保存・読込される", () => {
    withMockedLocalStorage(() => {
      const slot0: SaveData = { ...initialSave(), deepest: 3 };
      const slot1: SaveData = { ...initialSave(), deepest: 9 };
      saveData(slot0, 0);
      saveData(slot1, 1);

      expect(loadSave(0).deepest).toBe(3);
      expect(loadSave(1).deepest).toBe(9);
      // 触っていない残り枠は初期値のまま
      expect(loadSave(2).deepest).toBe(0);
    });
  });

  it("setActiveSlotで切り替えた枠が、以後の省略呼び出しの既定値になる", () => {
    withMockedLocalStorage(() => {
      setActiveSlot(1);
      saveData({ ...initialSave(), deepest: 5 });
      expect(loadSave(1).deepest).toBe(5);
      expect(loadSave(0).deepest).toBe(0);

      setActiveSlot(0);
      expect(loadSave().deepest).toBe(0);
    });
  });

  it("saveDataのたびにlastPlayedAtが現在時刻で更新される", () => {
    withMockedLocalStorage(() => {
      const before = new Date(0).toISOString();
      saveData({ ...initialSave(), lastPlayedAt: before }, 0);
      const loaded = loadSave(0);
      expect(loaded.lastPlayedAt).not.toBe(before);
      expect(new Date(loaded.lastPlayedAt).getTime()).toBeGreaterThan(0);
    });
  });

  it("ダイブ中スナップショットもスロットごとに独立している", () => {
    withMockedLocalStorage(() => {
      saveRunSnapshot(sampleSnapshot(), 0);
      expect(loadRunSnapshot(0)).not.toBeNull();
      expect(loadRunSnapshot(1)).toBeNull();

      clearRunSnapshot(0);
      expect(loadRunSnapshot(0)).toBeNull();
    });
  });

  it("listSaveSlotSummariesはSAVE_SLOT_COUNT件、未使用枠はexists:falseで返す", () => {
    withMockedLocalStorage(() => {
      saveData({ ...initialSave(), deepest: 12, villageStage: 3 }, 1);

      const summaries = listSaveSlotSummaries();
      expect(summaries).toHaveLength(SAVE_SLOT_COUNT);
      expect(summaries[0]).toMatchObject({ slot: 0, exists: false, deepest: 0 });
      expect(summaries[1]).toMatchObject({ slot: 1, exists: true, deepest: 12, villageStage: 3 });
      expect(summaries[1]!.lastPlayedAt).toBeDefined();
      expect(summaries[2]).toMatchObject({ slot: 2, exists: false });
    });
  });

  it("deleteSaveSlotは対象枠の本編セーブ・スナップショットだけを消す", () => {
    withMockedLocalStorage(() => {
      saveData({ ...initialSave(), deepest: 7 }, 0);
      saveData({ ...initialSave(), deepest: 8 }, 1);
      saveRunSnapshot(sampleSnapshot(), 0);

      deleteSaveSlot(0);

      expect(listSaveSlotSummaries()[0]).toMatchObject({ exists: false });
      expect(loadRunSnapshot(0)).toBeNull();
      // 他の枠は無事
      expect(loadSave(1).deepest).toBe(8);
    });
  });

  it("migrateLegacySaveIfNeeded: 旧キーが残っていればslot0へ1回だけコピーし、旧キーを消す", () => {
    withMockedLocalStorage((store) => {
      store.set("garudo-dungeon/v1", JSON.stringify({ ...initialSave(), deepest: 21 }));
      // packSnapshot()は非公開なので、いったん別枠へ書いてパック済みJSONを取り出し、旧キーへ移す
      saveRunSnapshot(sampleSnapshot(), 99);
      store.set("garudo-dungeon/v1/run-snapshot", store.get("garudo-dungeon/v1/slot99/run-snapshot")!);
      store.delete("garudo-dungeon/v1/slot99/run-snapshot");

      migrateLegacySaveIfNeeded();

      expect(store.has("garudo-dungeon/v1")).toBe(false);
      expect(store.has("garudo-dungeon/v1/run-snapshot")).toBe(false);
      expect(loadSave(0).deepest).toBe(21);
      expect(loadRunSnapshot(0)).not.toBeNull();
    });
  });

  it("migrateLegacySaveIfNeeded: slot0に既にデータがあれば、旧キーは上書きしない", () => {
    withMockedLocalStorage((store) => {
      saveData({ ...initialSave(), deepest: 99 }, 0);
      store.set("garudo-dungeon/v1", JSON.stringify({ ...initialSave(), deepest: 1 }));

      migrateLegacySaveIfNeeded();

      // slot0は上書きされない。旧キーもそのまま残る(移行条件を満たさないため)
      expect(loadSave(0).deepest).toBe(99);
      expect(store.has("garudo-dungeon/v1")).toBe(true);
    });
  });

  it("migrateLegacySaveIfNeeded: 旧キーが無ければ何もしない", () => {
    withMockedLocalStorage(() => {
      migrateLegacySaveIfNeeded();
      expect(loadSave(0).deepest).toBe(0);
    });
  });
});
