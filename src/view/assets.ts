import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";

export interface ModelAsset {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

/**
 * トゥーンシェーディングの階調マップ(plan/game/archive/toon-shading-pipeline.md、
 * plan/models/archive/visual-quality-uplift.md施策C)。影 / 暗め中間 / 明るめ中間 /
 * ハイライトの4階調。全マテリアル共通で使い回すのでモジュールスコープで
 * 1回だけ作る。
 *
 * 元は3階調([90, 150, 215])だった。中間が1段しかなく、大きな面が
 * のっぺり単調に見える一因になっていたため、中間を2段に割って4階調へ
 * 広げた(visual-quality-uplift.md「トゥーン階調を3段→4〜5段」)。
 * 両端の理由は元のままなので変えていない:
 *
 * 最暗部を0にすると陰の面がほぼ黒く潰れてモンスターの配色が読めなくなったため、
 * 85まで持ち上げてある。NearestFilterは必須(線形補間だと階調が滑らかにボケて
 * トゥーンにならない)。
 *
 * ハイライト段を255から215へ下げてある(issue #484)。既存のライト強度は
 * 置き換え前の`MeshStandardMaterial`(PBR、エネルギー保存で暗めに出る)向けに
 * 調整されており、ランバート系の`MeshToonMaterial`で同じ光量を受けると
 * 255段では受光面が飽和して「発光している」ように見えていた。松明の近くの
 * キャラクター周辺で測ると、輝度0.9超の画素が3.51%→0.85%、0.98超が
 * 0.015%→0%になり、白飛びが解消する。さらに下げても0.9超は0.85%前後で
 * 頭打ちになり、絵全体が暗くなるだけだったのでここで止めている。
 */
export const TOON_GRADIENT_STEPS = [85, 130, 175, 215] as const;

const TOON_GRADIENT = (() => {
  const data = new Uint8Array(TOON_GRADIENT_STEPS);
  const texture = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
})();

/**
 * 輪郭線(Inverted Hull法)の太さ。ローカル単位。既存モデルは概ね高さ
 * 0.2〜1.0ローカル単位で作られており、0.012はそのスケール帯でヘッドレス
 * ブラウザのスクリーンショットを見比べて「輪郭が途切れず見えるが、
 * 顔まわりの造形を潰さない」太さとして選んだ値。
 */
const OUTLINE_THICKNESS = 0.012;
/**
 * 輪郭線の太さの上限を、モデルの高さに対する比で決める。0.012は高さ
 * 0.2〜1.0のモデルで選んだ値で、それより小さいモデルでは相対的に太く
 * なりすぎる。約12cmのガジリねずみでは体の10%にあたり、口先・腕・
 * 木の実など**内側の部品のハルが顔の外へ突き出て黒い弧**になった
 * (商品確認用ターンテーブルで実測)。高さ0.4未満のモデルだけが
 * 細くなり、それ以上は従来どおり0.012のまま。
 */
const OUTLINE_THICKNESS_RATIO = 0.03;

/** モデルの高さから輪郭線の太さを決める(上限 OUTLINE_THICKNESS) */
export function outlineThicknessFor(height: number): number {
  if (!Number.isFinite(height) || height <= 0) return OUTLINE_THICKNESS;
  return Math.min(OUTLINE_THICKNESS, height * OUTLINE_THICKNESS_RATIO);
}
/**
 * 輪郭線に色が無いモデル向けの既定値(plan/models/archive/visual-quality-uplift.md
 * 施策C「純黒をやめ、各モデルの基色を暗く濁した色にする」)。通常は
 * `outlineColorFor`がモデル本体の色から導くので、この値が直接出るのは
 * `MeshToonMaterial.color`が拾えなかった場合の保険だけ
 */
const OUTLINE_COLOR = 0x0a0a0c;
/** 輪郭線の明度(HSLのL)。低いほど黒に近く、モデルごとの色相だけがうっすら乗る */
const OUTLINE_LIGHTNESS = 0.06;
/** 輪郭線の彩度を基色の何倍に抑えるか(そのままだと派手すぎるため濁す) */
const OUTLINE_SATURATION_SCALE = 0.6;

/**
 * モデル本体の色から、暗く濁した輪郭線の色を作る(plan/models/
 * visual-quality-uplift.md施策C)。色相はそのまま、彩度を落として
 * 明度を大きく下げるので、赤いモンスターは暗い臙脂、青いキャラは
 * 暗い紺の輪郭になる(一律の黒よりモデルに馴染む)。`MeshToonMaterial.color`
 * を拾えない(発光のみ等)ときは既定の`OUTLINE_COLOR`にフォールバックする
 */
export function outlineColorFor(material: THREE.Material | THREE.Material[]): THREE.Color {
  const first = Array.isArray(material) ? material[0] : material;
  const base = (first as THREE.MeshToonMaterial | undefined)?.color;
  if (!base) return new THREE.Color(OUTLINE_COLOR);
  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);
  return new THREE.Color().setHSL(hsl.h, hsl.s * OUTLINE_SATURATION_SCALE, OUTLINE_LIGHTNESS);
}

