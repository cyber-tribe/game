import * as THREE from "three";
import type { Assets } from "./assets";
import { ActorView } from "./actorView";
import { DungeonView } from "./dungeonMesh";
import { TILE } from "./renderer";
import type { GameEvent } from "../core/events";
import type { Actor, FloorState } from "../core/types";
import { tileAt } from "../core/types";
import { toWorld } from "./renderer";
import { BARREL_MODELS } from "../modelList";
import { speciesById } from "../entities/species";
import type { AudioPlayer } from "../audio/player";

/**
 * サウンド再生(plan/audio-playback.md)。ボスの予兆(bossTelegraph)は既存の
 * "message"イベントとして流れてくるだけなので、専用のイベント種別を増やさず、
 * game.ts側が組み立てる文言の末尾の記号だけで判定する
 */
const BOSS_TELEGRAPH_MESSAGE_SUFFIX = "――!";

/** 1マス動くのにかける時間。短いほどきびきびするが、短すぎると何が起きたか読めない */
export const MOVE_TIME = 0.15;
export const ATTACK_TIME = 0.34;
export const DIE_TIME = 0.55;
/** 移動キーを押しっぱなしにしているときの倍率 */
export const HURRY = 0.45;

export interface DamageFx {
  world: THREE.Vector3;
  amount: number;
  critical: boolean;
  heal: boolean;
}

/**
 * applyEventsがGameEventの種別ごとに見た目・サウンドを反映するための表。
 * 戻り値は、そのイベントぶん入力を止めておく秒数(ロック時間)。
 * events.tsに新しい種別を追加すると、ここに対応するキーが無い限り
 * typecheckが検出する。見た目・サウンドに影響しない種別は、
 * no-opとして明示する(以前はswitchのdefault:breakで暗黙に無視していた)
 */
type StageEventHandlers = {
  [K in GameEvent["type"]]: (event: Extract<GameEvent, { type: K }>) => number;
};

/** 投げたタルや爆発など、その場かぎりの見せ物 */
interface Effect {
  object: THREE.Object3D;
  elapsed: number;
  duration: number;
  /** 0〜1 の進み具合を受け取って見た目を更新する */
  step: (object: THREE.Object3D, t: number) => void;
}

/**
 * 盤面の見た目をまとめて受け持つ。
 *
 * コアが返した GameEvent の並びを受け取り、対応するアクターに移動や
 * アニメーションを割り当てる。1ターンぶんのイベントは同時に走らせ、
 * 一番長いものが終わるまでを「入力を受け付けない時間」として返す。
 */
export class Stage {
  readonly dungeon: DungeonView;
  private readonly views = new Map<number, ActorView>();
  /** 倒れて消える途中のアクター。消えるまで views から外さない */
  private readonly dying = new Map<number, number>();
  /**
   * 各アクターの手に今つけている武器モデル名(plan/equipped-weapon-visual.md)。
   * 未装備(素手)は null。actor.equippedWeaponModel との差分だけを見て
   * つけ替えるための控え
   */
  private readonly weaponModelByActor = new Map<number, string | null>();
  private readonly actorRoot = new THREE.Group();

  /** 被弾表示。HUD 側が毎フレーム拾って画面に出す */
  readonly damageQueue: DamageFx[] = [];

