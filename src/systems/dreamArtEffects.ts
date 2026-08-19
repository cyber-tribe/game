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
  STATUS_CONFUSE,
  STATUS_FLINCH,
  STATUS_ROOT,
  STATUS_SEAL,
  STATUS_SLEEP,
} from "../core/types";
import type { GameEvent } from "../core/events";
import { type Dir, type Vec2, chebyshev, dirFromDelta } from "../core/grid";
import type { Rng } from "../core/rng";
import { diggableWallNear, foesInRoom } from "../entities/dreamArts";
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

// ---- ぬしのゆめわざ(plan/game/archive/boss-dream-arts.md) ----
/** じびきの寝がえりの威力倍率(ally.atkに掛ける)・怯みの持続ターン */
const JIBIKI_NO_NEGAERI_POWER_MULTIPLIER = 0.8;
const JIBIKI_NO_NEGAERI_FLINCH_TURNS = 1;
/** おおまるのみの封じの持続ターン・吐き出しダメージの威力倍率 */
const OOMARUNOMI_SEAL_TURNS = 2;
const OOMARUNOMI_POWER_MULTIPLIER = 0.4;
/** ふかいまどろみ・まぼろしの口上の持続ターン(部屋全体、確定発動) */
const FUKAI_MADOROMI_SLEEP_TURNS = 3;
const MABOROSHI_NO_KOUJOU_CONFUSE_TURNS = 3;
/**
 * ホネのとりでが生成する壁の最大数・持続ターン。「壊せる」という手触りは
 * 今回は実装せず(攻撃で壊す動線はplan外)、一定ターンで自然に崩れる形に
 * 簡略化した(アーカイブ注記参照)
 */