/**
 * リムライト(逆光の縁光、plan/game/archive/rim-light-and-contact-shadow.md)。
 * 暗い洞窟の背景からキャラクターを浮き立たせるための、固定色・固定強度の
 * フレネル項。`MOOD_VISUALS`(気分の色調)との連動は未決事項として計画書に
 * 残してあり、まずは固定値で入れる。
 */
const RIM_COLOR = new THREE.Color(0x8090c0);
const RIM_POWER = 3.0;
const RIM_STRENGTH = 0.35;

/**
 * MeshStandardMaterial(glTFのPBR素材)をトゥーン向けに置き換える。
 *
 * `withRim`はスキン付きメッシュ(モンスター・プレイヤーなどのキャラクター)
 * のときだけtrueにする。壁・床のような非キャラクターの静的な形状には
 * リムライトを掛けない(plan/game/archive/rim-light-and-contact-shadow.md
 * の対象外方針)。
 *
 * `hasVertexColors`はジオメトリにAOベイク(plan/game/archive/
 * ao-vertex-color-bake.md、`tools/models/common.py`の
 * `bake_ao_to_vertex_colors()`)由来の頂点カラーがあるときtrueにする。
 * 発光マテリアル(目の光など)では有効にしない。AOで暗くなると
 * 「弱った光」に見えてしまうため。
 */
function toToonMaterial(
  source: THREE.Material,
  withRim: boolean,
  hasVertexColors: boolean,
): THREE.MeshToonMaterial {
  const std = source as THREE.MeshStandardMaterial;
  const material = new THREE.MeshToonMaterial({
    color: std.color,
    map: std.map,
    emissive: std.emissive,
    emissiveIntensity: std.emissiveIntensity,
    emissiveMap: std.emissiveMap,
    transparent: std.transparent,
    opacity: std.opacity,
    gradientMap: TOON_GRADIENT,
    vertexColors: hasVertexColors && std.emissiveIntensity <= 0,
    // metalnessはMeshToonMaterialに存在しないため単純に失われる(想定内。
    // plan/game/archive/toon-shading-pipeline.md参照)
  });
  if (withRim) addRimLight(material);
  return material;
}

/**
 * リムライトをtotalEmissiveRadianceへ加算する。被弾フラッシュ
 * (ActorView.flash()によるmaterial.emissiveの書き換え)・目の発光
 * (emissiveMap)のどちらも同じ変数への加算/代入なので、素直に重なって
 * 干渉しない(meshtoon.glsl.jsではtotalEmissiveRadiance = emissiveの
 * 代入がemissivemap_fragmentの直前にあり、このinclude内でemissiveMapが
 * 乗算される。その直後にリムを足す)
 */
