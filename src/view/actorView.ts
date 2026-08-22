import * as THREE from "three";
import type { Instance } from "./assets";
import { TILE } from "./renderer";
import { type Dir, type Vec2, dirDelta } from "../core/grid";

/**
 * `talk`だけは村人専用(`src/modelList.ts`の`VILLAGER_CLIPS`)。村人は
 * 戦わないのでidle/talkの2本しか持たず、逆にモンスター・主人公はtalkを
 * 持たない。`play()`はクリップが無ければ黙って何もしないので、どちらの
 * モデルへ渡しても壊れない
 */
export type ClipName = "idle" | "walk" | "attack" | "hit" | "die" | "talk";

/**
 * 一度きり再生して`idle`へ戻るクリップ。`talk`をここに入れてあるのは、
 * 建物に入った一拍だけ村人が応える演出(plan/game/village-interiors.md)の
 * ためで、話し続けさせたいわけではないから
 */
const ONE_SHOT: ReadonlySet<ClipName> = new Set(["attack", "hit", "die", "talk"]);

/**
 * 接地影(ブロブシャドウ、plan/game/archive/rim-light-and-contact-shadow.md)。
 * ジオメトリ・テクスチャ・マテリアルは形状・見た目に個体差が無いので、
 * 全アクターで共有する(サイズはmesh.scaleで個体ごとに変える)。共有物なので
 * ActorView.dispose()では破棄しない。
 *
 * `document`が無いテスト環境(vitestのnode環境、tests/actor-view-*.test.ts
 * 参照)では初回アクセス時にnullを返し、影を出さないだけにする。
 */
const CONTACT_SHADOW_GEOMETRY = new THREE.PlaneGeometry(1, 1);
let contactShadowMaterial: THREE.MeshBasicMaterial | null = null;

function getContactShadowMaterial(): THREE.MeshBasicMaterial | null {
  if (contactShadowMaterial) return contactShadowMaterial;
  if (typeof document === "undefined") return null;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, size / 16,
    size / 2, size / 2, size / 2,
  );
  gradient.addColorStop(0, "rgba(0,0,0,0.45)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  contactShadowMaterial = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  return contactShadowMaterial;
}

/**
 * モデルのバウンディングボックス(XZ)から、体格に応じた接地影を1枚作る。
 * `root`にまだ位置・回転が乗っていない(コンストラクタの一番最初で呼ぶ)
 * 前提で、AABBがモデル本来の footprint をそのまま表すようにする。
 */
