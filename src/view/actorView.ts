import * as THREE from "three";
import type { Instance } from "./assets";
import { TILE } from "./renderer";
import { type Dir, type Vec2, dirDelta } from "../core/grid";

export type ClipName = "idle" | "walk" | "attack" | "hit" | "die";

const ONE_SHOT: ReadonlySet<ClipName> = new Set(["attack", "hit", "die"]);

/**
 * 盤面のアクター1体ぶんの表示。
 *
 * ゲーム側はマス目単位で一瞬のうちに解決されるので、見た目のほうで
 * マスからマスへ滑らかに移す。向きも同じように補間する。
 */
export class ActorView {
  readonly root: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer | null;
  private readonly actions: Map<string, THREE.AnimationAction>;
  private current: ClipName | null = null;
  /** 一度きりのクリップの残り時間。0 になったら idle に戻す */
  private oneShotLeft = 0;

  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  private moveElapsed = 0;
  private moveDuration = 0;

  private yaw = 0;
  private targetYaw = 0;

  /** 攻撃で前に踏み込む量 */
  private lungeLeft = 0;
  private lungeTotal = 0;
  private readonly lungeDir = new THREE.Vector3();

  /** 頭上に抱えているもの。タルを持ち上げているあいだ付いてまわる */
  private carried: THREE.Object3D | null = null;

  /** 被弾演出のために複製した、このインスタンス専用のマテリアル */
  private readonly ownMaterials: THREE.MeshStandardMaterial[] = [];
  /** 上の各マテリアルの、光らせる前の発光色 */
  private readonly flashBase: THREE.Color[] = [];
  /** 被弾の色を戻すタイマー。続けて殴られたときに張り直す */
  private flashTimer: number | null = null;

  constructor(instance: Instance, pos: Vec2, facing: Dir = 4) {
    this.root = instance.root;
    this.mixer = instance.mixer;
    this.actions = instance.actions;
    this.setPosition(pos);
    this.yaw = this.targetYaw = yawOf(facing);
    this.root.rotation.y = this.yaw;
    this.play("idle");
  }

  setPosition(pos: Vec2): void {
    this.root.position.set(pos.x * TILE, 0, pos.y * TILE);
    this.from.copy(this.root.position);
    this.to.copy(this.root.position);
    this.moveElapsed = this.moveDuration = 0;
  }

  /** マスからマスへ移動させる。到着までのあいだ walk を流す */
  moveTo(from: Vec2, to: Vec2, duration: number): void {
    this.from.set(from.x * TILE, 0, from.y * TILE);
    this.to.set(to.x * TILE, 0, to.y * TILE);
    this.moveElapsed = 0;
    this.moveDuration = Math.max(0.001, duration);
    this.faceTowards(to.x - from.x, to.y - from.y);
    if (this.current !== "walk") this.play("walk");
  }

  face(dir: Dir): void {
    const delta = dirDelta(dir);
    this.faceTowards(delta.x, delta.y);
  }

  faceTowards(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;
    this.targetYaw = nearestAngle(this.yaw, Math.atan2(dx, dy));
  }

  /** 攻撃時に相手のほうへ少し踏み込む */
  lunge(dx: number, dy: number, distance = 0.28, duration = 0.26): void {
    const length = Math.hypot(dx, dy) || 1;
    this.lungeDir.set((dx / length) * distance, 0, (dy / length) * distance);
    this.lungeLeft = this.lungeTotal = duration;
  }

  play(name: ClipName, duration = 0): void {
    const action = this.actions.get(name);
    if (!action) return;
    if (this.current === name && !ONE_SHOT.has(name)) return;

    const previous = this.current ? this.actions.get(this.current) : undefined;
    action.reset();
    if (ONE_SHOT.has(name)) {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = name === "die";
      this.oneShotLeft = duration > 0 ? duration : action.getClip().duration;
    } else {
      action.setLoop(THREE.LoopRepeat, Number.POSITIVE_INFINITY);
      action.clampWhenFinished = false;
      this.oneShotLeft = 0;
    }
    action.enabled = true;
    action.setEffectiveWeight(1);
    action.fadeIn(0.09).play();
    if (previous && previous !== action) previous.fadeOut(0.09);
    this.current = name;
  }

  /**
   * 被弾を色で伝える。素材の色を一瞬だけ赤に寄せる。
   *
   * assets.instantiate は SkeletonUtils.clone を使っており、マテリアルは
   * 同じモデルのインスタンス全員(と、キャッシュしている元データ)で共有される。
   * そこへ直接書き込むと、1匹殴っただけで同じ種族が全員光り、しかも元の色を
   * 共有物から読むため、続けて殴られると「赤い状態」を元の色として覚えてしまい
   * 戻らなくなる。そこで、殴られたインスタンスだけが自前のマテリアルを持つ。
   */
  flash(scene: THREE.Scene): void {
    void scene;
    this.ensureOwnMaterials();
    if (this.flashTimer !== null) window.clearTimeout(this.flashTimer);
    for (const material of this.ownMaterials) {
      material.emissive.setRGB(0.75, 0.06, 0.06);
    }
    this.flashTimer = window.setTimeout(() => {
      this.flashTimer = null;
      for (let i = 0; i < this.ownMaterials.length; i++) {
        this.ownMaterials[i]!.emissive.copy(this.flashBase[i]!);
      }
    }, 130);
  }

