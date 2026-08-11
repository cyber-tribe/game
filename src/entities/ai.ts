import type { Rng } from "../core/rng";
import { ALL_DIRS, type Dir, type Vec2, chebyshev, dirDelta, isDiagonal } from "../core/grid";
import { type Actor, type FloorState, actorAt, walkableAt } from "../core/types";
import { canSee } from "../dungeon/visibility";

export type MonsterAction =
  | { type: "wait" }
  | { type: "move"; dir: Dir }
  | { type: "attack"; targetId: number }
  | { type: "ranged"; targetId: number };

/**
 * プレイヤーからの歩数を全マスぶん求めた距離場(いわゆるダイクストラマップ)。
 * モンスターはこの値を下る方向に進むだけで、壁を回り込んで追ってくる。
 * 毎ターン1回だけ作り、その階のモンスター全員で使い回す。
 */
export function buildDistanceField(floor: FloorState, from: Vec2): Int32Array {
  const { width, height } = floor;
  const dist = new Int32Array(width * height).fill(-1);
  const startIdx = from.y * width + from.x;
  if (!walkableAt(floor, from)) return dist;

  dist[startIdx] = 0;
  const queue: number[] = [startIdx];
  let head = 0;
  while (head < queue.length) {
    const idx = queue[head++]!;
    const x = idx % width;
    const y = (idx - x) / width;
    const d = dist[idx]!;
    for (const dir of ALL_DIRS) {
      const delta = dirDelta(dir);
      const nx = x + delta.x;
      const ny = y + delta.y;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const nIdx = ny * width + nx;
      if (dist[nIdx] !== -1) continue;
      if (!walkableAt(floor, { x: nx, y: ny })) continue;
      // 斜めは角抜けを禁止するので、両隣が空いている場合のみ通れる
      if (isDiagonal(dir)) {
        if (!walkableAt(floor, { x, y: ny })) continue;
        if (!walkableAt(floor, { x: nx, y })) continue;
      }
      dist[nIdx] = d + 1;
      queue.push(nIdx);
    }
  }
  return dist;
}

/** その方向へ実際に進めるか。角抜け禁止と他アクターの存在を見る */
export function canStep(floor: FloorState, from: Vec2, dir: Dir): boolean {
  const delta = dirDelta(dir);
  const to = { x: from.x + delta.x, y: from.y + delta.y };
  if (!walkableAt(floor, to)) return false;
  if (isDiagonal(dir)) {
    if (!walkableAt(floor, { x: from.x, y: to.y })) return false;
    if (!walkableAt(floor, { x: to.x, y: from.y })) return false;
  }
  return actorAt(floor, to) === undefined;
}

export function decideMonsterAction(
  rng: Rng,
  floor: FloorState,
  monster: Actor,
  player: Actor,
  distField: Int32Array,
): MonsterAction {
  const species = monster.speciesId;
  const sees = canSee(floor, monster.pos, player.pos);
  if (sees) monster.aware = true;

  if (!monster.aware) return wander(rng, floor, monster);

  const distance = chebyshev(monster.pos, player.pos);

  // 逃げ腰のモンスターは瀕死になると距離を取る
  if (species && monster.hp <= monster.maxHp * 0.3 && isCoward(monster)) {
    const away = fleeDirection(floor, monster, player.pos);
    if (away !== null) return { type: "move", dir: away };
  }

  if (distance <= 1) return { type: "attack", targetId: player.id };

  if (monster.rangedRange !== undefined && sees && distance <= monster.rangedRange) {
    if (isStraightLine(monster.pos, player.pos)) return { type: "ranged", targetId: player.id };
  }

  const dir = stepDownField(floor, monster.pos, distField);
  if (dir !== null) return { type: "move", dir };
  return wander(rng, floor, monster);
}

function isCoward(monster: Actor): boolean {
  return monster.aiKind === "coward";
}

/** 距離場を1段下る方向を選ぶ */
function stepDownField(floor: FloorState, from: Vec2, field: Int32Array): Dir | null {
  const here = field[from.y * floor.width + from.x]!;
  if (here < 0) return null;
  let best: Dir | null = null;
  let bestValue = here;
  for (const dir of ALL_DIRS) {
    if (!canStep(floor, from, dir)) continue;
    const delta = dirDelta(dir);
    const value = field[(from.y + delta.y) * floor.width + (from.x + delta.x)]!;
    if (value >= 0 && value < bestValue) {
      bestValue = value;
      best = dir;
    }
  }
  return best;
}

/** プレイヤーから最も遠ざかる方向 */
function fleeDirection(floor: FloorState, monster: Actor, target: Vec2): Dir | null {
  let best: Dir | null = null;
  let bestDist = chebyshev(monster.pos, target);
  for (const dir of ALL_DIRS) {
    if (!canStep(floor, monster.pos, dir)) continue;
    const delta = dirDelta(dir);
    const d = chebyshev({ x: monster.pos.x + delta.x, y: monster.pos.y + delta.y }, target);
    if (d > bestDist) {
      bestDist = d;
      best = dir;
    }
  }
  return best;
}

/**
 * プレイヤーを見失っているときの徘徊。
 * 毎回ランダムだとその場で震えるだけになるので、進行方向を覚えて進み続ける。
 */
function wander(rng: Rng, floor: FloorState, monster: Actor): MonsterAction {
  const current = monster.wanderDir;
  if (current !== undefined && canStep(floor, monster.pos, current) && rng.chance(0.8)) {
    return { type: "move", dir: current };
  }
  const options = ALL_DIRS.filter((d) => canStep(floor, monster.pos, d));
  if (options.length === 0) return { type: "wait" };
  const dir = rng.pick(options);
  monster.wanderDir = dir;
  return { type: "move", dir };
}

/** 遠隔攻撃は縦横斜めの直線上にいるときだけ飛ばす */
function isStraightLine(a: Vec2, b: Vec2): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy);
}