function addRimLight(material: THREE.MeshToonMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.rimColor = { value: RIM_COLOR };
    shader.uniforms.rimPower = { value: RIM_POWER };
    shader.uniforms.rimStrength = { value: RIM_STRENGTH };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform vec3 rimColor;\nuniform float rimPower;\nuniform float rimStrength;"
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        {
          vec3 viewDir = normalize(vViewPosition);
          float rim = pow(1.0 - saturate(dot(normal, viewDir)), rimPower);
          totalEmissiveRadiance += rimColor * rim * rimStrength;
        }`
      );
  };
}

/**
 * 輪郭線用マテリアル。背面だけを描画し、頂点シェーダーで法線方向に
 * 少し押し出す(Inverted Hull法)。
 *
 * #include <skinning_vertex> の"後"に押し出しを注入するのが肝心。
 * スキニング適用前のローカル法線でオフセットすると、ボーンが回転した
 * 状態で押し出し方向がずれる。
 */
function makeOutlineMaterial(color: THREE.Color, thickness: number): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({
    color,
    side: THREE.BackSide,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.outlineThickness = { value: thickness };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float outlineThickness;")
      .replace(
        "#include <skinning_vertex>",
        "#include <skinning_vertex>\ntransformed += normalize(objectNormal) * outlineThickness;"
      );
  };
  return material;
}

/**
 * 剛体(スキンなし)メッシュ用の輪郭線マテリアル(plan/models/archive/
 * eye-blink-liveliness.md。頭骨へ剛体で親化した目に使う)。
 *
 * 上のmakeOutlineMaterialは`objectNormal`を使うが、これは
 * `#if defined(USE_ENVMAP) || defined(USE_SKINNING)`の中でしか
 * 宣言されず(three.jsのMeshBasicMaterial頂点シェーダーテンプレート)、
 * スキンなしメッシュでは未定義変数エラーになる(実機playtestで発覚)。
 * 剛体メッシュは頂点ごとの変形が無いぶん単純で、変形前のraw法線属性
 * (`normal`)をそのまま使えば十分。押し出しは`#include <begin_vertex>`
 * (常に存在する)の直後でよい。
 */
function makeRigidOutlineMaterial(color: THREE.Color, thickness: number): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({
    color,
    side: THREE.BackSide,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.outlineThickness = { value: thickness };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float outlineThickness;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\ntransformed += normalize(normal) * outlineThickness;"
      );
  };
  return material;
}

/**
 * スキン付きメッシュの兄弟ノードとして輪郭線メッシュを追加する。
 * ジオメトリは複製せず共有し、同じskeletonインスタンスにbindする。
 * これにより SkeletonUtils.clone() が instantiate() で複製する際も
 * 「輪郭線が本体に追従する」関係が壊れない(SkeletonUtils.clone は
 * 複数のSkinnedMeshが同じスケルトンを共有する構成を正しく扱う)。
 */
function addOutlineMesh(mesh: THREE.SkinnedMesh, thickness: number): void {
  const outline = new THREE.SkinnedMesh(mesh.geometry, makeOutlineMaterial(outlineColorFor(mesh.material), thickness));
  outline.name = `${mesh.name}__outline`;
  outline.bind(mesh.skeleton, mesh.bindMatrix);
  outline.castShadow = false;
  outline.receiveShadow = false;
  outline.frustumCulled = mesh.frustumCulled;
  // 本体メッシュ自身のローカル変換(通常は単位変換だが、念のため揃えておく)
  outline.position.copy(mesh.position);
  outline.quaternion.copy(mesh.quaternion);
  outline.scale.copy(mesh.scale);
  const parent = mesh.parent;
  if (parent) {
    parent.add(outline);
  } else {
    // 実際のglTF構造では起こらないはずだが、保険として本体自身に付ける
    mesh.add(outline);
  }
}

/**
 * 骨へ剛体で親化された非スキンメッシュ(髪・耳・まばたき対象の目など。
 * tools/models/common.pyのparent_to_bone)は、SkeletonUtils.clone前提の
 * addOutlineMeshが使えない。スキニングが無いぶん単純で、輪郭線メッシュを
 * 本体の**子**として足すだけでよい(兄弟ではなく子にすることで、
 * BlinkControllerが本体側のscaleをまばたきで変えても、子は変換を
 * 継承してそのまま追従する)。
 *
 * **`userData.blink`があるものだけに限ってはいけない。** ガルドの髪
 * (`garudo_hair`)と耳(`garudo_ear`)は骨へ親化した非スキンメッシュだが
 * まばたき対象ではないので、この条件を付けていたあいだ**輪郭線が
 * 1本も付いていなかった**。髪はキャラクターで一番大きなシルエットなので、
 * 効果は大きい。
 */
