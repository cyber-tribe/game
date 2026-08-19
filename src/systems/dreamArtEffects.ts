/**
 * ゆめわざ(plan/game/archive/companion-leveling-and-arts.md)の実行部。
 * 発動条件は entities/dreamArts.ts の DREAM_ARTS が持ち(判定だけ、副作用なし)、
 * ここでは実際にGameの状態を書き換える処理だけを担う
 * (systems/bossMoves.tsと同じ「判定はentities/、実行はsystems/」の分担)。
 */
import {
  type Actor,
  type AllyActor,
  type DreamArtId,
  type FloorState,
  type StatusKind,
  STATUS_FLINCH,
  STATUS_ROOT,
  STATUS_SLEEP,
} from "../core/types";
import type { GameEvent } from "../core/events";
import { type Dir, chebyshev, dirFromDelta } from "../core/grid";
import type { Rng } from "../core/rng";
import { displayActorName } from "../entities/naming";

/** ゆめわざの睡眠・封じ・行動封じの持続ターン。共通で3ターン */
const DREAM_ART_STATUS_TURNS = 3;
/** ねばりつきの移動封じは短め(戦況を決めない小粒の効果、の方針に沿って) */
const NEBARITSUKI_ROOT_TURNS = 2;
/** ホネつよしのdef倍率・持続ターン */
const HONE_TSUYOSHI_DEF_MULTIPLIER = 1.5;
const HONE_TSUYOSHI_TURNS = 3;
/** ほのかなあかりの視界ボーナス・持続ターン */
const HONOKA_NA_AKARI_VISION_BONUS = 1;
const HONOKA_NA_AKARI_TURNS = 3;
/** ゆめのかけぶとんの被弾軽減率・持続ターン(仲間全員、1ターンだけ) */
const YUME_NO_KAKEBUTON_REDUCTION = 0.1;
const YUME_NO_KAKEBUTON_TURNS = 1;
/** つぶてなげの威力倍率(ally.atkに掛ける) */
const TSUBUTE_NAGE_POWER_MULTIPLIER = 0.6;
/** いやしのしずくの回復量(対象のmaxHpに掛ける割合) */
const IYASHI_NO_SHIZUKU_HEAL_RATIO = 0.2;

/** ゆめわざの実行に必要な最小限のGameアクセス */
export interface DreamArtContext {
  actor: AllyActor;
  floor: FloorState;
  rng: Rng;
  leader: Actor;
  events: GameEvent[];
  addStatus: (target: Actor, kind: StatusKind, turns: number, verb: string) => void;
  damageActor: (target: Actor, damage: number, critical: boolean, events: GameEvent[]) => void;
  mitigateIncomingDamage: (target: Actor, damage: number, events: GameEvent[]) => number;
  pushMonster: (dir: Dir, target: Actor, events: GameEvent[]) => boolean;
  /** ほのかなあかり(視界+1)。持続ターン数を上書きする(既存の残りより短ければ延ばす) */
  extendLanternGlow: (turns: number) => void;
  /** ゆめのかけぶとん(仲間全員の被弾を1ターン軽減)。持続ターン数を上書きする */
  extendPartyGuard: (turns: number) => void;
}

export interface DreamArtEffectDef {
  execute(ctx: DreamArtContext, targetId?: number): void;
}

function findTarget(ctx: DreamArtContext, targetId: number | undefined): Actor | undefined {
  if (targetId === undefined) return undefined;
  return ctx.floor.actors.find((a) => a.id === targetId && a.alive);
}

function faceTarget(actor: Actor, target: Actor): void {
  actor.facing = dirFromDelta(target.pos.x - actor.pos.x, target.pos.y - actor.pos.y);
}

