import { describe, expect, it } from "vitest";
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
      expect(b.column).toBeGreaterThanOrEqual(0);
      expect(b.column).toBeLessThanOrEqual(19);
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
      column: 0,
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
    column: 1,
    x: 0,
    z: 0,
    radius: 1,
    shape: "hut",
    color: 0,
  };
  const far: VillageBuilding = {
    id: "far",
    label: "遠い建物",
    column: 2,
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

describe("view/village.ts: VillageView", () => {
  it("初期位置はVILLAGE_PLAYER_START", () => {
    const view = new VillageView();
    expect(view.playerPos).toEqual(VILLAGE_PLAYER_START);
  });

  it("resetで出発地点に戻る", () => {
    const view = new VillageView();
    view.update(1, 4); // 南(dir=4)へ1秒move
    expect(view.playerPos).not.toEqual(VILLAGE_PLAYER_START);
    view.reset();
    expect(view.playerPos).toEqual(VILLAGE_PLAYER_START);
  });

  it("建物に近づくとnearBuilding()が返るようになる", () => {
    const view = new VillageView();
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
    const view = new VillageView();
    // 地面・光源・プレイヤーに加え、建物の数だけオブジェクトが増えている
    expect(view.scene.children.length).toBeGreaterThanOrEqual(VILLAGE_BUILDINGS.length + 2);
  });
});
