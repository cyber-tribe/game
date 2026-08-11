import * as THREE from "three";
import { TILE, toWorld } from "./renderer";
import type { Assets } from "./assets";
import {
  type BarrelKind,
  type FloorState,
  type Tile,
  TILE_WALL,
  isWalkable,
  tileAt,
} from "../core/types";
import { itemDef } from "../items/catalog";
import { BARREL_MODELS } from "../modelList";

/** 見えているマス / 記憶しているだけのマス の明るさ */
const LIT = new THREE.Color(1.0, 1.0, 1.0);
const REMEMBERED = new THREE.Color(0.40, 0.43, 0.56);
const HIDDEN_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * フロアの地形と、床に置かれているものの表示。
 *
 * 壁と床はマス数ぶんあるので InstancedMesh にまとめる。壁は「歩けるマスに
 * 面しているもの」だけを出す。奥に埋まっている壁は決して見えないので、
 * 出さなければそのぶん軽くなる。
 */
export class DungeonView {
  private readonly group = new THREE.Group();
  private walls: THREE.InstancedMesh | null = null;
  private floors: THREE.InstancedMesh | null = null;
  /** インスタンス番号 → そのマスのタイル配列上の添字 */
  private wallIndex: number[] = [];
  private floorIndex: number[] = [];

