import type { Dir, Vec2 } from "../../src/core/grid";
import type { Actor, AllyActor, MonsterActor } from "../../src/core/types";
import type { GameEvent } from "../../src/core/events";
import type { OncePerRunTracker } from "../../src/core/oncePerRunTracker";
import type { MoodDef } from "../../src/entities/moods";
import type { MonsterAction } from "../../src/entities/ai";
import type { BossMoveContext } from "../../src/domain/dungeon/bossMoves";
import type { DreamArtContext } from "../../src/domain/party/dreamArtEffects";
import type { SkillChoiceState } from "../../src/domain/player/runSkills";
import type { Game } from "../../src/application/dungeonRun/game";
import { explode as domainExplode } from "../../src/domain/barrel/barrelExplosion";
import {
  attemptSteal as domainAttemptSteal,
  type AttemptStealArgs,
} from "../../src/domain/turn/attackResolution";
import {
  executeMonsterAction as domainExecuteMonsterAction,
  moveActor as domainMoveActor,
  runActors as domainRunActors,
  type RunActorsArgs,
} from "../../src/domain/turn/actorActions";

/**
 * private メンバへ直接アクセスするための型付きキャスト。`killActor`・
 * `shopWary` は同じ形の `game as unknown as {...}` が複数の
 * テストファイルで繰り返されていたので、その分だけをここに集約した。
 * 他の private アクセス(1ファイルだけで使う形)はそれぞれの場所に残す。
 */
export interface GameInternals {
  killActor: (target: Actor, events: unknown[]) => void;
  damageActor: (target: Actor, damage: number, critical: boolean, events: GameEvent[]) => void;
  shopWary: boolean;
  oncePerRun: OncePerRunTracker;
  partyGuardTurns: number;
  echoAttackTurns: number;
  mood: MoodDef;
  bossMoveContext: (actor: MonsterActor, events: GameEvent[]) => BossMoveContext;
  dreamArtContext: (actor: AllyActor, events: GameEvent[]) => DreamArtContext;
  skillChoiceState: SkillChoiceState;
}

export function access(game: Game): GameInternals {
  return game as unknown as GameInternals;
}

/** DDD Phase 4(plan/game/ddd-phase4-turn-resolution.md)でrunActors一式がdomain/turn/actorActions.tsへ移ったため、テストからはGameのprivate実装を借りてRunActorsArgsを組み立てる */
function runActorsArgs(game: Game, events: unknown[]): RunActorsArgs {
  const typedEvents = events as GameEvent[];
  const internals = access(game);
  return {
    floor: game.floor,
    rng: game.rng,
    player: game.player,
    allies: game.allies,
    runSkills: game.runSkills,
    oncePerRun: internals.oncePerRun,
    mood: internals.mood,
    events: typedEvents,
    echoAttackTurns: internals.echoAttackTurns,
    partyGuardTurns: internals.partyGuardTurns,
    isPlaying: () => game.status === "playing",
    damageActor: (target, damage, critical) => internals.damageActor(target, damage, critical, typedEvents),
    buildBossMoveContext: (actor) => internals.bossMoveContext(actor, typedEvents),
    buildDreamArtContext: (actor) => internals.dreamArtContext(actor, typedEvents),
  };
}

export function runActors(game: Game, events: unknown[]): void {
  domainRunActors(runActorsArgs(game, events));
}

export function executeMonsterAction(
  game: Game,
  actor: MonsterActor | AllyActor,
  action: MonsterAction,
  events: unknown[],
): boolean {
  return domainExecuteMonsterAction(actor, action, runActorsArgs(game, events));
}

export function attemptSteal(game: Game, thief: Actor, target: Actor, events: unknown[]): void {
  domainAttemptSteal({
    thief: thief as AttemptStealArgs["thief"],
    target,
    player: game.player,
    rng: game.rng,
    events: events as GameEvent[],
  });
}

export function moveActor(game: Game, actor: Actor, dir: Dir, events: unknown[]): void {
  domainMoveActor(game.floor, actor, dir, events as GameEvent[]);
}

/**
 * DDD Phase 3(plan/game/archive/ddd-phase3-barrel-domain.md)でexplodeが
 * domain/barrel/barrelExplosion.tsへ移ったため、テストからはGameの
 * private実装(damageActor)を借りてdomain関数を直接呼ぶ
 */
export function explode(game: Game, center: Vec2, events: unknown[], throwerId?: number): void {
  const typedEvents = events as GameEvent[];
  domainExplode({
    floor: game.floor,
    rng: game.rng,
    center,
    events: typedEvents,
    throwerId,
    damageActor: (target, damage, critical) => access(game).damageActor(target, damage, critical, typedEvents),
    isPlaying: () => game.status === "playing",
  });
}
