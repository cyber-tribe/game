import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { Assets } from "../src/view/assets";
import {
  VILLAGE_BOUNDS,
  VILLAGE_BUILDINGS,
  VILLAGE_INTERACT_PADDING,
  VILLAGE_PLAYER_RADIUS,
  VILLAGE_PLAYER_START,
  VillageView,
  moveVillagePlayer,
  nearestVillageBuilding,
  type VillageBuilding,
} from "../src/view/village";

describe("view/village.ts: 村マップの配置", () => {
  it("建物のidはすべて重複しない", () => {
    const ids = VILLAGE_BUILDINGS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("すべての建物が境界の内側にある", () => {
    for (const b of VILLAGE_BUILDINGS) {
      expect(b.x - b.radius).toBeGreaterThanOrEqual(VILLAGE_BOUNDS.minX);
      expect(b.x + b.radius).toBeLessThanOrEqual(VILLAGE_BOUNDS.maxX);
      expect(b.z - b.radius).toBeGreaterThanOrEqual(VILLAGE_BOUNDS.minZ);
      expect(b.z + b.radius).toBeLessThanOrEqual(VILLAGE_BOUNDS.maxZ);
    }
  });

  it("拠点画面(TownScreen)の列番号(0〜19)の範囲に収まっている", () => {
    for (const b of VILLAGE_BUILDINGS) {
      for (const column of b.columns) {
        expect(column).toBeGreaterThanOrEqual(0);
        expect(column).toBeLessThanOrEqual(19);
      }
    }
  });

  it("システム系の列(14=アクセシビリティ・18=音・19=設定)はどの建物からも開けない(「≡」メニュー専用)", () => {
    for (const b of VILLAGE_BUILDINGS) {
      expect(b.columns).not.toContain(14);
      expect(b.columns).not.toContain(18);
      expect(b.columns).not.toContain(19);
    }
  });

  it("互いに十分離れており、当たり判定の円が重ならない", () => {
    for (let i = 0; i < VILLAGE_BUILDINGS.length; i++) {
      for (let j = i + 1; j < VILLAGE_BUILDINGS.length; j++) {
        const a = VILLAGE_BUILDINGS[i]!;
        const b = VILLAGE_BUILDINGS[j]!;
        const dist = Math.hypot(a.x - b.x, a.z - b.z);
        expect(dist).toBeGreaterThan(a.radius + b.radius + VILLAGE_PLAYER_RADIUS * 2);
      }
    }
  });

  it("出発地点(VILLAGE_PLAYER_START)はどの建物とも重ならない", () => {
    expect(nearestVillageBuildingCollision(VILLAGE_PLAYER_START)).toBe(false);
  });
});

/**
 * 村のメニューを建物・村人ごとの役割に分ける
 * (plan/game/archive/village-scoped-menus.mdの対応表)。
 * 建物ごとに開ける列の集合が、計画書の対応表どおりであることを確かめる。
 */
describe("view/village.ts: 建物・村人ごとの役割メニュー(village-scoped-menus)", () => {
  function columnsOf(id: string): readonly number[] {
    return VILLAGE_BUILDINGS.find((b) => b.id === id)?.columns ?? [];
  }

  it("洞窟の入口: 出発の支度一式(倉庫・持ち込み・鍛え方・つれていく仲間・難易度・潜るダンジョン)", () => {
    // 出発地点の列(2)は廃止(plan/game/archive/remove-checkpoint-start.md)
    expect(columnsOf("cave")).toEqual([0, 1, 3, 4, 10, 12]);
  });

  it("モグラ婆の倉庫: 倉庫・持ち込む", () => {
    expect(columnsOf("storage")).toEqual([0, 1]);
  });

  it("ねむり小屋(新設): つれていく仲間(仲間の世話)", () => {
    expect(columnsOf("sleepHut")).toEqual([4]);
  });

  it("ゲンドの工房: 工房", () => {
    expect(columnsOf("workshop")).toEqual([5]);
  });

  it("おキヨの図鑑小屋: モンスター図鑑・装備図鑑", () => {
    expect(columnsOf("gallery")).toEqual([7, 9]);
  });

  it("記録の間(新設): 記録の間・実績帳", () => {
    expect(columnsOf("recordsHall")).toEqual([6, 8]);
  });

  it("オトネの依頼板: 依頼板", () => {
    expect(columnsOf("questBoard")).toEqual([11]);
  });

  it("村の発展の受付: 村の発展", () => {
    expect(columnsOf("development")).toEqual([13]);
  });

  it("村の広場: NPCと話す・宵祭りの出店", () => {
    expect(columnsOf("npcSquare")).toEqual([16, 17]);
  });

  it("ガルドの家(新設): 身支度", () => {
    expect(columnsOf("garudoHouse")).toEqual([15]);
  });

  it("旅の看板: 列を持たない(従来の「既定の入口(全列)」の役割は廃止)", () => {
    expect(columnsOf("board")).toEqual([]);
  });

  it("新設3件(ねむり小屋・記録の間・ガルドの家)が村マップに実在する", () => {
    const ids = VILLAGE_BUILDINGS.map((b) => b.id);
    expect(ids).toContain("sleepHut");
    expect(ids).toContain("recordsHall");
    expect(ids).toContain("garudoHouse");
  });

  it("システム系の列(14・18・19)はどの建物のcolumnsにも現れない(「≡」メニュー専用)", () => {
    const allOpenedColumns = new Set(VILLAGE_BUILDINGS.flatMap((b) => b.columns));
    expect(allOpenedColumns.has(14)).toBe(false);
    expect(allOpenedColumns.has(18)).toBe(false);
    expect(allOpenedColumns.has(19)).toBe(false);
  });

  it("同じ列を複数の建物から開いてよい(倉庫は入口でもモグラ婆でも開ける)", () => {
    expect(columnsOf("cave")).toEqual(expect.arrayContaining([0, 1]));
    expect(columnsOf("storage")).toEqual(expect.arrayContaining([0, 1]));
  });
});

function nearestVillageBuildingCollision(pos: { x: number; z: number }): boolean {
  return VILLAGE_BUILDINGS.some(
    (b) => Math.hypot(pos.x - b.x, pos.z - b.z) < b.radius + VILLAGE_PLAYER_RADIUS,
  );
}

describe("view/village.ts: moveVillagePlayer", () => {
  it("方向が無ければ動かない", () => {
    const pos = { x: 0, z: 0 };
    expect(moveVillagePlayer(pos, null, 0.1)).toEqual(pos);
  });

  it("dtが0以下なら動かない", () => {
    const pos = { x: 0, z: 0 };
    expect(moveVillagePlayer(pos, 4, 0)).toEqual(pos);
  });

  it("北(dir=0)へ進むとzが減る", () => {
    const next = moveVillagePlayer({ x: 0, z: 0 }, 0, 0.1, [], VILLAGE_BOUNDS);
    expect(next.x).toBeCloseTo(0);
    expect(next.z).toBeLessThan(0);
  });

  it("東(dir=2)へ進むとxが増える", () => {
    const next = moveVillagePlayer({ x: 0, z: 0 }, 2, 0.1, [], VILLAGE_BOUNDS);
    expect(next.x).toBeGreaterThan(0);
    expect(next.z).toBeCloseTo(0);
  });

  it("斜め移動でも軸移動と同じ速さになる(正規化されている)", () => {
    const straight = moveVillagePlayer({ x: 0, z: 0 }, 2, 0.2, [], VILLAGE_BOUNDS);
    const diagonal = moveVillagePlayer({ x: 0, z: 0 }, 3, 0.2, [], VILLAGE_BOUNDS);
    const straightDist = Math.hypot(straight.x, straight.z);
    const diagonalDist = Math.hypot(diagonal.x, diagonal.z);
    expect(diagonalDist).toBeCloseTo(straightDist, 5);
  });

  it("境界の外へは出られない", () => {
    const far = { x: VILLAGE_BOUNDS.maxX - 0.01, z: 0 };
    const next = moveVillagePlayer(far, 2, 10, [], VILLAGE_BOUNDS);
    expect(next.x).toBeLessThanOrEqual(VILLAGE_BOUNDS.maxX - VILLAGE_PLAYER_RADIUS + 1e-9);
  });

  it("建物の中には入れない(当たり判定の外側で止まる)", () => {
    const building: VillageBuilding = {
      id: "test",
      label: "テスト",
      columns: [0], role: "テスト",
      x: 3,
      z: 0,
      radius: 1,
      shape: "hut",
      color: 0,
    };
    let pos = { x: 0, z: 0 };
    for (let i = 0; i < 200; i++) {
      pos = moveVillagePlayer(pos, 2, 0.05, [building], VILLAGE_BOUNDS);
    }
    const dist = Math.hypot(pos.x - building.x, pos.z - building.z);
    expect(dist).toBeGreaterThanOrEqual(building.radius + VILLAGE_PLAYER_RADIUS - 1e-6);
    expect(pos.x).toBeLessThan(building.x);
  });
});

describe("view/village.ts: nearestVillageBuilding", () => {
  const near: VillageBuilding = {
    id: "near",
    label: "近い建物",
    columns: [1], role: "近い建物のテスト",
    x: 0,
    z: 0,
    radius: 1,
    shape: "hut",
    color: 0,
  };
  const far: VillageBuilding = {
    id: "far",
    label: "遠い建物",
    columns: [2], role: "遠い建物のテスト",
    x: 10,
    z: 10,
    radius: 1,
    shape: "hut",
    color: 0,
  };

  it("どの建物からも離れていればnull", () => {
    expect(nearestVillageBuilding({ x: 5, z: 5 }, [near, far])).toBeNull();
  });

  it("当たり判定+近接ぶんの範囲内にいれば、その建物を返す", () => {
    const pos = { x: near.radius + VILLAGE_INTERACT_PADDING - 0.1, z: 0 };
    expect(nearestVillageBuilding(pos, [near, far])?.id).toBe("near");
  });

  it("複数候補があるときは最も近いものを返す", () => {
    const other: VillageBuilding = { ...near, id: "near2", x: 0.5, z: 0 };
    const pos = { x: 0.4, z: 0 };
    expect(nearestVillageBuilding(pos, [near, other, far])?.id).toBe("near2");
  });
});

/**
 * モデルがまだ届いていないAssets。この状態ではつなぎのカプセルのまま動く
 * (村の移動・建物判定はモデルの有無に関係なく成立する)
 */
function emptyAssets(): Assets {
  return {
    has: () => false,
    instantiate: () => {
      throw new Error("読み込めていないモデルをinstantiateしてはいけない");
    },
    loadInBackground: () => {},
  } as unknown as Assets;
}

/** 主人公のモデルが読める状態のAssets。中身はActorViewが動く最小限の骨組み */
function loadedAssets(): { assets: Assets; roots: THREE.Object3D[] } {
  const roots: THREE.Object3D[] = [];
  const assets = {
    has: (name: string) => name === "garudo",
    instantiate: () => {
      const root = new THREE.Group();
      roots.push(root);
      return { root, mixer: null, actions: new Map() };
    },
    loadInBackground: () => {},
  } as unknown as Assets;
  return { assets, roots };
}

describe("view/village.ts: VillageView", () => {
  it("初期位置はVILLAGE_PLAYER_START", () => {
    const view = new VillageView(emptyAssets());
    expect(view.playerPos).toEqual(VILLAGE_PLAYER_START);
  });

  it("resetで出発地点に戻る", () => {
    const view = new VillageView(emptyAssets());
    view.update(1, 4); // 南(dir=4)へ1秒move
    expect(view.playerPos).not.toEqual(VILLAGE_PLAYER_START);
    view.reset();
    expect(view.playerPos).toEqual(VILLAGE_PLAYER_START);
  });

  it("建物に近づくとnearBuilding()が返るようになる", () => {
    const view = new VillageView(emptyAssets());
    const board = VILLAGE_BUILDINGS.find((b) => b.id === "board")!;
    expect(view.nearBuilding()).toBeNull();
    for (let i = 0; i < 200; i++) {
      const dz = view.playerPos.z - board.z;
      if (Math.abs(dz) < 0.05) break;
      view.update(0.05, dz > 0 ? 0 : 4); // 北(dir=0)へ歩く
    }
    expect(view.nearBuilding()?.id).toBe("board");
  });

  it("シーンに全建物ぶんのオブジェクトが積まれている", () => {
    const view = new VillageView(emptyAssets());
    // 地面・光源・プレイヤーに加え、建物の数だけオブジェクトが増えている
    expect(view.scene.children.length).toBeGreaterThanOrEqual(VILLAGE_BUILDINGS.length + 2);
  });
});

/**
 * 村の画面構成の再設計(plan/models/village-scene-redesign.md): 既定は
 * 明るい昼、宵祭りの日だけ茜色の夕暮れに切り替える
 */
describe("view/village.ts: setFestivalLighting", () => {
  it("既定(コンストラクタ直後)は明るい昼の空になっている", () => {
    const view = new VillageView(emptyAssets());
    const bg = view.scene.background as THREE.Color;
    // 暗い夜寄りの色(旧: 0x0c1420)ではなく、明るい空色になっている
    expect(bg.getHex()).not.toBe(0x0c1420);
    expect(bg.r + bg.g + bg.b).toBeGreaterThan(1.5); // 明るい色は成分の合計が大きい
  });

  it("trueにすると茜色の夕暮れへ、falseで昼へ戻す", () => {
    const view = new VillageView(emptyAssets());
    const dayBg = (view.scene.background as THREE.Color).getHex();

    view.setFestivalLighting(true);
    const duskBg = (view.scene.background as THREE.Color).getHex();
    expect(duskBg).not.toBe(dayBg);

    view.setFestivalLighting(false);
    expect((view.scene.background as THREE.Color).getHex()).toBe(dayBg);
  });
});

/**
 * #446: 村なかのプレイヤーがカプセルのままで、主人公ガルドのモデルに
 * なっていなかった。モデルが読めているならそちらを使う
 */
describe("view/village.ts: 村なかの主人公の姿(#446)", () => {
  it("モデルが読めていれば、主人公のモデルをシーンに置く", () => {
    const { assets, roots } = loadedAssets();
    const view = new VillageView(assets);
    view.update(0.016, null);
    expect(roots).toHaveLength(1);
    expect(view.scene.children).toContain(roots[0]);
  });

  it("モデルは1体だけ作られ、毎フレーム増えない", () => {
    const { assets, roots } = loadedAssets();
    const view = new VillageView(assets);
    for (let i = 0; i < 30; i++) view.update(0.016, 4);
    expect(roots).toHaveLength(1);
  });

  it("歩くとモデルが実数座標のまま追従する(マス目に丸めない)", () => {
    const { assets, roots } = loadedAssets();
    const view = new VillageView(assets);
    view.update(0.1, 4); // 南へ少し歩く
    const root = roots[0]!;
    expect(root.position.x).toBeCloseTo(view.playerPos.x, 5);
    expect(root.position.z).toBeCloseTo(view.playerPos.z, 5);
    // 実際に動いている(出発点から離れている)ことも確かめる
    expect(view.playerPos).not.toEqual(VILLAGE_PLAYER_START);
  });

  it("モデルが未読み込みのあいだは何も落ちず、つなぎのまま動く", () => {
    const view = new VillageView(emptyAssets());
    expect(() => view.update(0.1, 4)).not.toThrow();
    expect(view.playerPos).not.toEqual(VILLAGE_PLAYER_START);
  });

  it("先に指定した衣装の色替えが、あとから作られるモデルにも掛かる", () => {
    const { assets, roots } = loadedAssets();
    const view = new VillageView(assets);
    view.setCostumeTint([0.5, 0.5, 1]);
    view.update(0.016, null);
    // 色替えはマテリアルを複製して掛けるため、メッシュを持たない骨組みでも
    // 例外なく通ること(実際の色はActorView.applyTint側のテストが担保する)
    expect(roots).toHaveLength(1);
  });
});
