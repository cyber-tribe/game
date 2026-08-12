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
import { BARREL_MODELS, TRAP_MODELS } from "../modelList";

/** 見えているマス / 記憶しているだけのマス の明るさ */
const LIT = new THREE.Color(1.0, 1.0, 1.0);
const REMEMBERED = new THREE.Color(0.40, 0.43, 0.56);
const HIDDEN_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);

/** applyVisibility が覚えておく状態。まだ一度も反映していないことを表す値と、その内訳 */
const UNSEEN = 255;
const EXPLORED_BIT = 1;
const VISIBLE_BIT = 2;

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
  /**
   * 前回反映したときの explored / visible。変わったマスだけ書き直すために持つ。
   * bit0 = explored、bit1 = visible。UNSEEN は「まだ一度も反映していない」
   */
  private wallState = new Uint8Array(0);
  private floorState = new Uint8Array(0);

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

    const stairsIndex = floor.stairs.y * floor.width + floor.stairs.x;
    const wallCells: number[] = [];
    const floorCells: number[] = [];
    for (let i = 0; i < floor.tiles.length; i++) {
      const tile = floor.tiles[i]!;
      if (isWalkable(tile.kind)) {
        // 階段のマスは階段モデル自体が床も兼ねているので、通常の床タイルは
        // 出さない。両方を同じ高さに重ねて描くとZファイティングで白い縁が
        // ちらつき、階段だと視認できなくなってしまう(#203)
        if (i === stairsIndex) continue;
        floorCells.push(i);
      } else if (this.touchesWalkable(floor, i)) {
        wallCells.push(i);
      }
    }

    this.walls = this.makeInstanced("wall", wallCells.length, floor, wallCells, 0);
    this.floors = this.makeInstanced("floor", floorCells.length, floor, floorCells, 0);
    this.wallIndex = wallCells;
    this.floorIndex = floorCells;
    this.wallState = new Uint8Array(wallCells.length).fill(UNSEEN);
    this.floorState = new Uint8Array(floorCells.length).fill(UNSEEN);

    const stairs = this.assets.instantiate("stairs").root;
    stairs.position.copy(toWorld(floor.stairs));
    this.stairsGroup.add(stairs);

    this.refresh(floor);
  }

  /** 毎ターン呼ぶ。視界に応じた明るさと、落ちているものの増減を反映する */
  refresh(floor: FloorState): void {
    this.applyVisibility(this.walls, this.wallIndex, floor, this.wallState);
    this.applyVisibility(this.floors, this.floorIndex, floor, this.floorState);

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
    // InstancedMeshのboundingSphereは初回描画時に一度だけ自動計算され、以後は
    // setMatrixAtで個々のインスタンスを動かしても自動では更新されない。未探索
    // タイルの多くがまだ原点に潰れている(HIDDEN_MATRIX)初回描画時にこれが
    // 計算されると、その後どれだけ遠くの部屋を探索して床を実座標へ戻しても
    // 古く狭いboundingSphereのままフラスタムカリング判定が行われ、視界内の
    // はずのタイルがメッシュごと描画から丸ごと除外されて真っ暗になる(#181)。
    // 盤面自体が広くないぶん、カリングによる恩恵より正しさを優先し無効化する
    mesh.frustumCulled = false;

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

  /**
   * 視界に応じて、各マスの位置と明るさを反映する。
   *
   * 毎ターン全インスタンスを書き直して両方のバッファを送り直すと、
   * 通路を1マス歩いただけでも行列(1728×16 float ≒ 110KB)と色を丸ごと
   * GPU に再アップロードすることになる。実際に変わるのは数マスなので、
   * 前回との差分だけを書き、変化が無ければ送信自体を省く。
   *
   * 行列が変わるのは explored が反転したときだけ(隠す ⇔ 出す)で、
   * 色は visible が変わるたびに要る。分けて管理する。
   */
  private applyVisibility(
    mesh: THREE.InstancedMesh | null,
    cells: readonly number[],
    floor: FloorState,
    previous: Uint8Array,
  ): void {
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    let matrixChanged = false;
    let colorChanged = false;
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i]!;
      const tile = floor.tiles[cell]!;
      const state = (tile.explored ? EXPLORED_BIT : 0) | (tile.visible ? VISIBLE_BIT : 0);
      const before = previous[i]!;
      if (before === state) continue;
      previous[i] = state;

      // 隠す・出すが切り替わったときだけ行列を書く
      if ((before & EXPLORED_BIT) !== (state & EXPLORED_BIT) || before === UNSEEN) {
        if (tile.explored) {
          const x = cell % floor.width;
          const y = (cell - x) / floor.width;
          matrix.makeTranslation(x * TILE, 0, y * TILE);
          mesh.setMatrixAt(i, matrix);
        } else {
          mesh.setMatrixAt(i, HIDDEN_MATRIX);
        }
        matrixChanged = true;
      }
      if (tile.explored) {
        mesh.setColorAt(i, tile.visible ? LIT : REMEMBERED);
        colorChanged = true;
      }
    }
    if (matrixChanged) mesh.instanceMatrix.needsUpdate = true;
    if (colorChanged && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
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
        // 背景で読み込み中のモデルは、届いた次のターンに拾う(syncItems は毎ターン走る)
        const model = itemDef(ground.item.defId).model;
        if (!this.assets.has(model)) {
          this.assets.loadInBackground([model]);
          continue;
        }
        view = this.assets.instantiate(model).root;
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
        const model = TRAP_MODELS[trap.kind];
        if (!this.assets.has(model)) {
          this.assets.loadInBackground([model]);
          continue;
        }
        view = this.assets.instantiate(model).root;
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
