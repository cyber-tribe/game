import type { Dir, Vec2 } from "../../core/grid";
import { chebyshev } from "../../core/grid";
import type { Actor, Barrel, FloorState, MonsterActor, RunSkillId } from "../../core/types";
import { roomContains, tileAt } from "../../core/types";
import type { GameEvent } from "../../core/events";
import type { Rng } from "../../core/rng";
import type { OncePerRunTracker } from "../../core/oncePerRunTracker";
import type { PlayerState } from "../../entities/player";
import type { EffectContext } from "../item/effects";
import { computeDamage } from "../combat/damageCalculation";
import { barrelThrowDamage, mitigateIncomingDamage } from "../combat/damageModifier";
import { displayActorName } from "../../entities/naming";
import { barrelDisplayName } from "../../entities/displayNames";
import { STONE_BARREL_DAMAGE_MULTIPLIER } from "./barrelElemental";
import { LIGHT_BARREL_OPEN_TURNS, openSleepBarrel, openWaterBarrel, openWindBarrel } from "./barrelOpen";
import { releaseFromBarrel } from "./barrelDrop";

/** 爆発タルの威力と巻き込む範囲 */
export const BOMB_DAMAGE = 22;
export const BOMB_RADIUS = 1;

export interface ExplodeArgs {
  floor: FloorState;
  rng: Rng;
  center: Vec2;
  events: GameEvent[];
  throwerId?: number;
  damageActor(target: Actor, damage: number, critical: boolean): void;
  isPlaying(): boolean;
}

/**
 * 爆発。中心とその周囲にいるものをまとめて巻き込む。
 *
 * 投げた本人だけはダメージを半分にしている。飛距離は壁までなので、
 * 狭い通路では真横に落ちることがあり、満タンから一撃で倒れてしまうと
 * 理不尽に感じる。半分でも十分痛いので、危険であることは伝わる。
 */
export function explode(args: ExplodeArgs): void {
  const { floor, rng, center, events, throwerId, damageActor, isPlaying } = args;
  events.push({ type: "explosion", pos: center, radius: BOMB_RADIUS });
  events.push({ type: "message", text: "タルが爆発した!" });

  const caught = floor.actors.filter((a) => a.alive && chebyshev(a.pos, center) <= BOMB_RADIUS);
  for (const actor of caught) {
    const result = computeDamage(rng, BOMB_DAMAGE, actor.def);
    const isThrower = actor.id === throwerId;
    const damage = isThrower ? Math.max(1, Math.floor(result.damage / 2)) : result.damage;
    events.push({
      type: "message",
      text: isThrower
        ? `巻き込まれた! ${displayActorName(actor)}に${damage}のダメージ!`
        : `${displayActorName(actor)}に${damage}のダメージ!`,
    });
    damageActor(actor, damage, result.critical);
    if (!isPlaying()) return;
  }

  // 巻き込まれたタルは誘爆させず、その場で壊れるだけにしておく。
  // 連鎖させると1発で階が壊滅しかねない
  const destroyed = floor.barrels.filter((b) => chebyshev(b.pos, center) <= BOMB_RADIUS);
  for (const barrel of destroyed) {
    events.push({ type: "barrelBreak", barrelId: barrel.id, pos: barrel.pos });
  }
  floor.barrels = floor.barrels.filter((b) => chebyshev(b.pos, center) > BOMB_RADIUS);

  // 第三地方(まどろみの茸林)固有ギミック(plan/spore-grove.md): 爆心の部屋の
  // 胞子を吹き飛ばして無効化する(そのフロア滞在中は解除されたまま)
  const room = floor.rooms.find((r) => roomContains(r, center));
  if (room?.spored) room.spored = false;

  // 第三地方ボス(plan/region-boss-oomadoromi.md): 爆心と同じ部屋に予兆中の
  // ボスがいれば、大技を解除する(クールダウンはそのまま消費済み扱い)
  if (room) {
    const chargingBoss = floor.actors.find(
      (a): a is MonsterActor => a.alive && a.kind === "monster" && !!a.telegraphCharge && roomContains(room, a.pos),
    );
    if (chargingBoss) {
      chargingBoss.telegraphCharge = false;
      events.push({ type: "message", text: "大技の気配が霧散した!" });
      // 地方ボス(plan/region-boss-horikuinonushi.md): 解除時、発動しないまま
      // 残り続けてしまう部屋内のひび割れ予告も一緒に消す
      for (let y = room.y; y < room.y + room.h; y++) {
        for (let x = room.x; x < room.x + room.w; x++) {
          const tile = tileAt(floor, { x, y });
          if (tile) tile.crackWarning = false;
        }
      }
    }
  }
}

