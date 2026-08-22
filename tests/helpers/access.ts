import type { Vec2 } from "../../src/core/grid";
import type { Actor } from "../../src/core/types";
import type { GameEvent } from "../../src/core/events";
import type { Game } from "../../src/game";
import { explode as domainExplode } from "../../src/domain/barrel/barrelExplosion";

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
}

export function access(game: Game): GameInternals {
  return game as unknown as GameInternals;
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