const HONE_NO_TORIDE_MAX_WALLS = 3;
const HONE_NO_TORIDE_TURNS = 4;
/** うずのさそいで引き寄せる距離(マス数) */
const UZU_NO_SASOI_PULL_DISTANCE = 2;
/** こだまのおたけびの持続ターン・追加の1撃の威力倍率(通常の1撃の半分) */
const KODAMA_NO_OTAKEBI_TURNS = 3;
export const KODAMA_NO_OTAKEBI_ECHO_MULTIPLIER = 0.5;

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
  /** 部屋の在室者に状態異常をまとめて判定する(chance=1で確定発動として使う) */
  applyRoomWideStatus: (
    occupants: readonly Actor[],
    kind: StatusKind,
    chance: number,
    turns: number,
    verb: string,
    events: GameEvent[],
  ) => void;
  /**
   * ぬしのゆめわざ「ホネのとりで」。指定マスを一時的に壁化する
   * (歩行不可・視線を遮る)。既に壁・アクター・タルがある等で置けなければfalse
   */
  placeTemporaryWall: (pos: Vec2, turns: number) => boolean;
  /**
   * ぬしのゆめわざ「つらぬき掘り」。指定マス(壁)を通路に変える。
   * diggableWallNearが返した位置をそのまま渡す前提
   */
  digWall: (pos: Vec2) => void;
  /** ぬしのゆめわざ「こだまのおたけび」。持続ターン数を上書きする */
  extendEchoAttack: (turns: number) => void;
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

  // ---- ぬしのゆめわざ(plan/game/archive/boss-dream-arts.md) ----
  jibikiNoNegaeri: {
    execute(ctx) {
      ctx.events.push({ type: "message", text: `${displayActorName(ctx.actor)}は『じびきの寝がえり』をゆめみた!` });
      const power = Math.max(1, Math.round(ctx.actor.atk * JIBIKI_NO_NEGAERI_POWER_MULTIPLIER));
      for (const other of ctx.floor.actors) {
        if (!other.alive || other.kind !== "monster") continue;
        if (chebyshev(ctx.actor.pos, other.pos) > 2) continue;
        const finalDamage = ctx.mitigateIncomingDamage(other, power, ctx.events);
        ctx.events.push({ type: "message", text: `${displayActorName(other)}に${finalDamage}のダメージ!` });
        ctx.damageActor(other, finalDamage, false, ctx.events);
        if (other.alive) ctx.addStatus(other, STATUS_FLINCH, JIBIKI_NO_NEGAERI_FLINCH_TURNS, "怯んでしまった");
      }
    },
  },
  oomarunomi: {
    execute(ctx, targetId) {
      const target = findTarget(ctx, targetId);
      if (!target) return;
      faceTarget(ctx.actor, target);
      ctx.events.push({ type: "message", text: `${displayActorName(ctx.actor)}は『おおまるのみ』をゆめみた!` });
      ctx.addStatus(target, STATUS_SEAL, OOMARUNOMI_SEAL_TURNS, "呑み込まれて封じられた");
      const power = Math.max(1, Math.round(ctx.actor.atk * OOMARUNOMI_POWER_MULTIPLIER));
      const finalDamage = ctx.mitigateIncomingDamage(target, power, ctx.events);
      ctx.events.push({ type: "message", text: `吐き出され、${displayActorName(target)}に${finalDamage}のダメージ!` });
      ctx.damageActor(target, finalDamage, false, ctx.events);
    },
  },
  fukaiMadoromi: {
    execute(ctx) {
      ctx.events.push({ type: "message", text: `${displayActorName(ctx.actor)}は『ふかいまどろみ』をゆめみた!` });
      ctx.applyRoomWideStatus(
        foesInRoom(ctx.floor, ctx.actor),
        STATUS_SLEEP,
        1,
        FUKAI_MADOROMI_SLEEP_TURNS,
        "眠ってしまった",
        ctx.events,
      );
    },
  },
  honeNoToride: {
    execute(ctx) {
      ctx.events.push({ type: "message", text: `${displayActorName(ctx.actor)}は『ホネのとりで』をゆめみた!` });
      const { x, y } = ctx.actor.pos;
      const neighbors: Vec2[] = [
        { x: x - 1, y },
        { x: x + 1, y },
        { x, y: y - 1 },
        { x, y: y + 1 },
      ];
      let placed = 0;
      for (const pos of neighbors) {
        if (placed >= HONE_NO_TORIDE_MAX_WALLS) break;
        if (ctx.placeTemporaryWall(pos, HONE_NO_TORIDE_TURNS)) placed++;
      }
    },
  },
  uzuNoSasoi: {
    execute(ctx) {
      ctx.events.push({ type: "message", text: `${displayActorName(ctx.actor)}は『うずのさそい』をゆめみた!` });
      for (const foe of foesInRoom(ctx.floor, ctx.actor)) {
        for (let step = 0; step < UZU_NO_SASOI_PULL_DISTANCE && foe.alive; step++) {
          if (foe.pos.x === ctx.actor.pos.x && foe.pos.y === ctx.actor.pos.y) break;
          const dir = dirFromDelta(ctx.actor.pos.x - foe.pos.x, ctx.actor.pos.y - foe.pos.y);
          if (!ctx.pushMonster(dir, foe, ctx.events)) break;
        }
      }
    },
  },
  kodamaNoOtakebi: {
    execute(ctx) {
      ctx.events.push({ type: "message", text: `${displayActorName(ctx.actor)}は『こだまのおたけび』をゆめみた!` });
      ctx.extendEchoAttack(KODAMA_NO_OTAKEBI_TURNS);
    },
  },
  maboroshiNoKoujou: {
    execute(ctx) {
      ctx.events.push({ type: "message", text: `${displayActorName(ctx.actor)}は『まぼろしの口上』をゆめみた!` });
      ctx.applyRoomWideStatus(
        foesInRoom(ctx.floor, ctx.actor),
        STATUS_CONFUSE,
        1,
        MABOROSHI_NO_KOUJOU_CONFUSE_TURNS,
        "混乱した",
        ctx.events,
      );
    },
  },
  tsuranukiBori: {
    execute(ctx) {
      const pos = diggableWallNear(ctx.floor, ctx.actor.pos);
      if (!pos) return;
      ctx.events.push({ type: "message", text: `${displayActorName(ctx.actor)}は『つらぬき掘り』をゆめみた!` });
      ctx.digWall(pos);
    },
  },

  // ---- タルわざ(plan/game/archive/barrel-arts.md) ----
  // trigger が常にnullを返すため、この execute はAIの自動発動経路からは
  // 呼ばれない(game.tsのcastBarrelArtが、この登録簿を経由せず直接処理する)。
  // Record<DreamArtId, ...>の網羅性を満たすためだけの空実装
  waterBarrelArt: { execute() {} },
  windBarrelArt: { execute() {} },
  lightBarrelArt: { execute() {} },
  stoneBarrelArt: { execute() {} },
  sleepBarrelArt: { execute() {} },
};

export const HONE_TSUYOSHI_MULTIPLIER = HONE_TSUYOSHI_DEF_MULTIPLIER;
export const YUME_NO_KAKEBUTON_DAMAGE_REDUCTION = YUME_NO_KAKEBUTON_REDUCTION;
export const HONOKA_NA_AKARI_VISION_EXTRA = HONOKA_NA_AKARI_VISION_BONUS;