export interface BurstBarrelArgs {
  floor: FloorState;
  rng: Rng;
  player: PlayerState;
  runSkills: RunSkillId[];
  oncePerRun: OncePerRunTracker;
  partyGuardTurns: number;
  barrel: Barrel;
  events: GameEvent[];
  throwerId: number;
  effectCtx: EffectContext;
  isPlaying(): boolean;
  damageActor(target: Actor, damage: number, critical: boolean): void;
  pushMonster(dir: Dir, target: Actor, events: GameEvent[]): boolean;
  recruitFromBarrel(barrel: Barrel, landing: Vec2): void;
  setLightBarrelTurns(turns: number): void;
}

/**
 * スキル「タルやぶり」。置かれたタルを攻撃で割り、中身の効果を発揮させる。
 * 爆発タル・モンスター入りタルは従来どおり(自爆・解放)、元素タルは
 * その場であける効果(openCarriedBarrelの各効果)を発揮する。からのタルは
 * ただ壊れるだけ
 */
export function burstBarrel(args: BurstBarrelArgs): void {
  const {
    floor,
    rng,
    player,
    runSkills,
    oncePerRun,
    partyGuardTurns,
    barrel,
    events,
    throwerId,
    effectCtx,
    isPlaying,
    damageActor,
    pushMonster,
    recruitFromBarrel,
    setLightBarrelTurns,
  } = args;

  events.push({ type: "message", text: `${barrelDisplayName(barrel)}を割った!` });
  floor.barrels = floor.barrels.filter((b) => b.id !== barrel.id);
  events.push({ type: "barrelBreak", barrelId: barrel.id, pos: barrel.pos });

  switch (barrel.kind) {
    case "bomb":
      explode({ floor, rng, center: barrel.pos, events, throwerId, damageActor, isPlaying });
      return;
    case "caught":
      releaseFromBarrel({ floor, rng, barrel, landing: barrel.pos, events, recruitFromBarrel });
      return;
    case "water":
      openWaterBarrel(floor, barrel.pos, barrel.enhanced ?? false, events);
      return;
    case "wind":
      openWindBarrel({ floor, center: barrel.pos, events, pushMonster });
      return;
    case "light":
      setLightBarrelTurns(barrel.enhanced ? LIGHT_BARREL_OPEN_TURNS + 2 : LIGHT_BARREL_OPEN_TURNS);
      return;
    case "stone":
      // 割れた壁を作るのは筋が通らないので、代わりに直下の敵へダメージを与える
      for (const other of floor.actors) {
        if (!other.alive || other.kind !== "monster") continue;
        if (chebyshev(barrel.pos, other.pos) > 1) continue;
        const power = Math.round(barrelThrowDamage(player.inventory) * STONE_BARREL_DAMAGE_MULTIPLIER);
        const finalDamage = mitigateIncomingDamage({
          target: other,
          damage: Math.max(1, power),
          events,
          rng,
          runSkills,
          player,
          oncePerRun,
          partyGuardTurns,
        });
        events.push({ type: "message", text: `${displayActorName(other)}に${finalDamage}のダメージ!` });
        damageActor(other, finalDamage, false);
      }
      return;
    case "sleep":
      openSleepBarrel({ floor, center: barrel.pos, enhanced: barrel.enhanced ?? false, effectCtx });
      return;
    case "empty":
      return;
  }
}
