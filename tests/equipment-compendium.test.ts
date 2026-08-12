import { describe, expect, it } from "vitest";
import { MAX_PLUS } from "../src/entities/forging";
import {
  checkEquipmentCompendium,
  initialSave,
  isWeaponCompendiumComplete,
  loadSave,
  type SaveData,
  type StoredItem,
} from "../src/save";

function withMockedLocalStorage(run: () => void): void {
  const original = globalThis.localStorage;
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
  };
  try {
    run();
  } finally {
    (globalThis as { localStorage?: unknown }).localStorage = original;
  }
}

describe("save.ts: checkEquipmentCompendium", () => {
  it("倉庫にある武器は、まず「入手済み(owned)」になる", () => {
    withMockedLocalStorage(() => {
      const save: SaveData = { ...initialSave(), storage: [{ defId: "hatchet" }] };
      const next = checkEquipmentCompendium(save);
      expect(next.equipmentCompendium["hatchet"]).toBe("owned");
    });
  });

  it("武器は+9かつ印を刻んで初めて「極めた(mastered)」になる", () => {
    withMockedLocalStorage(() => {
      const notMastered: StoredItem = { defId: "hatchet", plus: MAX_PLUS };
      const save1: SaveData = { ...initialSave(), storage: [notMastered] };
      const next1 = checkEquipmentCompendium(save1);
      expect(next1.equipmentCompendium["hatchet"]).toBe("owned");

      const mastered: StoredItem = { defId: "hatchet", plus: MAX_PLUS, markId: "gajiri" };
      const save2: SaveData = { ...initialSave(), storage: [mastered] };
      const next2 = checkEquipmentCompendium(save2);
      expect(next2.equipmentCompendium["hatchet"]).toBe("mastered");
    });
  });

  it("一度「極めた」になれば、後から+9未満に戻っても取り消されない", () => {
    withMockedLocalStorage(() => {
      let save: SaveData = {
        ...initialSave(),
        storage: [{ defId: "hatchet", plus: MAX_PLUS, markId: "gajiri" }],
      };
      save = checkEquipmentCompendium(save);
      expect(save.equipmentCompendium["hatchet"]).toBe("mastered");

      // 同じ武器を弱い状態で再走査しても、記録は退行しない
      save = { ...save, storage: [{ defId: "hatchet" }] };
      save = checkEquipmentCompendium(save);
      expect(save.equipmentCompendium["hatchet"]).toBe("mastered");
    });
  });

  it("頭防具・装身具は、入手した時点で自動的に「極めた」になる", () => {
    withMockedLocalStorage(() => {
      const save: SaveData = { ...initialSave(), storage: [{ defId: "ironHelm" }] };
      const next = checkEquipmentCompendium(save);
      expect(next.equipmentCompendium["ironHelm"]).toBe("mastered");
    });
  });

  it("素材・印は、持っていたことがあるだけで記録される", () => {
    withMockedLocalStorage(() => {
      const save: SaveData = {
        ...initialSave(),
        storage: [{ defId: "hokoraDust" }, { defId: "hatchet", markId: "madoromi" }],
      };
      const next = checkEquipmentCompendium(save);
      expect(next.materialCompendium["hokoraDust"]).toBe("owned");
      expect(next.markCompendium["madoromi"]).toBe("owned");
    });
  });

  it("extraItems(まだ倉庫に戻っていない持ち込み品)も合わせて走査する", () => {
    withMockedLocalStorage(() => {
      const save = initialSave();
      const next = checkEquipmentCompendium(save, [{ defId: "ironHelm" }]);
      expect(next.equipmentCompendium["ironHelm"]).toBe("mastered");
    });
  });

  it("倉庫にも持ち込み品にも無い装備は記録されない", () => {
    withMockedLocalStorage(() => {
      // "hatchet"は初期所持品(STARTER)に含まれるため、それ以外のdefIdで確認する
      const next = checkEquipmentCompendium(initialSave());
      expect(next.equipmentCompendium["ironHatchet"]).toBeUndefined();
    });
  });
});

describe("save.ts: isWeaponCompendiumComplete", () => {
  it("すべての武器系統が「極めた」まで埋まって初めてtrueになる", () => {
    withMockedLocalStorage(() => {
      let save = initialSave();
      expect(isWeaponCompendiumComplete(save)).toBe(false);
      // hatchetだけ極めても全体は埋まらない
      save = checkEquipmentCompendium(save, [{ defId: "hatchet", plus: MAX_PLUS, markId: "gajiri" }]);
      expect(isWeaponCompendiumComplete(save)).toBe(false);
    });
  });
});

describe("save.ts: 壊れたセーブデータの装備図鑑", () => {
  it("未知のdefId・不正な段階・未知のmarkIdは捨てる", () => {
    withMockedLocalStorage(() => {
      localStorage.setItem(
        "garudo-dungeon/v1",
        JSON.stringify({
          equipmentCompendium: { hatchet: "mastered", みしらぬ装備: "mastered", ironHelm: "こわれた段階" },
          markCompendium: { gajiri: "owned", みしらぬ印: "owned" },
          materialCompendium: { hokoraDust: "owned", みしらぬ素材: "owned" },
        }),
      );
      const loaded = loadSave();
      expect(loaded.equipmentCompendium).toEqual({ hatchet: "mastered" });
      expect(loaded.markCompendium).toEqual({ gajiri: "owned" });
      expect(loaded.materialCompendium).toEqual({ hokoraDust: "owned" });
    });
  });
});
