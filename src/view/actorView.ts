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

  /** 被弾を色で伝える。素材の色を一瞬だけ赤に寄せる */
  flash(scene: THREE.Scene): void {
    void scene;
    const meshes: THREE.Mesh[] = [];
    this.root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) meshes.push(obj as THREE.Mesh);
    });
    for (const mesh of meshes) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        const standard = material as THREE.MeshStandardMaterial;
        if (!standard.emissive) continue;
        const original = standard.emissive.clone();
        standard.emissive.setRGB(0.75, 0.06, 0.06);
        window.setTimeout(() => standard.emissive.copy(original), 130);
      }
    }
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
    this.root.removeFromParent();
  }
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
