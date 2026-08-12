import type { Actor } from "../../src/core/types";
import type { Game } from "../../src/game";

/**
 * private メンバへ直接アクセスするための型付きキャスト。`killActor`・
 * `explode`・`shopWary` は同じ形の `game as unknown as {...}` が複数の
 * テストファイルで繰り返されていたので、その分だけをここに集約した。
 * 他の private アクセス(1ファイルだけで使う形)はそれぞれの場所に残す。
 */
export interface GameInternals {
  killActor: (target: Actor, events: unknown[]) => void;
  explode: (pos: unknown, events: unknown[], throwerId?: number) => void;
  shopWary: boolean;
}

export function access(game: Game): GameInternals {
  return game as unknown as GameInternals;
}