function addRigidOutlineMesh(mesh: THREE.Mesh, thickness: number): void {
  const outline = new THREE.Mesh(mesh.geometry, makeRigidOutlineMaterial(outlineColorFor(mesh.material), thickness));
  outline.name = `${mesh.name}__outline`;
  outline.castShadow = false;
  outline.receiveShadow = false;
  outline.frustumCulled = mesh.frustumCulled;
  mesh.add(outline);
}

/**
 * 輪郭線を付けてはいけない材質か。
 *
 * - **半透明**: 中身が透けて見える泡(oonebosukeの`_bubble`、
 *   alphaMode=BLEND)の外側に不透明な黒い殻がかぶさり、黒い球になる。
 * - **発光が主**: 光の粒(`_bubble_gleam`、emissive 0.6)は「形」ではなく
 *   「光」なので、囲むと暗い輪になる。輪郭線はシルエットを立てるための
 *   もので、ハイライトに付けるものではない。
 */
function skipOutline(material: THREE.Material | THREE.Material[]): boolean {
  const list = Array.isArray(material) ? material : [material];
  return list.some((m) => {
    if (!m) return false;
    if (m.transparent === true || (m.opacity ?? 1) < 1) return true;
    const std = m as THREE.MeshStandardMaterial;
    const e = std.emissive;
    if (!e) return false;
    const glow = Math.max(e.r, e.g, e.b) * (std.emissiveIntensity ?? 1);
    return glow >= 0.5;
  });
}

/**
 * 輪郭線を付ける対象を集める(トゥーン化も同時に済ませる)。
 *
 * 輪郭線メッシュの追加はtraverse中に子を増やすことになり、走査中の
 * children配列を書き換えてしまう恐れがあるため、対象を先に集めてから
 * まとめて足す。
 *
 * **非スキンメッシュを`userData.blink`のあるものだけに絞ってはいけない。**
 * ガルドの髪(`garudo_hair`)と耳(`garudo_ear`)は骨へ親化した非スキン
 * メッシュだがまばたき対象ではないので、その条件を付けていたあいだ
 * **輪郭線が1本も付いていなかった**(髪はキャラクターで一番大きな
 * シルエットなので影響が大きい)。
 */
export function collectOutlineTargets(root: THREE.Object3D): {
  skinned: THREE.SkinnedMesh[];
  rigid: THREE.Mesh[];
} {
  const skinned: THREE.SkinnedMesh[] = [];
  const rigid: THREE.Mesh[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const isSkinned = (mesh as THREE.SkinnedMesh).isSkinnedMesh === true;
    const hasVertexColors = mesh.geometry.hasAttribute("color");
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((m) => toToonMaterial(m, isSkinned, hasVertexColors))
      : toToonMaterial(mesh.material, isSkinned, hasVertexColors);
    if (isSkinned) skinned.push(mesh as THREE.SkinnedMesh);
    else if (!mesh.name.endsWith("__outline") && !skipOutline(mesh.material)) {
      rigid.push(mesh);
    }
  });
  return { skinned, rigid };
}


export interface Instance {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer | null;
  actions: Map<string, THREE.AnimationAction>;
}

/**
 * public/models/*.glb の読み込みとキャッシュ。
 *
 * スキン付きメッシュは Object3D.clone() では骨と皮の対応が壊れるため、
 * three が用意している SkeletonUtils.clone を使う必要がある。
 */
export class Assets {
  private readonly loader = new GLTFLoader();
  private readonly cache = new Map<string, ModelAsset>();
  /** 読み込み中のもの。同じモデルを二重に取りに行かないための控え */
  private readonly inFlight = new Map<string, Promise<void>>();

  async loadAll(names: readonly string[], baseUrl = "models"): Promise<void> {
    await Promise.all(names.map((name) => this.load(name, baseUrl)));
  }

  /**
   * 背景で読み進める。待たない。
   *
   * 起動時は「地下1階に要るぶん」だけを待ってタイトルを出し、残りはこれで
   * 追いかける(src/modelList.ts の essentialModelNames 参照)。取りこぼしが
   * あってもフロアを組む手前で ready() が待ち合わせるので、ここでは待たない。
   */
  loadInBackground(names: readonly string[], baseUrl = "models"): void {
    for (const name of names) {
      // 失敗しても起動を止めない。実際に必要になった時点で ready() が
      // もう一度取りに行き、そこで初めて表に出る
      void this.load(name, baseUrl).catch(() => {});
    }
  }

