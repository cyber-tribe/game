import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { DungeonView } from "../src/view/dungeonMesh";
import type { Assets } from "../src/view/assets";
import { makeEmptyFloor } from "./helpers/floor";
import { REGION_DUNGEON_IDS } from "../src/entities/dungeons";
import { TILE_WALL, TILE_ROOM, type FloorState } from "../src/core/types";

/**
 * `instancingSource`/`instantiate`に渡されたモデル名を記録しつつ、要求ごとに
 * 別のマテリアルを返す(`material.name`でどのInstancedMeshがどのモデル名で
 * 作られたか後から見分けられるようにする)。
 */
function fakeAssets(): { assets: Assets; instancingSourceCalls: string[]; instantiateCalls: string[] } {
  const instancingSourceCalls: string[] = [];
  const instantiateCalls: string[] = [];
  const assets = {
    has: () => true,
    instantiate: (name: string) => {
      instantiateCalls.push(name);
      return { root: new THREE.Group(), mixer: null, actions: new Map() };
    },
    instancingSource: (name: string) => {
      instancingSourceCalls.push(name);
      const material = new THREE.MeshBasicMaterial();
      material.name = name;
      return { geometry: new THREE.BoxGeometry(1, 1, 1), material };
    },
    loadInBackground: () => {},
  } as unknown as Assets;
  return { assets, instancingSourceCalls, instantiateCalls };
}

/** 外周ぜんぶを壁、内側を床にした、壁と床が両方たっぷりあるフロア */
function makeRingFloor(depth: number, size = 16): FloorState {
  const floor = makeEmptyFloor({ depth, width: size, height: size });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const onEdge = x === 0 || y === 0 || x === size - 1 || y === size - 1;
      floor.tiles[y * size + x]!.kind = onEdge ? TILE_WALL : TILE_ROOM;
    }
  }
  floor.stairs = { x: 1, y: 1 };
  return floor;
}

function wallMeshesByModel(scene: THREE.Scene): Map<string, THREE.InstancedMesh> {
  const map = new Map<string, THREE.InstancedMesh>();
  scene.traverse((obj) => {
    if (obj instanceof THREE.InstancedMesh) {
      map.set((obj.material as THREE.Material).name, obj);
    }
  });
  return map;
}

describe.each([
  { region: 1, dungeonIndex: 0, prefix: "region1", stairs: "stairs_region1" },
  { region: 2, dungeonIndex: 1, prefix: "region2", stairs: "stairs_region2" },
])("view/dungeonMesh.ts: 第$region地方のタイルセット出し分け", ({ dungeonIndex, prefix, stairs }) => {
  it("壁・床・階段とも専用モデルを使う", () => {
    const scene = new THREE.Scene();
    const { assets, instancingSourceCalls, instantiateCalls } = fakeAssets();
    const view = new DungeonView(scene, assets);
    view.build(makeRingFloor(1), REGION_DUNGEON_IDS[dungeonIndex]!);

    expect(instancingSourceCalls).not.toContain("wall");
    expect(instancingSourceCalls).not.toContain("floor");
    expect(instantiateCalls).toContain(stairs);
    expect(instantiateCalls).not.toContain("stairs");

    // 壁マス・床マスとも十分な数があるので(外周48マス・内側196マス)、
    // 3バリアントのうち複数が実際に使われているはず
    const wallVariants = instancingSourceCalls.filter((n) => n.startsWith(`wall_${prefix}_v`));
    const floorVariants = instancingSourceCalls.filter((n) => n.startsWith(`floor_${prefix}_v`));
    expect(new Set(wallVariants).size).toBeGreaterThan(1);
    expect(new Set(floorVariants).size).toBeGreaterThan(1);
  });

  it("タイルには90度単位のランダム回転がかかる(繰り返し感を消す)", () => {
    const scene = new THREE.Scene();
    const { assets } = fakeAssets();
    const view = new DungeonView(scene, assets);
    view.build(makeRingFloor(1), REGION_DUNGEON_IDS[dungeonIndex]!);

    const meshes = wallMeshesByModel(scene);
    const rotationYs = new Set<number>();
    for (const [name, mesh] of meshes) {
      if (!name.startsWith(`wall_${prefix}_v`) && !name.startsWith(`floor_${prefix}_v`)) continue;
      const matrix = new THREE.Matrix4();
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix);
        matrix.decompose(pos, quat, scale);
        if (scale.x < 0.01) continue; // 未探索で潰されているインスタンスは除く
        const euler = new THREE.Euler().setFromQuaternion(quat, "YXZ");
        rotationYs.add(Math.round((euler.y / (Math.PI / 2)) % 4));
      }
    }
    // 0度だけでなく、複数の90度刻みの向きが実際に使われている
    expect(rotationYs.size).toBeGreaterThan(1);
  });
});

describe("view/dungeonMesh.ts: タイルセット未対応の地方", () => {
  it("地方1・2以外は従来どおり既定の壁・床・階段のまま(回転もかからない)", () => {
    const scene = new THREE.Scene();
    const { assets, instancingSourceCalls, instantiateCalls } = fakeAssets();
    const view = new DungeonView(scene, assets);
    // REGION_DUNGEON_IDS[2] は地方3(regionIndexForFloor(id, 1) === 3、
    // まだREGION_TILESETSにエントリが無い)
    view.build(makeRingFloor(1), REGION_DUNGEON_IDS[2]!);

    expect(instancingSourceCalls).toContain("wall");
    expect(instancingSourceCalls).toContain("floor");
    expect(instancingSourceCalls.some((n) => n.includes("region"))).toBe(false);
    expect(instantiateCalls).toContain("stairs");
    expect(instantiateCalls).not.toContain("stairs_region1");
    expect(instantiateCalls).not.toContain("stairs_region2");

    const meshes = wallMeshesByModel(scene);
    const wallMesh = meshes.get("wall")!;
    const matrix = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    for (let i = 0; i < wallMesh.count; i++) {
      wallMesh.getMatrixAt(i, matrix);
      matrix.decompose(pos, quat, scale);
      if (scale.x < 0.01) continue;
      expect(quat.equals(new THREE.Quaternion())).toBe(true);
    }
  });
});
