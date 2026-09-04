import * as THREE from "three";
import { SCENE_BACKGROUND_COLOR, TILE, toWorld } from "./renderer";
import type { Assets } from "./assets";
import {
  type BarrelKind,
  type FloorState,
  type Tile,
  TILE_WALL,
  isWalkable,
  tileAt,
} from "../core/types";
import { itemDef } from "../entities/itemCatalog";
import { BARREL_MODELS, TRAP_MODELS } from "../modelList";
import { regionIndexForFloor } from "../entities/dungeons";

/** 見えているマス / 記憶しているだけのマス の明るさ */
const LIT = new THREE.Color(1.0, 1.0, 1.0);
const REMEMBERED = new THREE.Color(0.40, 0.43, 0.56);
const HIDDEN_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);

/** applyVisibility が覚えておく状態。まだ一度も反映していないことを表す値と、その内訳 */
const UNSEEN = 255;
const EXPLORED_BIT = 1;
const VISIBLE_BIT = 2;

/**
 * 地方ごとのタイルセット(plan/models/archive/dungeon-region1-tileset.md、
 * plan/models/archive/dungeon-region-tileset-generalize.md)。壁・床とも
 * 3バリアントで、タイルごとにランダムに1つを選び繰り返し感を消す。
 * まだタイルセットを持たない地方は、既定の"wall"/"floor"/"stairs"へ
 * フォールバックする(地方が増えるたびにここへエントリを追加するだけでよい)
 */
const REGION_TILESETS: Partial<
  Record<number, { wall: readonly string[]; floor: readonly string[]; stairs: string }>
> = {
  1: {
    wall: ["wall_region1_v1", "wall_region1_v2", "wall_region1_v3"],
    floor: ["floor_region1_v1", "floor_region1_v2", "floor_region1_v3"],
    stairs: "stairs_region1",
  },
  2: {
    wall: ["wall_region2_v1", "wall_region2_v2", "wall_region2_v3"],
    floor: ["floor_region2_v1", "floor_region2_v2", "floor_region2_v3"],
    stairs: "stairs_region2",
  },
};

/**
 * `DungeonView.build`が実際にこのフロアで使う地形モデル名。地方タイルセットを
 * 持たない地方は既定の"wall"/"floor"/"stairs"(常にessentialModelNamesで読み
 * 込み済み)にフォールバックするため、その場合は空配列を返す ―
 * `REGION2_TERRAIN_MODELS`のように意図して背景読み込みに任せているモデルだけ、
 * 呼び出し側がAssets.readyで待ち合わせる対象にする(plan/game/archive/
 * dungeon-camera-distance.mdの実装中に発見した、フロア注入直後だと背景読み込みが
 * 間に合わず`Assets.get`が例外を投げる競合の修正)
 */
export function requiredTerrainModels(dungeonId: string, depth: number): string[] {
  const tileset = REGION_TILESETS[regionIndexForFloor(dungeonId, depth)];
  if (!tileset) return [];
  return [...tileset.wall, ...tileset.floor, tileset.stairs];
}

/**
 * 座標からタイルごとに決定的な「ランダム」値を作る(x,yだけの単純な剰余だと
 * 盤面に斜め縞の規則性が出てしまうため、ビット混合で崩す)。
 * バリアント選び・回転のどちらにも使うので、用途ごとにsaltを変えて呼ぶ
 */
function tileHash(x: number, y: number, salt: number): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return h >>> 0;
}

/** InstancedMeshひとつぶんの管理単位(バリアントごとに1つ持つ) */
interface TerrainLayer {
  mesh: THREE.InstancedMesh;
  cells: number[];
  rotations: number[] | null;
  state: Uint8Array;
}

/**
 * フロアの地形と、床に置かれているものの表示。
 *
 * 壁と床はマス数ぶんあるので InstancedMesh にまとめる。壁は「歩けるマスに
 * 面しているもの」だけを出す。奥に埋まっている壁は決して見えないので、
 * 出さなければそのぶん軽くなる。
 */
export class DungeonView {
  private readonly group = new THREE.Group();
  /**
   * 壁・床それぞれ、バリアントの数だけInstancedMeshを持つ(地方1は3種、
   * それ以外は1種のみ)。タイルごとにどのレイヤーに属するかは
   * build()時にtileHashで決めて固定する
   */
  private wallLayers: TerrainLayer[] = [];
  private floorLayers: TerrainLayer[] = [];

