import * as THREE from "three";
import type { Assets } from "./assets";
import { ActorView } from "./actorView";
import { DungeonView } from "./dungeonMesh";
import { TILE } from "./renderer";
import type { GameEvent } from "../core/events";
import type { Actor, FloorState } from "../core/types";
import { tileAt } from "../core/types";

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
  private readonly actorRoot = new THREE.Group();

  /** 被弾表示。HUD 側が毎フレーム拾って画面に出す */
  readonly damageQueue: DamageFx[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly assets: Assets,
  ) {
    this.scene.add(this.actorRoot);
    this.dungeon = new DungeonView(scene, assets);
  }

  enterFloor(floor: FloorState): void {
    for (const view of this.views.values()) view.dispose();
    this.views.clear();
    this.dying.clear();
    this.actorRoot.clear();
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
        const view = new ActorView(this.assets.instantiate(actor.model), actor.pos, actor.facing);
        this.actorRoot.add(view.root);
        this.views.set(actor.id, view);
      }
    }
    for (const [id, view] of this.views) {
      if (present.has(id) || this.dying.has(id)) continue;
      view.dispose();
      this.views.delete(id);
    }
    this.updateActorVisibility(floor);
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
   */
  applyEvents(events: readonly GameEvent[], floor: FloorState, hurry: boolean): number {
    const scale = hurry ? HURRY : 1;
    let lock = 0;

    for (const event of events) {
      switch (event.type) {
        case "move": {
          const view = this.views.get(event.actorId);
          if (!view) break;
          view.moveTo(event.from, event.to, MOVE_TIME * scale);
          lock = Math.max(lock, MOVE_TIME * scale);
          break;
        }
        case "bump": {
          const view = this.views.get(event.actorId);
          view?.faceTowards(event.dir.x, event.dir.y);
          break;
        }
        case "attack": {
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
          lock = Math.max(lock, ATTACK_TIME * scale);
          break;
        }
        case "damage": {
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
          lock = Math.max(lock, ATTACK_TIME * scale);
          break;
        }
        case "heal": {
          const view = this.views.get(event.actorId);
          if (view && event.amount > 0) {
            this.damageQueue.push({
              world: view.root.position.clone().setY(1.05),
              amount: event.amount,
              critical: false,
              heal: true,
            });
          }
          break;
        }
        case "die": {
          const view = this.views.get(event.actorId);
          if (view) {
            view.play("die", DIE_TIME);
            this.dying.set(event.actorId, DIE_TIME);
          }
          break;
        }
        case "swap": {
          const a = floor.actors.find((x) => x.id === event.aId);
          const b = floor.actors.find((x) => x.id === event.bId);
          if (a) this.views.get(event.aId)?.setPosition(a.pos);
          if (b) this.views.get(event.bId)?.setPosition(b.pos);
          lock = Math.max(lock, 0.2);
          break;
        }
        case "teleport": {
          const view = this.views.get(event.actorId);
          view?.setPosition(event.to);
          lock = Math.max(lock, 0.2);
          break;
        }
        case "throwItem":
          lock = Math.max(lock, 0.24 * scale);
          break;
        default:
          break;
      }
    }
    return lock;
  }

  update(dt: number, time: number): void {
    for (const view of this.views.values()) view.update(dt);
    this.dungeon.animate(time);

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