export const DREAM_ART_EFFECTS: Readonly<Record<DreamArtId, DreamArtEffectDef>> = {
  nemuriUta: {
    execute(ctx, targetId) {
      const target = findTarget(ctx, targetId);
      if (!target) return;
      faceTarget(ctx.actor, target);
      ctx.events.push({ type: "message", text: `${displayActorName(ctx.actor)}は『ねむりのうた』をゆめみた!` });
      ctx.addStatus(target, STATUS_SLEEP, DREAM_ART_STATUS_TURNS, "眠ってしまった");
    },
  },
  tsubuteNage: {
    execute(ctx, targetId) {
      const target = findTarget(ctx, targetId);
      if (!target) return;
      faceTarget(ctx.actor, target);
      ctx.events.push({ type: "message", text: `${displayActorName(ctx.actor)}は『つぶてなげ』をゆめみた!` });
      ctx.events.push({ type: "attack", attackerId: ctx.actor.id, targetId: target.id });
      const damage = Math.max(1, Math.round(ctx.actor.atk * TSUBUTE_NAGE_POWER_MULTIPLIER));
      const finalDamage = ctx.mitigateIncomingDamage(target, damage, ctx.events);
      ctx.events.push({ type: "message", text: `${displayActorName(target)}に${finalDamage}のダメージ!` });
      ctx.damageActor(target, finalDamage, false, ctx.events);
    },
  },
  katayaburi: {
    execute(ctx) {
      ctx.events.push({ type: "message", text: `${displayActorName(ctx.actor)}は『かたやぶり』をゆめみた!` });
      ctx.actor.ignoreDefenseNextHit = true;
    },
  },
  iyashiNoShizuku: {
    execute(ctx, targetId) {
      const target = findTarget(ctx, targetId);
      if (!target) return;
      ctx.events.push({ type: "message", text: `${displayActorName(ctx.actor)}は『いやしのしずく』をゆめみた!` });
      const healed = Math.min(
        target.maxHp - target.hp,
        Math.round(target.maxHp * IYASHI_NO_SHIZUKU_HEAL_RATIO),
      );
      if (healed > 0) {
        target.hp += healed;
        ctx.events.push({ type: "heal", actorId: target.id, amount: healed, hpAfter: target.hp });
        ctx.events.push({ type: "message", text: `${displayActorName(target)}のHPが${healed}回復した。` });
      }
    },
  },
  kodamaGaeshi: {
    execute(ctx) {
      ctx.events.push({ type: "message", text: `${displayActorName(ctx.actor)}は『こだまがえし』をゆめみた!` });
      ctx.actor.reflectNextHit = true;
    },
  },
  chiisanaKaze: {
    execute(ctx) {
      ctx.events.push({ type: "message", text: `${displayActorName(ctx.actor)}は『ちいさなかぜ』をゆめみた!` });
      for (const other of ctx.floor.actors) {
        if (!other.alive || chebyshev(ctx.actor.pos, other.pos) !== 1) continue;
        if (other.kind !== "monster") continue;
        const dir = dirFromDelta(other.pos.x - ctx.actor.pos.x, other.pos.y - ctx.actor.pos.y);
        ctx.pushMonster(dir, other, ctx.events);
      }
    },
  },
  honokaNaAkari: {
    execute(ctx) {
      ctx.events.push({ type: "message", text: `${displayActorName(ctx.actor)}は『ほのかなあかり』をゆめみた!` });
      ctx.extendLanternGlow(HONOKA_NA_AKARI_TURNS);
    },
  },
  odoshiNaki: {
    execute(ctx, targetId) {
      const target = findTarget(ctx, targetId);
      if (!target) return;
      faceTarget(ctx.actor, target);
      ctx.events.push({ type: "message", text: `${displayActorName(ctx.actor)}は『おどしなき』をゆめみた!` });
      ctx.addStatus(target, STATUS_FLINCH, 1, "怯んでしまった");
    },
  },
  nebaritsuki: {
    execute(ctx, targetId) {
      const target = findTarget(ctx, targetId);
      if (!target) return;
      faceTarget(ctx.actor, target);
      ctx.events.push({ type: "message", text: `${displayActorName(ctx.actor)}は『ねばりつき』をゆめみた!` });
      ctx.addStatus(target, STATUS_ROOT, NEBARITSUKI_ROOT_TURNS, "うごけなくなった");
    },
  },
  yumeNoKakebuton: {
    execute(ctx) {
      ctx.events.push({ type: "message", text: `${displayActorName(ctx.actor)}は『ゆめのかけぶとん』をゆめみた!` });
      ctx.extendPartyGuard(YUME_NO_KAKEBUTON_TURNS);
    },
  },
  honeTsuyoshi: {
    execute(ctx) {
      ctx.events.push({ type: "message", text: `${displayActorName(ctx.actor)}は『ホネつよし』をゆめみた!` });
      ctx.actor.defBuffTurns = HONE_TSUYOSHI_TURNS;
    },
  },
  wasuresase: {
    execute(ctx, targetId) {
      const target = findTarget(ctx, targetId);
      if (!target || target.kind !== "monster") return;
      faceTarget(ctx.actor, target);
      ctx.events.push({ type: "message", text: `${displayActorName(ctx.actor)}は『わすれさせ』をゆめみた!` });
      target.aware = false;
    },
  },
};

export const HONE_TSUYOSHI_MULTIPLIER = HONE_TSUYOSHI_DEF_MULTIPLIER;
export const YUME_NO_KAKEBUTON_DAMAGE_REDUCTION = YUME_NO_KAKEBUTON_REDUCTION;
export const HONOKA_NA_AKARI_VISION_EXTRA = HONOKA_NA_AKARI_VISION_BONUS;