  private readonly stairsGroup = new THREE.Group();
  /**
   * ボスの間の扉(plan/game/dungeon-boss-rooms.md)。専用モデルはまだ無く、
   * 既存の壁モデルを開くまでの塞ぎ物として流用する(通路タイル自体は
   * TILE_CORRIDORで歩けるが、開けるまではこのグループが壁のように覆う)。
   * 開いたら非表示にして、下の通路床が見えるようにする
   */
  private readonly doorGroup = new THREE.Group();
  /**
   * ボスの間の階段(plan/game/dungeon-boss-rooms.md)。撃破するまでは扉と
   * 同じ流儀で既存の壁モデルを塞ぎ物として流用し、階段モデル自体
   * (stairsGroup)は隠しておく。撃破すると入れ替える
   */
  private readonly blockedStairsGroup = new THREE.Group();
  /**
   * 横穴(plan/game/dungeon-per-region.md)の入り口。村の入洞口と同じ
   * cave_gate モデルを流用する(通路タイル自体は歩けるので、扉と違って
   * 覆い隠しはしない。目印として置くだけ)
   */
  private readonly branchEntranceGroup = new THREE.Group();
  private readonly itemGroup = new THREE.Group();
  private readonly trapGroup = new THREE.Group();
  private readonly barrelGroup = new THREE.Group();
  /**
   * 夢のもや(plan/models/archive/dungeon-dreamscape.md「1. 夢の演出言語」)。
   * フロアの外周を虚空ではなく、淡い霧が渦を巻く空間にする。フロアの
   * 外形にぴったり沿った4枚の板を境界のすぐ外に置くだけの簡単な表現
   */
  private readonly mistGroup = new THREE.Group();
  /** アイテム uid → 表示物。毎ターン作り直さずに済ませるための対応表 */
  private readonly itemViews = new Map<number, THREE.Object3D>();
  private readonly trapViews = new Map<string, THREE.Object3D>();
  /** タル id → 表示物。中身が変わると別のモデルに差し替える */
  private readonly barrelViews = new Map<number, { object: THREE.Object3D; kind: BarrelKind }>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly assets: Assets,
  ) {
    this.group.add(
      this.stairsGroup,
      this.doorGroup,
      this.blockedStairsGroup,
      this.branchEntranceGroup,
      this.itemGroup,
      this.trapGroup,
      this.barrelGroup,
      this.mistGroup,
    );
    this.scene.add(this.group);
  }

  /** 新しいフロアに入ったときに一度だけ呼ぶ */
  build(floor: FloorState, dungeonId: string): void {
    this.clear();

    // 地方ごとのタイルセットを引く。持たない地方は既定セットへ
    // フォールバックする(plan/models/archive/
    // dungeon-region-tileset-generalize.md)
    const tileset = REGION_TILESETS[regionIndexForFloor(dungeonId, floor.depth)];
    const hasTileset = tileset !== undefined;
    const wallModels: readonly string[] = tileset?.wall ?? ["wall"];
    const floorModels: readonly string[] = tileset?.floor ?? ["floor"];

    const stairsIndex = floor.stairs.y * floor.width + floor.stairs.x;
    const wallCellsByVariant: number[][] = wallModels.map(() => []);
    const floorCellsByVariant: number[][] = floorModels.map(() => []);
    for (let i = 0; i < floor.tiles.length; i++) {
      const tile = floor.tiles[i]!;
      const x = i % floor.width;
      const y = (i - x) / floor.width;
      if (isWalkable(tile.kind)) {
        // 階段のマスは階段モデル自体が床も兼ねているので、通常の床タイルは
        // 出さない。両方を同じ高さに重ねて描くとZファイティングで白い縁が
        // ちらつき、階段だと視認できなくなってしまう(#203)
        if (i === stairsIndex) continue;
        const variant = floorModels.length > 1 ? tileHash(x, y, 13) % floorModels.length : 0;
        floorCellsByVariant[variant]!.push(i);
      } else if (this.touchesWalkable(floor, i)) {
        const variant = wallModels.length > 1 ? tileHash(x, y, 7) % wallModels.length : 0;
        wallCellsByVariant[variant]!.push(i);
      }
    }

    this.wallLayers = this.buildLayers(wallModels, wallCellsByVariant, floor, hasTileset);
    this.floorLayers = this.buildLayers(floorModels, floorCellsByVariant, floor, hasTileset);

    const stairs = this.assets.instantiate(tileset?.stairs ?? "stairs").root;
    stairs.position.copy(toWorld(floor.stairs));
    this.stairsGroup.add(stairs);

    if (floor.stairsBlocked) {
      const blocker = this.assets.instantiate("wall").root;
      blocker.position.copy(toWorld(floor.stairs));
      this.blockedStairsGroup.add(blocker);
    }

    if (floor.door) {
      const door = this.assets.instantiate("wall").root;
      door.position.copy(toWorld(floor.door.pos));
      this.doorGroup.add(door);
    }

    this.buildDreamMist(floor);
    this.refresh(floor);
  }

  /** フロアの外周4辺のすぐ外に、夢のもやの板を1枚ずつ置く */
  private buildDreamMist(floor: FloorState): void {
    // 気分によらず常に背景色と同じ色(夢空・src/view/renderer.tsと
    // 同じ理由・同じ定数: plan/models/archive/
    // dungeon-floor-mist-continuity.md追記)
    const material = new THREE.MeshBasicMaterial({
      color: SCENE_BACKGROUND_COLOR,
      transparent: true,
      opacity: 0.4,
      fog: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mistHeight = 6;
    // 境界からの張り出し。plan/models/archive/dungeon-floor-mist-continuity.md
    // の診断どおり、以前は1.5マス離れた位置に置いていたため、床の縁と
    // もやの間に何もない虚空の隙間ができ「床が空中に浮いて見える」原因に
    // なっていた。境界ぎりぎり(隙間ゼロ)に置き直す
    const margin = 0;
    // 板の幅だけ四隅の外へ張り出す量。位置(margin)と混ぜて1つの値に
    // していたときは、marginを0にした際に四隅の重なりも一緒に消えて
    // しまい、対角線上から覗くと隣の板との継ぎ目に空(夢空)が見える
    // 隙間ができていた(#337追加調査)。板を置く位置は境界ぎりぎりの
    // ままにし、幅だけ別に伸ばして四隅で重ねる
    const cornerOverhang = 1.0;
    const w = floor.width * TILE;
    const h = floor.height * TILE;
    const edges: ReadonlyArray<{ x: number; z: number; width: number; rotY: number }> = [
      { x: w / 2, z: -margin, width: w + cornerOverhang * 2, rotY: 0 },
      { x: w / 2, z: h + margin, width: w + cornerOverhang * 2, rotY: 0 },
      { x: -margin, z: h / 2, width: h + cornerOverhang * 2, rotY: Math.PI / 2 },
      { x: w + margin, z: h / 2, width: h + cornerOverhang * 2, rotY: Math.PI / 2 },
    ];
    for (const edge of edges) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(edge.width, mistHeight), material);
      mesh.position.set(edge.x, mistHeight / 2 - 1, edge.z);
      mesh.rotation.y = edge.rotY;
      this.mistGroup.add(mesh);
    }
  }

  /** 毎ターン呼ぶ。視界に応じた明るさと、落ちているものの増減を反映する */
  refresh(floor: FloorState): void {
    for (const layer of this.wallLayers) {
      this.applyVisibility(layer.mesh, layer.cells, floor, layer.state, layer.rotations);
    }
    for (const layer of this.floorLayers) {
      this.applyVisibility(layer.mesh, layer.cells, floor, layer.state, layer.rotations);
    }

    const stairsTile = tileAt(floor, floor.stairs);
    const stairsExplored = stairsTile?.explored ?? false;
    this.stairsGroup.visible = stairsExplored && !floor.stairsBlocked;
    this.blockedStairsGroup.visible = stairsExplored && (floor.stairsBlocked ?? false);

    if (floor.door) {
      const doorTile = tileAt(floor, floor.door.pos);
      this.doorGroup.visible = !floor.door.open && (doorTile?.explored ?? false);
    } else {
      this.doorGroup.visible = false;
    }

    this.syncItems(floor);
    this.syncTraps(floor);
    this.syncBarrels(floor);
    this.syncBranchEntrance(floor);
  }

  /**
   * 横穴の入り口。モデルが背景読み込み中でまだ届いていなければ、次のターンに
   * 拾う(syncItems/syncTrapsと同じ流儀)。入口は1フロアに高々1つで、
   * 入ると消える(FloorState.branchEntranceがundefinedになる)ので、
   * 対応関係はグループの子の有無だけで足りる
   */
  private syncBranchEntrance(floor: FloorState): void {
    const entrance = floor.branchEntrance;
    if (!entrance) {
      this.branchEntranceGroup.clear();
      return;
    }
    if (this.branchEntranceGroup.children.length === 0) {
      if (!this.assets.has("cave_gate")) {
        this.assets.loadInBackground(["cave_gate"]);
        return;
      }
      const gate = this.assets.instantiate("cave_gate").root;
      gate.position.copy(toWorld(entrance.pos));
      this.branchEntranceGroup.add(gate);
    }
    const tile = tileAt(floor, entrance.pos);
    this.branchEntranceGroup.visible = tile?.explored ?? false;
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

  /**
   * バリアントごとのモデル名 × そのバリアントに属するマス番号から、
   * バリアントの数だけTerrainLayerを作る(1バリアントしかない既定セットでは
   * 従来どおり1つだけ作られる)。地方1だけ、タイルごとに90度単位の
   * ランダム回転も添えて繰り返し感を消す(plan/models/archive/
   * dungeon-region1-tileset.md)
   */
  private buildLayers(
    models: readonly string[],
    cellsByVariant: readonly number[][],
    floor: FloorState,
    withRandomRotation: boolean,
  ): TerrainLayer[] {
    const layers: TerrainLayer[] = [];
    for (let v = 0; v < models.length; v++) {
      const cells = cellsByVariant[v]!;
      const rotations = withRandomRotation
        ? cells.map((cell) => {
            const x = cell % floor.width;
            const y = (cell - x) / floor.width;
            return (tileHash(x, y, 101) % 4) * (Math.PI / 2);
          })
        : null;
      const mesh = this.makeInstanced(models[v]!, cells.length, floor, cells, 0);
      if (!mesh) continue;
      layers.push({ mesh, cells, rotations, state: new Uint8Array(cells.length).fill(UNSEEN) });
    }
    return layers;
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
    mesh.castShadow = model.startsWith("wall");
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
    rotations: readonly number[] | null,
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
          if (rotations) {
            matrix.makeRotationY(rotations[i]!);
            matrix.setPosition(x * TILE, 0, y * TILE);
          } else {
            matrix.makeTranslation(x * TILE, 0, y * TILE);
          }
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
    // 夢のもやをゆっくり明滅させる(4枚の板は同じマテリアルを共有しているので
    // 一括で変わる。plan/models/archive/dungeon-dreamscape.md)
    const firstMist = this.mistGroup.children[0] as THREE.Mesh | undefined;
    if (firstMist) {
      (firstMist.material as THREE.MeshBasicMaterial).opacity = 0.32 + Math.sin(time * 0.25) * 0.08;
    }
  }

  clear(): void {
    for (const layer of [...this.wallLayers, ...this.floorLayers]) {
      this.group.remove(layer.mesh);
      layer.mesh.geometry.dispose();
      (layer.mesh.material as THREE.Material).dispose();
      layer.mesh.dispose();
    }
    this.wallLayers = [];
    this.floorLayers = [];
    this.stairsGroup.clear();
    this.doorGroup.clear();
    this.blockedStairsGroup.clear();
    this.branchEntranceGroup.clear();
    this.itemGroup.clear();
    this.trapGroup.clear();
    this.barrelGroup.clear();
    this.itemViews.clear();
    this.trapViews.clear();
    this.barrelViews.clear();
    // 4枚とも同じマテリアルを共有しているので、1回だけdisposeすればよい
    const firstMist = this.mistGroup.children[0] as THREE.Mesh | undefined;
    if (firstMist) (firstMist.material as THREE.Material).dispose();
    for (const child of this.mistGroup.children) (child as THREE.Mesh).geometry.dispose();
    this.mistGroup.clear();
  }
}
