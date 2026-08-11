import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";

export interface ModelAsset {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
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

  async loadAll(names: readonly string[], baseUrl = "models"): Promise<void> {
    await Promise.all(
      names.map(async (name) => {
        if (this.cache.has(name)) return;
        const gltf = await this.loader.loadAsync(`${baseUrl}/${name}.glb`);
        gltf.scene.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
          }
        });
        this.cache.set(name, { scene: gltf.scene, animations: gltf.animations });
      }),
    );
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
