import type { Dir, Vec2 } from "../../core/grid";
import type { Actor, FloorState } from "../../core/types";
import { actorAt, barrelAt, walkLine } from "../../core/types";

/** タルを投げたときの基本射程 */
export const BARREL_RANGE = 8;
/** スキル「かるがる」(plan/game/archive/run-build-skills.md): タルの投げ射程+2 */
export const LIGHT_CARRY_RANGE_BONUS = 2;

export interface TraceThrowResult {
  landing: Vec2;
  hits: Actor[];
}

/**
 * 投げたタルがどこへ落ちて誰に当たるかを引く。
 * 実際の投擲と、投げる前の見込み表示(captureOutlook)で同じ判定を使うために
 * 切り出してある(plan/game/barrel-capture-clarity.md)
 */
export function traceThrow(
  floor: FloorState,
  from: Vec2,
  dir: Dir,
  range: number,
  pierce: boolean,
  selfId: number,
): TraceThrowResult {
  let landing = from;
  const hits: Actor[] = [];
  for (const p of walkLine(floor, from, dir, range)) {
    const blocker = barrelAt(floor, p);
    if (blocker) break;
    landing = p;
    const actor = actorAt(floor, p);
    if (actor && actor.id !== selfId) {
      hits.push(actor);
      // 「抱え投げの奥義」でなければ、最初に当たった相手で止まる
      if (!pierce) break;
    }
  }
  return { landing, hits };
}