  /** 指定したモデルが使える状態になるまで待つ。読み終わっていれば即座に返る */
  async ready(names: readonly string[], baseUrl = "models"): Promise<void> {
    const pending = names.filter((name) => !this.cache.has(name));
    if (pending.length > 0) await this.loadAll(pending, baseUrl);
  }

  /** 同じモデルを二重に取りに行かないよう、進行中の読み込みを共有する */
  private load(name: string, baseUrl: string): Promise<void> {
    if (this.cache.has(name)) return Promise.resolve();
    const running = this.inFlight.get(name);
    if (running) return running;

    const task = (async () => {
      const gltf = await this.loader.loadAsync(`${baseUrl}/${name}.glb`);
      // 輪郭線メッシュの追加はtraverse中に子を増やすことになり、走査中の
      // children配列を書き換えてしまう恐れがあるため、対象のSkinnedMeshだけ
      // 先に集めておき、traverseを終えてからまとめて追加する
      const { skinned, rigid } = collectOutlineTargets(gltf.scene);
      // 太さはモデルの高さ(レストポーズの境界)で決める
      const size = new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3());
      const thickness = outlineThicknessFor(size.y);
      for (const mesh of skinned) addOutlineMesh(mesh, thickness);
      for (const mesh of rigid) addRigidOutlineMesh(mesh, thickness);
      this.cache.set(name, { scene: gltf.scene, animations: gltf.animations });
    })().finally(() => {
      this.inFlight.delete(name);
    });
    this.inFlight.set(name, task);
    return task;
  }

  has(name: string): boolean {
    return this.cache.has(name);
  }

  get(name: string): ModelAsset {
    const asset = this.cache.get(name);
    if (!asset) throw new Error(`モデル '${name}' が読み込まれていない`);
    return asset;
  }

  /** 表示用の実体を1つ作る。アニメーションがあれば mixer とアクションも用意する */
  instantiate(name: string): Instance {
    const asset = this.get(name);
    const root = cloneSkinned(asset.scene);
    const actions = new Map<string, THREE.AnimationAction>();
    let mixer: THREE.AnimationMixer | null = null;
    if (asset.animations.length > 0) {
      mixer = new THREE.AnimationMixer(root);
      for (const clip of asset.animations) {
        actions.set(clip.name, mixer.clipAction(clip));
      }
    }
    return { root, mixer, actions };
  }

  /**
   * モデルの最初のマテリアルの色。撃破時の「体色の粒が散る」演出
   * (plan/game/archive/combat-vfx-particles.md)に使う。専用の色テーブルは
   * 持たず、既存のモデルデータからそのまま引く。輪郭線メッシュ
   * (`__outline`終わりの名前、黒一色のMeshBasicMaterial)は候補から除く。
   */
  firstMaterialColor(name: string): THREE.Color | null {
    const asset = this.cache.get(name);
    if (!asset) return null;
    let found: THREE.Color | null = null;
    asset.scene.traverse((obj) => {
      if (found) return;
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || mesh.name.endsWith("__outline")) return;
      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      const colored = material as THREE.MeshToonMaterial | undefined;
      if (colored?.color) found = colored.color;
    });
    return found;
  }

  /**
   * InstancedMesh に使うための形状と材質。
   * 壁や床のように同じものを大量に並べるものは、1つのジオメトリにまとめて
   * 描画コールを1回に抑える。
   */
  instancingSource(name: string): { geometry: THREE.BufferGeometry; material: THREE.Material } {
    const asset = this.get(name);
    let found: THREE.Mesh | null = null;
    asset.scene.traverse((obj) => {
      if (!found && (obj as THREE.Mesh).isMesh) found = obj as THREE.Mesh;
    });
    if (!found) throw new Error(`モデル '${name}' にメッシュがない`);

    const mesh = found as THREE.Mesh;
    const geometry = mesh.geometry.clone();
    // glTF のノード変換を形状側に焼き込んでおく。InstancedMesh は
    // 各インスタンスの行列しか持てないため、元の姿勢はここで反映しておく必要がある
    mesh.updateWorldMatrix(true, false);
    geometry.applyMatrix4(mesh.matrixWorld);
    const material = Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material;
    return { geometry, material: material.clone() };
  }
}
