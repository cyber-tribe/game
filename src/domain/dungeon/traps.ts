import { chebyshev, eq, type Vec2 } from "../../core/grid";
import type { Actor, FloorState, Trap } from "../../core/types";
import { STATUS_POISON, STATUS_SLEEP } from "../../core/types";
import type { GameEvent } from "../../core/events";
import type { Rng } from "../../core/rng";
import type { PlayerState } from "../../entities/player";
import { addStatus } from "../item/effects";

/** 元素タル(plan/game/archive/barrel-arts.md): 風タルを頭上に持っていると、罠を踏んでも足取りが軽く、確率で発動しない(見つかりはする) */
const WIND_BARREL_CARRY_TRAP_SUPPRESS_CHANCE = 0.5;
/** 毒の罠(triggerTrap)の持続ターン */
const POISON_TRAP_TURNS = 8;
/** 第六地方(こだまの尾根)固有ギミック(plan/echoing-ridge.md)の物音アラートの範囲(チェビシェフ距離) */
const ECHO_ALERT_RANGE = 6;

export interface CheckTrapArgs {
  floor: FloorState;
  pos: Vec2;
  rng: Rng;
  player: PlayerState;
  depth: number;
  events: GameEvent[];
  damageActor(target: Actor, damage: number, critical: boolean): void;
  regionGimmickApplies(region: number): boolean;
  descend(): void;
}

/**
 * 第六地方(こだまの尾根)固有ギミック(plan/echoing-ridge.md): プレイヤーが
 * 攻撃する・罠を踏むなど物音を立てる行動を取るたびに、視界に関係なく
 * 周囲(チェビシェフ距離6)のモンスターをawareにする。既存のalarm罠
 * (階全体をawareにする)より弱い、範囲限定の効果として書き分ける
 */
export function alertNearbyMonsters(floor: FloorState, pos: Vec2, regionGimmickApplies: (region: number) => boolean): void {
  if (!regionGimmickApplies(6)) return;
  for (const actor of floor.actors) {
    if (actor.kind !== "monster" || !actor.alive) continue;
    if (chebyshev(actor.pos, pos) <= ECHO_ALERT_RANGE) actor.aware = true;
  }
}

function triggerTrap(trap: Trap, args: CheckTrapArgs): void {
  const { floor, rng, player, depth, events, damageActor, descend } = args;
  switch (trap.kind) {
    case "damage": {
      const damage = 4 + depth;
      events.push({ type: "message", text: `矢が飛んできた! ${damage}のダメージ!` });
      damageActor(player, damage, false);
      break;
    }
    case "sleep": {
      events.push({ type: "message", text: "眠りガスが噴き出した!" });
      addStatus({ rng, floor, player, events }, player, STATUS_SLEEP, 4, "眠ってしまった");
      break;
    }
    case "alarm": {
      events.push({ type: "message", text: "けたたましい音が鳴り響いた!" });
      for (const actor of floor.actors) {
        if (actor.kind === "monster" && actor.alive) actor.aware = true;
      }
      break;
    }
    case "pitfall": {
      events.push({ type: "message", text: "落とし穴だ!" });
      descend();
      break;
    }
    case "poison": {
      events.push({ type: "message", text: "毒の針が刺さった!" });
      addStatus({ rng, floor, player, events }, player, STATUS_POISON, POISON_TRAP_TURNS, "毒を受けた");
      break;
    }
  }
}

export function checkTrap(args: CheckTrapArgs): void {
  const { floor, pos, rng, player, events, regionGimmickApplies } = args;
  const trap = floor.traps.find((t) => eq(t.pos, pos));
  if (!trap) return;
  trap.revealed = true;
  events.push({ type: "trap", pos, kind: trap.kind });
  alertNearbyMonsters(floor, pos, regionGimmickApplies);
  // 元素タル(plan/game/archive/barrel-arts.md): 風タルを頭上に持っていると、
  // 罠を踏んでも足取りが軽く、確率で発動しない(見つかりはする)
  if (player.carrying?.kind === "wind" && rng.chance(WIND_BARREL_CARRY_TRAP_SUPPRESS_CHANCE)) {
    events.push({ type: "message", text: "足取りが軽く、罠をやり過ごした!" });
    return;
  }
  triggerTrap(trap, args);
}