  /**
   * このインスタンス専用のマテリアルを用意する(初回の被弾時だけ)。
   * 一度も殴られないものは共有のままなので、余計な複製は増えない。
   */
  private ensureOwnMaterials(): void {
    if (this.ownMaterials.length > 0) return;
    this.root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const replaced = materials.map((material) => {
        const standard = material as THREE.MeshStandardMaterial;
        if (!standard.emissive) return material;
        const own = standard.clone();
        this.ownMaterials.push(own);
        this.flashBase.push(own.emissive.clone());
        return own;
      });
      mesh.material = Array.isArray(mesh.material) ? replaced : replaced[0]!;
    });
  }

  /**
   * 頭上に抱えさせる。root の子にするので、歩いても向きを変えても付いてくる。
   * 外すときは null を渡すと、切り離したオブジェクトが返る。
   */
  setCarried(object: THREE.Object3D | null): THREE.Object3D | null {
    const previous = this.carried;
    if (previous) {
      // ワールド上の位置を保ったまま親から外す
      previous.getWorldPosition(previous.position);
      previous.removeFromParent();
    }
    this.carried = object;
    if (object) {
      object.position.set(0, 1.02, 0);
      object.rotation.set(0, 0, 0);
      object.scale.setScalar(0.78);
      this.root.add(object);
    }
    return previous;
  }

  get carriedObject(): THREE.Object3D | null {
    return this.carried;
  }

  get isMoving(): boolean {
    return this.moveElapsed < this.moveDuration;
  }

  update(dt: number): void {
    this.mixer?.update(dt);

    if (this.moveDuration > 0) {
      this.moveElapsed += dt;
      const t = Math.min(1, this.moveElapsed / this.moveDuration);
      // 出だしと止まりを少し緩める
      const eased = t * t * (3 - 2 * t);
      this.root.position.lerpVectors(this.from, this.to, eased);
      if (t >= 1) {
        this.moveDuration = 0;
        if (this.current === "walk") this.play("idle");
      }
    }

    if (this.lungeLeft > 0) {
      this.lungeLeft = Math.max(0, this.lungeLeft - dt);
      // 行って戻る山なりの動き
      const phase = 1 - this.lungeLeft / this.lungeTotal;
      const amount = Math.sin(phase * Math.PI);
      this.root.position.addScaledVector(this.lungeDir, amount);
    }

    this.yaw += (this.targetYaw - this.yaw) * (1 - Math.exp(-dt * 16));
    this.root.rotation.y = this.yaw;

    if (this.oneShotLeft > 0) {
      this.oneShotLeft -= dt;
      if (this.oneShotLeft <= 0 && this.current !== "die") this.play("idle");
    }
  }

  dispose(): void {
    this.mixer?.stopAllAction();
    if (this.flashTimer !== null) {
      window.clearTimeout(this.flashTimer);
      this.flashTimer = null;
    }
    // ジオメトリと素のマテリアルは SkeletonUtils.clone が全インスタンスで
    // 共有しているので捨ててはいけない。捨てるのは、このインスタンスのために
    // 作ったものだけ。
    for (const material of this.ownMaterials) material.dispose();
    this.ownMaterials.length = 0;
    this.flashBase.length = 0;
    // スケルトンはインスタンスごとに作られ、three はそこにボーン行列用の
    // テクスチャを1枚確保する。共有物ではないので、ここで捨てないと
    // 階を降りるたびにGPU側へ積み上がっていく(実測: 1階あたり約2.4枚)。
    this.root.traverse((obj) => {
      const skinned = obj as THREE.SkinnedMesh;
      if (skinned.isSkinnedMesh) skinned.skeleton?.dispose();
    });
    this.root.removeFromParent();
  }

  /**
   * 衣装(plan/costumes.md)。新しい3Dモデルは作らず、既存メッシュの
   * マテリアル色にRGB倍率を掛けるだけで色替えを表現する
   * (README記載の「かがやきの夢のかけら」の色替えと同じ発想)。
   * 生成直後の1回だけ呼ぶ想定(以後この見た目のまま使い切る)
   */
  applyTint(tint: readonly [number, number, number]): void {
    const [r, g, b] = tint;
    this.root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((m) => tintedMaterial(m, r, g, b))
        : tintedMaterial(mesh.material, r, g, b);
    });
  }
}

function tintedMaterial(material: THREE.Material, r: number, g: number, b: number): THREE.Material {
  const clone = material.clone() as THREE.Material & { color?: THREE.Color };
  clone.color?.multiply(new THREE.Color(r, g, b));
  return clone;
}

/** 盤面の方向をモデルの向き(Y軸回転)に直す */
export function yawOf(dir: Dir): number {
  const delta = dirDelta(dir);
  return Math.atan2(delta.x, delta.y);
}

/**
 * 現在の角度から見て一番近い等価な角度を返す。
 * 西を向いてから東を向くとき、ぐるりと遠回りしないようにするため。
 */
function nearestAngle(current: number, target: number): number {
  const twoPi = Math.PI * 2;
  let diff = (target - current) % twoPi;
  if (diff > Math.PI) diff -= twoPi;
  if (diff < -Math.PI) diff += twoPi;
  return current + diff;
}