  private readonly effects: Effect[] = [];
  private readonly effectRoot = new THREE.Group();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly assets: Assets,
    private readonly audio: AudioPlayer,
  ) {
    this.scene.add(this.actorRoot);
    this.scene.add(this.effectRoot);
    this.dungeon = new DungeonView(scene, assets);
  }

  enterFloor(floor: FloorState): void {
    for (const view of this.views.values()) view.dispose();
    this.views.clear();
    this.dying.clear();
    this.weaponModelByActor.clear();
    this.actorRoot.clear();
    for (const fx of this.effects) fx.object.removeFromParent();
    this.effects.length = 0;
    this.effectRoot.clear();
    this.dungeon.build(floor);
    this.syncActors(floor);
  }

  /** フロアにいるアクターと表示物の対応を取り直す */
  syncActors(floor: FloorState): void {
    const present = new Set<number>();
    for (const actor of floor.actors) {
      if (!actor.alive) continue;
      present.add(actor.id);
      if (!this.views.has(actor.id)) {
        // モデルは起動時に一部だけ読み、残りは背景で追いかけている
        // (src/modelList.ts の essentialModelNames 参照)。まだ届いていない
        // ものはこの回を飛ばす。syncActors は毎ターン呼ばれるので、届いた
        // 次のターンにここで拾われる
        if (!this.assets.has(actor.model)) {
          this.assets.loadInBackground([actor.model]);
          continue;
        }
        // 小ネタ・遊び心(plan/flavor-and-dialogue.md): 種族ごとの待機仕草の再生速度
        // (speciesIdを持てるのはmonster/allyだけ)
        const speciesId = actor.kind === "monster" || actor.kind === "ally" ? actor.speciesId : undefined;
        const idleSpeedMul = speciesId ? (speciesById(speciesId).idleSpeedMul ?? 1) : 1;
        const view = new ActorView(this.assets.instantiate(actor.model), actor.pos, actor.facing, idleSpeedMul);
        this.actorRoot.add(view.root);
        this.views.set(actor.id, view);
      }
      this.syncWeapon(actor);
    }
    for (const [id, view] of this.views) {
      if (present.has(id) || this.dying.has(id)) continue;
      view.dispose();
      this.views.delete(id);
      this.weaponModelByActor.delete(id);
    }
    this.updateActorVisibility(floor);
  }

  /**
   * 装備中の武器モデルを手に追従させる(plan/equipped-weapon-visual.md)。
   * syncActors は毎ターン呼ばれるので、equip・drop・売却などによる
   * actor.equippedWeaponModel の変化はここで拾われる
   */
  private syncWeapon(actor: Actor): void {
    const view = this.views.get(actor.id);
    if (!view) return;
    const wanted = actor.equippedWeaponModel ?? null;
    if (this.weaponModelByActor.get(actor.id) === wanted) return;
    if (wanted !== null && !this.assets.has(wanted)) {
      this.assets.loadInBackground([wanted]);
      return;
    }
    view.setWeapon(wanted !== null ? this.assets.instantiate(wanted).root : null);
    this.weaponModelByActor.set(actor.id, wanted);
  }

  /** 見えていないマスのモンスターは描かない */
  updateActorVisibility(floor: FloorState): void {
    for (const actor of floor.actors) {
      const view = this.views.get(actor.id);
      if (!view) continue;
      if (actor.kind === "player") {
        view.root.visible = true;
        continue;
      }
      view.root.visible = tileAt(floor, actor.pos)?.visible ?? false;
    }
  }

  viewOf(actorId: number): ActorView | undefined {
    return this.views.get(actorId);
  }

  worldOf(actorId: number): THREE.Vector3 | null {
    const view = this.views.get(actorId);
    return view ? view.root.position.clone() : null;
  }

  /**
   * 1ターンぶんのイベントを見た目に反映し、入力を止めておくべき秒数を返す。
   * イベントは順番にではなく同時に走らせる。そうしないとモンスターが増えるほど
   * 1ターンが長くなり、遊べたものではなくなる。
   *
   * @param messageSpeedScale メッセージ速度(plan/settings-screen.md)。専用の
   *   文字送り演出は無いため、既存のこの再生速度そのものを基準値として流用する
   */
  applyEvents(
    events: readonly GameEvent[],
    floor: FloorState,
    hurry: boolean,
    messageSpeedScale = 1,
  ): number {
    const scale = (hurry ? HURRY : 1) * messageSpeedScale;
    const handlers = this.buildEventHandlers(floor, scale);
    let lock = 0;
    for (const event of events) {
      const handler = handlers[event.type] as (event: GameEvent) => number;
      lock = Math.max(lock, handler(event));
    }
    return lock;
  }

  private buildEventHandlers(floor: FloorState, scale: number): StageEventHandlers {
    const noop = (): number => 0;
    return {
      move: (event) => {
        const view = this.views.get(event.actorId);
        if (!view) return 0;
        view.moveTo(event.from, event.to, MOVE_TIME * scale);
        return MOVE_TIME * scale;
      },
      bump: (event) => {
        this.views.get(event.actorId)?.faceTowards(event.dir.x, event.dir.y);
        return 0;
      },
      face: (event) => {
        this.views.get(event.actorId)?.face(event.dir);
        return 0;
      },
      attack: (event) => {
        const attacker = this.views.get(event.attackerId);
        const target = floor.actors.find((a) => a.id === event.targetId);
        if (attacker && target) {
          const source = floor.actors.find((a) => a.id === event.attackerId);
          if (source) {
            attacker.faceTowards(target.pos.x - source.pos.x, target.pos.y - source.pos.y);
            attacker.lunge(target.pos.x - source.pos.x, target.pos.y - source.pos.y);
          }
          attacker.play("attack", ATTACK_TIME * scale);
        }
        return ATTACK_TIME * scale;
      },
      damage: (event) => {
        const view = this.views.get(event.actorId);
        if (view) {
          view.play("hit", 0.3 * scale);
          view.flash(this.scene);
          this.damageQueue.push({
            world: view.root.position.clone().setY(1.05),
            amount: event.amount,
            critical: event.critical,
            heal: false,
          });
        }
        return ATTACK_TIME * scale;
      },
      heal: (event) => {
        const view = this.views.get(event.actorId);
        if (view && event.amount > 0) {
          this.damageQueue.push({
            world: view.root.position.clone().setY(1.05),
            amount: event.amount,
            critical: false,
            heal: true,
          });
        }
        return 0;
      },
      miss: noop,
      die: (event) => {
        const view = this.views.get(event.actorId);
        if (view) {
          view.play("die", DIE_TIME);
          this.dying.set(event.actorId, DIE_TIME);
        }
        return 0;
      },
      spawn: noop,
      status: noop,
      statusEnd: noop,
      // ---- サウンド再生(plan/audio-playback.md)。見た目には影響しないSFXだけの分岐 ----
      levelUp: () => {
        this.audio.playSfx("levelUp");
        return 0;
      },
      pickup: noop,
      drop: noop,
      useItem: noop,
      throwItem: () => 0.24 * scale,
      equip: noop,
      trap: noop,
      teleport: (event) => {
        this.views.get(event.actorId)?.setPosition(event.to);
        return 0.2;
      },
      swap: (event) => {
        const a = floor.actors.find((x) => x.id === event.aId);
        const b = floor.actors.find((x) => x.id === event.bId);
        if (a) this.views.get(event.aId)?.setPosition(a.pos);
        if (b) this.views.get(event.bId)?.setPosition(b.pos);
        return 0.2;
      },
      // ---- タル ----
      liftBarrel: (event) => {
        const view = this.views.get(event.actorId);
        if (!view) return 0;
        // 床に出ていたタルがあればそれを引き取り、無ければ作って頭上に載せる
        const existing = this.dungeon.detachBarrel(event.barrelId);
        view.setCarried(existing ?? this.assets.instantiate(BARREL_MODELS[event.kind]).root);
        return 0.22 * scale;
      },
      putBarrel: (event) => {
        const view = this.views.get(event.actorId);
        const removed = view?.setCarried(null);
        removed?.removeFromParent();
        return 0.22 * scale;
      },
      throwBarrel: (event) => {
        const view = this.views.get(event.actorId);
        const flying = view?.setCarried(null);
        if (flying) this.launchBarrel(flying, event.from, event.to, 0.30 * scale);
        return 0.34 * scale;
      },
      barrelBreak: noop,
      explosion: (event) => {
        this.spawnExplosion(event.pos, event.radius);
        this.audio.playSfx("explosion");
        return 0.42 * scale;
      },
      capture: () => {
        this.audio.playSfx("capture");
        return 0;
      },
      captureFailed: noop,
      recruit: noop,
      descend: noop,
      checkpoint: () => {
        this.audio.playSfx("checkpoint");
        return 0;
      },
      hungerWarning: (event) => {
        if (event.level === "empty") this.audio.playSfx("hungerWarning");
        return 0;
      },
      gameOver: noop,
      message: (event) => {
        if (event.text.endsWith(BOSS_TELEGRAPH_MESSAGE_SUFFIX)) this.audio.playSfx("bossTelegraph");
        return 0;
      },
      tutorialTip: noop,
      monsterSighted: noop,
      secretPassageFound: noop,
      crackWarning: noop,
      mountainCoreCleared: noop,
      trueAwakeningCleared: noop,
      tarukurabeFinished: noop,
    };
  }

  /** 投げたタルを放物線で飛ばす。着地したら消え、盤面側のタルに引き継がれる */
  private launchBarrel(
    object: THREE.Object3D,
    from: { x: number; y: number },
    to: { x: number; y: number },
    duration: number,
  ): void {
    const start = toWorld(from, 0.9);
    const end = toWorld(to, 0.12);
    const arc = 0.9 + Math.hypot(to.x - from.x, to.y - from.y) * 0.12;

    object.position.copy(start);
    object.scale.setScalar(0.78);
    this.effectRoot.add(object);

    this.effects.push({
      object,
      elapsed: 0,
      duration,
      step: (obj, t) => {
        obj.position.lerpVectors(start, end, t);
        // 山なりの高さを足す。まっすぐ滑らせるより投げた感じが出る
        obj.position.y += Math.sin(t * Math.PI) * arc;
        obj.rotation.x = t * Math.PI * 2.2;
        obj.rotation.z = t * Math.PI * 1.3;
      },
    });
  }

  private spawnExplosion(pos: { x: number; y: number }, radius: number): void {
    const geometry = new THREE.SphereGeometry(1, 20, 14);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffb04a,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const ball = new THREE.Mesh(geometry, material);
    ball.position.copy(toWorld(pos, 0.5));
    this.effectRoot.add(ball);

    const maxRadius = (radius + 0.5) * 1.15;
    this.effects.push({
      object: ball,
      elapsed: 0,
      duration: 0.42,
      step: (obj, t) => {
        obj.scale.setScalar(0.2 + maxRadius * t);
        material.opacity = 0.9 * (1 - t) ** 1.6;
      },
    });
  }

  update(dt: number, time: number): void {
    for (const view of this.views.values()) view.update(dt);
    this.dungeon.animate(time);

    // その場かぎりの見せ物。終わったら片付ける
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const fx = this.effects[i]!;
      fx.elapsed += dt;
      const t = Math.min(1, fx.elapsed / fx.duration);
      fx.step(fx.object, t);
      if (t >= 1) {
        fx.object.removeFromParent();
        disposeTree(fx.object);
        this.effects.splice(i, 1);
      }
    }

    for (const [id, left] of this.dying) {
      const remaining = left - dt;
      if (remaining <= 0) {
        this.dying.delete(id);
        const view = this.views.get(id);
        if (view) {
          view.dispose();
          this.views.delete(id);
        }
      } else {
        this.dying.set(id, remaining);
      }
    }
  }

  /** プレイヤーの現在の描画位置。カメラの追従に使う */
  playerWorld(player: Actor): THREE.Vector3 {
    const view = this.views.get(player.id);
    if (view) return view.root.position;
    return new THREE.Vector3(player.pos.x * TILE, 0, player.pos.y * TILE);
  }
}

/** 使い終わったエフェクトのジオメトリとマテリアルを解放する */
function disposeTree(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) material.dispose();
  });
}