  private readonly stairsGroup = new THREE.Group();
  private readonly itemGroup = new THREE.Group();
  private readonly trapGroup = new THREE.Group();
  private readonly barrelGroup = new THREE.Group();
  /** アイテム uid → 表示物。毎ターン作り直さずに済ませるための対応表 */
  private readonly itemViews = new Map<number, THREE.Object3D>();
  private readonly trapViews = new Map<string, THREE.Object3D>();
  /** タル id → 表示物。中身が変わると別のモデルに差し替える */
  private readonly barrelViews = new Map<number, { object: THREE.Object3D; kind: BarrelKind }>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly assets: Assets,
  ) {
    this.group.add(this.stairsGroup, this.itemGroup, this.trapGroup, this.barrelGroup);
    this.scene.add(this.group);
  }

  /** 新しいフロアに入ったときに一度だけ呼ぶ */
  build(floor: FloorState): void {
    this.clear();

    const wallCells: number[] = [];
    const floorCells: number[] = [];
    for (let i = 0; i < floor.tiles.length; i++) {
      const tile = floor.tiles[i]!;
      if (isWalkable(tile.kind)) {
        floorCells.push(i);
      } else if (this.touchesWalkable(floor, i)) {
        wallCells.push(i);
      }
    }

    this.walls = this.makeInstanced("wall", wallCells.length, floor, wallCells, 0);
    this.floors = this.makeInstanced("floor", floorCells.length, floor, floorCells, 0);
    this.wallIndex = wallCells;
    this.floorIndex = floorCells;

    const stairs = this.assets.instantiate("stairs").root;
    stairs.position.copy(toWorld(floor.stairs));
    this.stairsGroup.add(stairs);

    this.refresh(floor);
  }

  /** 毎ターン呼ぶ。視界に応じた明るさと、落ちているものの増減を反映する */
  refresh(floor: FloorState): void {
    this.applyVisibility(this.walls, this.wallIndex, floor);
    this.applyVisibility(this.floors, this.floorIndex, floor);

    const stairsTile = tileAt(floor, floor.stairs);
    this.stairsGroup.visible = stairsTile?.explored ?? false;

    this.syncItems(floor);
    this.syncTraps(floor);
    this.syncBarrels(floor);
  }

  /**
   * 床に置かれているタル。中身が変わる(空 → モンスター入り)ことがあるので、
   * 種類が変わっていたらモデルごと差し替える。
   */
  private syncBarrels(floor: FloorState): void {
    const alive = new Set<number>();
    for (const barrel of floor.barrels) {
      const tile = tileAt(floor, barrel.pos);
      if (!tile?.explored) continue;
      alive.add(barrel.id);

      let view = this.barrelViews.get(barrel.id);
      if (view && view.kind !== barrel.kind) {
        this.barrelGroup.remove(view.object);
        view = undefined;
      }
      if (!view) {
        const object = this.assets.instantiate(BARREL_MODELS[barrel.kind]).root;
        view = { object, kind: barrel.kind };
        this.barrelViews.set(barrel.id, view);
        this.barrelGroup.add(object);
      }
      view.object.position.copy(toWorld(barrel.pos));
      view.object.visible = tile.visible;
    }
    for (const [id, view] of this.barrelViews) {
      if (alive.has(id)) continue;
      this.barrelGroup.remove(view.object);
      this.barrelViews.delete(id);
    }
  }

  /** タルを1つ取り出して、別のところ(プレイヤーの頭上など)に付け替える */
  detachBarrel(id: number): THREE.Object3D | null {
    const view = this.barrelViews.get(id);
    if (!view) return null;
    this.barrelGroup.remove(view.object);
    this.barrelViews.delete(id);
    return view.object;
  }

  private makeInstanced(
    model: string,
    count: number,
    floor: FloorState,
    cells: readonly number[],
    height: number,
  ): THREE.InstancedMesh | null {
    if (count === 0) return null;
    const { geometry, material } = this.assets.instancingSource(model);
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.receiveShadow = true;
    mesh.castShadow = model === "wall";

    const matrix = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const cell = cells[i]!;
      const x = cell % floor.width;
      const y = (cell - x) / floor.width;
      matrix.makeTranslation(x * TILE, height, y * TILE);
      mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(i, LIT);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.group.add(mesh);
    return mesh;
  }

  private applyVisibility(
    mesh: THREE.InstancedMesh | null,
    cells: readonly number[],
    floor: FloorState,
  ): void {
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i]!;
      const tile = floor.tiles[cell]!;
      if (!tile.explored) {
        mesh.setMatrixAt(i, HIDDEN_MATRIX);
        continue;
      }
      const x = cell % floor.width;
      const y = (cell - x) / floor.width;
      matrix.makeTranslation(x * TILE, 0, y * TILE);
      mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(i, tile.visible ? LIT : REMEMBERED);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  /** 4近傍のどれかが歩けるマスなら、その壁は視界に入りうる */
  private touchesWalkable(floor: FloorState, index: number): boolean {
    const x = index % floor.width;
    const y = (index - x) / floor.width;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ] as const) {
      const neighbour: Tile | undefined = tileAt(floor, { x: x + dx, y: y + dy });
      if (neighbour && neighbour.kind !== TILE_WALL) return true;
    }
    return false;
  }

  private syncItems(floor: FloorState): void {
    const alive = new Set<number>();
    for (const ground of floor.items) {
      const tile = tileAt(floor, ground.pos);
      if (!tile?.visible) continue;
      alive.add(ground.item.uid);
      let view = this.itemViews.get(ground.item.uid);
      if (!view) {
        view = this.assets.instantiate(itemDef(ground.item.defId).model).root;
        this.itemViews.set(ground.item.uid, view);
        this.itemGroup.add(view);
      }
      view.position.copy(toWorld(ground.pos));
      view.visible = true;
    }
    for (const [uid, view] of this.itemViews) {
      if (!alive.has(uid)) {
        this.itemGroup.remove(view);
        this.itemViews.delete(uid);
      }
    }
  }

  private syncTraps(floor: FloorState): void {
    for (const trap of floor.traps) {
      const key = `${trap.pos.x},${trap.pos.y}`;
      const tile = tileAt(floor, trap.pos);
      const shouldShow = trap.revealed && (tile?.explored ?? false);
      let view = this.trapViews.get(key);
      if (shouldShow && !view) {
        view = this.assets.instantiate(`trap_${trap.kind}`).root;
        view.position.copy(toWorld(trap.pos));
        this.trapViews.set(key, view);
        this.trapGroup.add(view);
      }
      if (view) view.visible = shouldShow;
    }
  }

  /** 落ちているアイテムをゆっくり回して、床の模様と見分けやすくする */
  animate(time: number): void {
    for (const view of this.itemViews.values()) {
      view.rotation.y = time * 0.9;
      view.position.y = 0.10 + Math.sin(time * 2.2) * 0.045;
    }
  }

  clear(): void {
    for (const mesh of [this.walls, this.floors]) {
      if (!mesh) continue;
      this.group.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      mesh.dispose();
    }
    this.walls = null;
    this.floors = null;
    this.stairsGroup.clear();
    this.itemGroup.clear();
    this.trapGroup.clear();
    this.barrelGroup.clear();
    this.itemViews.clear();
    this.trapViews.clear();
    this.barrelViews.clear();
  }
}
