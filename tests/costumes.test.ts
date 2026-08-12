import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { COSTUMES, DEFAULT_COSTUME_ID, costumeById } from "../src/entities/costumes";
import { SPECIES } from "../src/entities/species";
import { ActorView } from "../src/view/actorView";
import {
  equipCostume,
  initialSave,
  isCompendiumComplete,
  loadSave,
  refreshUnlockedCostumes,
  type SaveData,
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

describe("entities/costumes.ts", () => {
  it("既定の衣装は最初から解放されている想定(unlock: always)", () => {
    const def = costumeById(DEFAULT_COSTUME_ID);
    expect(def.unlock).toBe("always");
  });

  it("未知のidはdefaultを返す", () => {
    expect(costumeById("みしらぬころも").id).toBe(DEFAULT_COSTUME_ID);
  });

  it("既定以外の衣装はすべてtintを持つ(色替えで表現するため)", () => {
    for (const c of COSTUMES) {
      if (c.id === DEFAULT_COSTUME_ID) continue;
      expect(c.tint).toBeDefined();
    }
  });
});

describe("save.ts: refreshUnlockedCostumes", () => {
  it("図鑑コンプリートで「おキヨお手製のはっぴ」が解放される", () => {
    let save = initialSave();
    const complete: Record<string, "captured"> = {};
    for (const s of SPECIES) complete[s.id] = "captured";
    save = { ...save, compendium: complete };
    expect(isCompendiumComplete(save)).toBe(true);
    save = refreshUnlockedCostumes(save);
    expect(save.unlockedCostumes).toContain("okiyoHappi");
  });

  it("村の発展段階4で「山を静めた者の羽織」が解放される", () => {
    let save = initialSave();
    save = { ...save, villageStage: 4 };
    save = refreshUnlockedCostumes(save);
    expect(save.unlockedCostumes).toContain("quietMountainHaori");
  });

  it("夜ごとの夢の自己ベストで「最古の夢へ寄り添う衣」が解放される", () => {
    let save = initialSave();
    save = { ...save, nightlyDreamBestDepth: 20 };
    save = refreshUnlockedCostumes(save);
    expect(save.unlockedCostumes).toContain("ancientDreamRobe");
  });

  it("条件を満たさなければ何も増えない(同じ参照を返す)", () => {
    const save = initialSave();
    expect(refreshUnlockedCostumes(save)).toBe(save);
  });

  it("一度解放した記録はロストしない(条件を再確認しても減らない)", () => {
    let save = initialSave();
    save = { ...save, villageStage: 4 };
    save = refreshUnlockedCostumes(save);
    save = { ...save, villageStage: 1 };
    save = refreshUnlockedCostumes(save);
    expect(save.unlockedCostumes).toContain("quietMountainHaori");
  });
});

describe("save.ts: equipCostume", () => {
  it("解放済みの衣装は装備できる", () => {
    let save: SaveData = { ...initialSave(), unlockedCostumes: [DEFAULT_COSTUME_ID, "okiyoHappi"] };
    save = equipCostume(save, "okiyoHappi");
    expect(save.equippedCostume).toBe("okiyoHappi");
  });

  it("未解放の衣装は装備できない(何も変わらない)", () => {
    const save = initialSave();
    expect(equipCostume(save, "okiyoHappi")).toBe(save);
  });
});

describe("save.ts: 壊れたセーブデータのcostumes", () => {
  it("欠けていても既定値に初期化される", () => {
    withMockedLocalStorage(() => {
      localStorage.setItem("garudo-dungeon/v1/slot0", JSON.stringify({}));
      const loaded = loadSave();
      expect(loaded.unlockedCostumes).toEqual([DEFAULT_COSTUME_ID]);
      expect(loaded.equippedCostume).toBe(DEFAULT_COSTUME_ID);
    });
  });

  it("未知の衣装idは取り除かれ、装備中が未解放を指していればdefaultに戻る", () => {
    withMockedLocalStorage(() => {
      localStorage.setItem(
        "garudo-dungeon/v1/slot0",
        JSON.stringify({ unlockedCostumes: ["みしらぬころも", "okiyoHappi"], equippedCostume: "みしらぬころも" }),
      );
      const loaded = loadSave();
      expect(loaded.unlockedCostumes.sort()).toEqual(["default", "okiyoHappi"].sort());
      expect(loaded.equippedCostume).toBe(DEFAULT_COSTUME_ID);
    });
  });
});

describe("view/actorView.ts: applyTint(衣装の色替え)", () => {
  it("メッシュのマテリアル色にRGB倍率を掛ける", () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(1, 1, 1) }),
    );
    const root = new THREE.Group();
    root.add(mesh);
    const view = new ActorView({ root, mixer: null, actions: new Map() }, { x: 0, y: 0 });
    view.applyTint([0.5, 0.6, 0.7]);

    const material = mesh.material as THREE.MeshStandardMaterial;
    expect(material.color.r).toBeCloseTo(0.5);
    expect(material.color.g).toBeCloseTo(0.6);
    expect(material.color.b).toBeCloseTo(0.7);
  });
});