function createContactShadow(root: THREE.Object3D): THREE.Mesh | null {
  const material = getContactShadowMaterial();
  if (!material) return null;
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return null;
  const footprint = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 1.15;
  if (!(footprint > 0)) return null;
  const mesh = new THREE.Mesh(CONTACT_SHADOW_GEOMETRY, material);
  mesh.scale.set(footprint, footprint, 1);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.01; // 床とのZファイティング回避
  mesh.renderOrder = 1; // 床の後に描く
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

/**
 * 装備した武器を追従させるボーン(plan/equipped-weapon-visual.md)。
 * tools/models/common.py の bone_name(parent, child) の命名規則により、
 * "elbow.R-hand.R" は原点が肘・ローカルY+方向が手側にあたる(garudo.glb限定)
 */
const WEAPON_BONE_NAME = "elbow.R-hand.R";

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
  /**
   * 今フレームの表示位置に足している踏み込みオフセット。毎フレーム
   * いったん取り除いてから掛け直す。以前はroot.positionへ毎フレーム
   * 加算するだけで前フレームぶんを戻していなかったため、攻撃のたびに
   * 攻撃方向へ2〜3マスぶん表示位置が恒久的にずれていた(#372の再発報告の
   * 根本原因。プレイヤー・モンスターどちらの攻撃でも起きる)
   */
  private readonly lungeApplied = new THREE.Vector3();
  /**
   * スメア(残像変形、plan/models/toon-advanced-techniques.md施策E-1)。
   * 攻撃の踏み込み(lunge)の立ち上がり(最も速い瞬間)だけ、進行方向へ
   * 極端に伸ばして手描きアニメの「線が流れる」速さを出す。骨ではなく
   * ルート1個のスケールだけで済ませるので、全種族に共通で効く。
   * `lungeTotal`に対する比率で「立ち上がりの何割か」を決めるので、
   * lunge()のdurationが変わっても常に立ち上がり付近だけに掛かる
   */
  private static readonly SMEAR_PHASE_WINDOW = 0.18;
  private static readonly SMEAR_STRETCH = 1.35;
  private static readonly SMEAR_SQUASH = 0.85;

  /** 頭上に抱えているもの。タルを持ち上げているあいだ付いてまわる */
  private carried: THREE.Object3D | null = null;

  /** 装備中の武器(plan/equipped-weapon-visual.md)。素手なら null */
  private weapon: THREE.Object3D | null = null;

  /** 被弾演出のために複製した、このインスタンス専用のマテリアル */
  private readonly ownMaterials: THREE.MeshStandardMaterial[] = [];
  /** 上の各マテリアルの、光らせる前の発光色 */
  private readonly flashBase: THREE.Color[] = [];
  /** 被弾の色を戻すタイマー。続けて殴られたときに張り直す */
  private flashTimer: number | null = null;

  /**
   * 小ネタ・遊び心(plan/flavor-and-dialogue.md)。待機仕草(idle)の
   * 再生速度に掛ける倍率。新規クリップは作らず、既存のidleの再生速度
   * だけで種族ごとの個性を出す
   */
  private readonly idleSpeedMul: number;
  /**
   * 歩行(walk)の再生速度に掛ける倍率(plan/models/archive/
   * garudo-walk-motion.md)。ダンジョンは1マス移動の補間なので等倍のまま
   * (既定値1)でよいが、村なか歩きは実際の移動速度(`VILLAGE_MOVE_SPEED`)
   * に対してクリップの歩幅が合っていないと足が地面を滑って見えるため、
   * 村の主人公のActorViewだけこの倍率を渡して再生速度を移動速度に同期させる
   */
  private readonly walkSpeedMul: number;

  constructor(instance: Instance, pos: Vec2, facing: Dir = 4, idleSpeedMul = 1, walkSpeedMul = 1) {
    this.root = instance.root;
    this.mixer = instance.mixer;
    this.actions = instance.actions;
    this.idleSpeedMul = idleSpeedMul;
    this.walkSpeedMul = walkSpeedMul;
    // 位置・回転を乗せる前に測る(AABBがモデル本来のfootprintのままになる)
    const contactShadow = createContactShadow(this.root);
    if (contactShadow) this.root.add(contactShadow);
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
    // 位置を絶対値で置き直したので、適用済みの踏み込みオフセットの控えも捨てる
    // (残したままだと、次のupdate()が古いオフセットを引いて逆方向へずれる)
    this.lungeApplied.set(0, 0, 0);
  }

  /**
   * マスからマスへ移動させる。到着までのあいだ walk を流す。
   *
   * 開始点は event.from を鵜呑みにせず、常に現在の表示位置(root.position)を
   * 使う。1ターンの中で同じアクターに move イベントが2回続くこと(押し出し
   * 直後にそのモンスター自身のAI行動が動く、奔流タイルで連続して押し流される
   * 等)があり、applyEvents は同じ tick 内でイベントを順番に処理するため
   * 描画が一度も挟まらない。event.from をそのまま信じると1回目の移動区間が
   * まるごと飛ばされ、2回目の開始点(1回目の終点)へ表示が瞬間移動してから
   * 動き出して見えてしまう(#372)。現在位置を起点にすれば、複数回呼ばれても
   * 常に「今表示されている場所」から滑らかにつながる
   */
  moveTo(from: Vec2, to: Vec2, duration: number): void {
    // 踏み込み中に移動が始まる場合、root.positionには踏み込みオフセットが
    // 乗っている。オフセットはupdate()が毎フレーム引き直して掛け直すため、
    // 開始点には乗せる前の素の位置を控える(乗せたままだと二重掛けになる)
    this.from.copy(this.root.position).sub(this.lungeApplied);
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
    action.timeScale = name === "idle" ? this.idleSpeedMul : name === "walk" ? this.walkSpeedMul : 1;
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
   *
   * 頭上に抱えているタル(this.carried)は root の子だが、痛がる主体では
   * ないので走査から外す(#684: タルを持ったまま被弾すると、キャラ本体
   * と一緒にタルのマテリアルまで複製・赤発光してしまっていた)。走査の
   * あいだだけ root から一時的に外し、終わったら元の位置に戻す
   */
  private ensureOwnMaterials(): void {
    if (this.ownMaterials.length > 0) return;
    const carried = this.carried;
    if (carried) carried.removeFromParent();
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
    if (carried) this.root.add(carried);
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

  /**
   * 装備中の武器を右手のボーンに追従させる。null を渡すと素手に戻す。
   *
   * 武器モデルは店・持ち物メニューと共通の既存アセットをそのまま流用しており
   * (plan/equipped-weapon-visual.md)、「手」そのものを指す専用ノードは
   * モデル側に無い。ボーンの原点(肘)から手側へ、ボーン自身の長さ(0.135)より
   * やや手前の位置にオフセットする形で見積もっている。回転は、モデルに焼き込まれた
   * 「床に浮かせて見せる」向き(GLBノードの transform)を打ち消し、ボーン自身の
   * 姿勢(前腕方向)にモデルの元の姿勢をそのまま重ねる形にした。ヘッドレスbrowserで
   * idle/attack両方のスクリーンショットを確認し、明らかな貫通・浮遊は無いことを
   * 見た上でscale/position(0.55倍、肘から0.06)に調整したが、実機での最終確認は
   * していない。同じローカル回転をどのクリップでも固定で使うため、クリップごとの
   * 前腕の向きによって見え方の自然さに多少の差が出る(plan参照、既知の限界)
   */
  setWeapon(object: THREE.Object3D | null): void {
    this.weapon?.removeFromParent();
    this.weapon = object;
    if (!object) return;
    const hand = this.root.getObjectByName(WEAPON_BONE_NAME) ?? this.root;
    object.position.set(0, 0.06, 0);
    object.rotation.set(Math.PI / 2, 0, 0);
    object.scale.setScalar(0.55);
    hand.add(object);
  }

  get isMoving(): boolean {
    return this.moveElapsed < this.moveDuration;
  }

  update(dt: number): void {
    this.mixer?.update(dt);

    // 前フレームで足した踏み込みオフセットをまず取り除き、素の位置に戻す
    // (移動中はlerpが位置を丸ごと上書きするので、この減算は無害)。
    // 取り除かずに毎フレーム加算すると、踏み込みが「行って戻る」にならず
    // 攻撃のたびに表示位置が恒久的にずれていく
    this.root.position.sub(this.lungeApplied);
    this.lungeApplied.set(0, 0, 0);

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
      this.lungeApplied.copy(this.lungeDir).multiplyScalar(amount);
      this.root.position.add(this.lungeApplied);

      // スメア: 踏み込みの立ち上がり(最速の瞬間)だけ進行方向(ローカルZ、
      // glTF書き出し後の正面軸)へ伸ばす。faceTowards()が直前に向きを
      // 合わせている前提(stage.tsのattackハンドラの呼び出し順)
      if (phase < ActorView.SMEAR_PHASE_WINDOW) {
        const smearT = 1 - phase / ActorView.SMEAR_PHASE_WINDOW;
        const stretch = 1 + (ActorView.SMEAR_STRETCH - 1) * smearT;
        const squash = 1 - (1 - ActorView.SMEAR_SQUASH) * smearT;
        this.root.scale.set(squash, squash, stretch);
      } else {
        this.root.scale.set(1, 1, 1);
      }
    } else if (this.root.scale.x !== 1 || this.root.scale.z !== 1) {
      this.root.scale.set(1, 1, 1);
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
