import type { Rng } from "../core/rng";
import { ALL_DIRS, type Dir, type Vec2, chebyshev, dirDelta, eq, isDiagonal } from "../core/grid";
import {
  STATUS_FEAR,
  STATUS_INVISIBLE,
  STATUS_SEAL,
  type Actor,
  type AllyStance,
  type FloorState,
  actorAt,
  barrelAt,
  hasStatus,
  isHostile,
  walkableAt,
} from "../core/types";
import { canSee } from "../dungeon/visibility";

export type MonsterAction =
  | { type: "wait" }
  | { type: "move"; dir: Dir }
  | { type: "attack"; targetId: number }
  | { type: "ranged"; targetId: number };

/**
 * 指定した地点からの歩数を全マスぶん求めた距離場(いわゆるダイクストラマップ)。
 * これを下る方向に進むだけで、壁を回り込んで相手に近づける。
 *
 * 始点を複数受け取れるようにしてあるのは、陣営が増えたため。
 * モンスターは「プレイヤーと仲間すべて」からの距離場を下り、
 * 仲間は「敵すべて」からの距離場を下る。始点をまとめて入れておけば、
 * 各自がいちばん近い相手に自然と向かう。
 */
export function buildDistanceField(floor: FloorState, from: Vec2 | readonly Vec2[]): Int32Array {
  const { width, height } = floor;
  const dist = new Int32Array(width * height).fill(-1);
  const sources = Array.isArray(from) ? (from as readonly Vec2[]) : [from as Vec2];

  const queue: number[] = [];
  for (const source of sources) {
    if (!walkableAt(floor, source)) continue;
    const idx = source.y * width + source.x;
    if (dist[idx] !== -1) continue;
    dist[idx] = 0;
    queue.push(idx);
  }

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

/** その方向へ実際に進めるか。角抜け禁止、他アクター、タルを見る */
export function canStep(floor: FloorState, from: Vec2, dir: Dir): boolean {
  const delta = dirDelta(dir);
  const to = { x: from.x + delta.x, y: from.y + delta.y };
  if (!walkableAt(floor, to)) return false;
  if (isDiagonal(dir)) {
    if (!walkableAt(floor, { x: from.x, y: to.y })) return false;
    if (!walkableAt(floor, { x: to.x, y: from.y })) return false;
  }
  if (actorAt(floor, to) !== undefined) return false;
  // タルは通り抜けられない。これがあるので、タルを置いて道を塞ぐ戦い方ができる
  return barrelAt(floor, to) === undefined;
}

/** 見えている敵のうち、いちばん近いもの */
export function nearestVisibleFoe(floor: FloorState, self: Actor): Actor | null {
  let best: Actor | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const other of floor.actors) {
    if (!other.alive || !isHostile(self, other)) continue;
    if (!canSee(floor, self.pos, other.pos)) continue;
    const d = chebyshev(self.pos, other.pos);
    if (d < bestDist) {
      bestDist = d;
      best = other;
    }
  }
  return best;
}

/** 隣にいる敵のうち、いちばん体力の減っているもの */
export function adjacentFoe(floor: FloorState, self: Actor): Actor | null {
  let best: Actor | null = null;
  for (const other of floor.actors) {
    if (!other.alive || !isHostile(self, other)) continue;
    if (chebyshev(self.pos, other.pos) !== 1) continue;
    if (!best || other.hp < best.hp) best = other;
  }
  return best;
}

/**
 * モンスターの行動を決める。
 * target は距離場の元になっている陣営の代表(モンスターにとってはプレイヤー)。
 */
export function decideMonsterAction(
  rng: Rng,
  floor: FloorState,
  monster: Actor,
  target: Actor,
  distField: Int32Array,
): MonsterAction {
  // 近道屋の出店の店主(plan/shops-and-thieves.md): 万引きされて豹変するまでは
  // 動かず攻撃もしない。豹変後も店を離れず、隣接した相手にだけ反撃する
  if (monster.aiKind === "shopkeeper") {
    if (!monster.angry) return { type: "wait" };
    const adjacent = adjacentFoe(floor, monster);
    return adjacent ? { type: "attack", targetId: adjacent.id } : { type: "wait" };
  }

  // スリガラス(plan/shops-and-thieves.md): 盗んだあとは戦わず逃げるだけになる
  if (monster.aiKind === "thief" && monster.stolenGold !== undefined) {
    const away = fleeDirection(floor, monster, target.pos);
    return away !== null ? { type: "move", dir: away } : wander(rng, floor, monster);
  }

  // おびえの巻物: 戦わずに逃げ続ける。追跡・攻撃のどの判断よりも優先する
  if (hasStatus(monster, STATUS_FEAR)) {
    const away = fleeDirection(floor, monster, target.pos);
    return away !== null ? { type: "move", dir: away } : wander(rng, floor, monster);
  }

  // とうめいの巻物: 透明な相手を見ても新たに気づかない(すでに気づいている分には効かない)
  const sees =
    !hasStatus(target, STATUS_INVISIBLE) &&
    (canSee(floor, monster.pos, target.pos) || nearestVisibleFoe(floor, monster) !== null);
  if (sees) monster.aware = true;

  if (!monster.aware) return wander(rng, floor, monster);

  // 隣に敵がいるなら、それが誰であれ殴る。仲間が割り込んでいれば仲間を殴る
  const adjacent = adjacentFoe(floor, monster);
  if (adjacent) return { type: "attack", targetId: adjacent.id };

  // 逃げ腰のモンスターは瀕死になると距離を取る
  if (monster.aiKind === "coward" && monster.hp <= monster.maxHp * 0.3) {
    const away = fleeDirection(floor, monster, target.pos);
    if (away !== null) return { type: "move", dir: away };
  }

  // かなしばりの杖: 封じられている間は遠隔攻撃(特技)が使えず、近づくしかない
  const visible = nearestVisibleFoe(floor, monster);
  if (monster.rangedRange !== undefined && visible && !hasStatus(monster, STATUS_SEAL)) {
    const distance = chebyshev(monster.pos, visible.pos);
    if (distance <= monster.rangedRange && isStraightLine(monster.pos, visible.pos)) {
      return { type: "ranged", targetId: visible.id };
    }
  }

  const dir = stepDownField(floor, monster.pos, distField);
  if (dir !== null) return { type: "move", dir };
  return wander(rng, floor, monster);
}

/**
 * 仲間の行動を決める。plan/companion-orders.md の「構え」で分岐する。
 * 隣接する敵への反撃だけは構えによらず共通(自衛はする)。
 */
export function decideAllyAction(
  rng: Rng,
  floor: FloorState,
  ally: Actor,
  leader: Actor,
  foeField: Int32Array,
  leaderField: Int32Array,
): MonsterAction {
  const adjacent = adjacentFoe(floor, ally);
  if (adjacent) return { type: "attack", targetId: adjacent.id };

  const stance: AllyStance = ally.stance ?? "free";
  switch (stance) {
    case "guard":
      return guardAction(floor, ally, leader, leaderField);
    case "hold":
      return holdAction(floor, ally);
    case "vanguard":
      return vanguardAction(rng, floor, ally, foeField);
    case "free":
      return freeAction(rng, floor, ally, leader, foeField, leaderField);
  }
}

/** おまかせ(既定)。敵が見えていれば向かっていき、いなければ主についてくる */
function freeAction(
  rng: Rng,
  floor: FloorState,
  ally: Actor,
  leader: Actor,
  foeField: Int32Array,
  leaderField: Int32Array,
): MonsterAction {
  const foe = nearestVisibleFoe(floor, ally);
  if (foe) {
    if (ally.rangedRange !== undefined) {
      const distance = chebyshev(ally.pos, foe.pos);
      if (distance <= ally.rangedRange && isStraightLine(ally.pos, foe.pos)) {
        return { type: "ranged", targetId: foe.id };
      }
    }
    const dir = stepDownField(floor, ally.pos, foeField);
    if (dir !== null) return { type: "move", dir };
  }

  // 敵がいなければ主のそば。真隣まで詰めると通せんぼになるので少し離れて止まる
  const distanceToLeader = chebyshev(ally.pos, leader.pos);
  if (distanceToLeader <= 1) return { type: "wait" };
  const dir = stepDownField(floor, ally.pos, leaderField);
  if (dir !== null) return { type: "move", dir };
  return rng.chance(0.3) ? wander(rng, floor, ally) : { type: "wait" };
}

/** そばにいろ。自分からは追わず、主の隣接圏内(距離1以内)を保つだけ */
function guardAction(
  floor: FloorState,
  ally: Actor,
  leader: Actor,
  leaderField: Int32Array,
): MonsterAction {
  const distanceToLeader = chebyshev(ally.pos, leader.pos);
  if (distanceToLeader <= 1) return { type: "wait" };
  const dir = stepDownField(floor, ally.pos, leaderField);
  if (dir !== null) return { type: "move", dir };
  return { type: "wait" };
}

/** そこで待て。指示した瞬間の座標(holdPos)に留まる */
function holdAction(floor: FloorState, ally: Actor): MonsterAction {
  const point = ally.holdPos ?? ally.pos;
  if (eq(ally.pos, point)) return { type: "wait" };
  const field = buildDistanceField(floor, point);
  const dir = stepDownField(floor, ally.pos, field);
  return dir !== null ? { type: "move", dir } : { type: "wait" };
}

/**
 * 先陣を切れ。敵が見えていれば主を待たずに応戦し、いなければ未探索タイル
 * (見つからなければ階段)へ自律的に向かう。
 */
function vanguardAction(
  rng: Rng,
  floor: FloorState,
  ally: Actor,
  foeField: Int32Array,
): MonsterAction {
  const foe = nearestVisibleFoe(floor, ally);
  if (foe) {
    if (ally.rangedRange !== undefined) {
      const distance = chebyshev(ally.pos, foe.pos);
      if (distance <= ally.rangedRange && isStraightLine(ally.pos, foe.pos)) {
        return { type: "ranged", targetId: foe.id };
      }
    }
    const dir = stepDownField(floor, ally.pos, foeField);
    if (dir !== null) return { type: "move", dir };
  }

  const target = nearestUnexploredTile(floor, ally.pos) ?? floor.stairs;
  const field = buildDistanceField(floor, target);
  const dir = stepDownField(floor, ally.pos, field);
  return dir !== null ? { type: "move", dir } : wander(rng, floor, ally);
}

/** 主に見えている全アクター中でこの仲間だけが到達できる、最も近い未探索の歩行可能マス */
function nearestUnexploredTile(floor: FloorState, from: Vec2): Vec2 | null {
  const field = buildDistanceField(floor, from);
  let best: Vec2 | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let y = 0; y < floor.height; y++) {
    for (let x = 0; x < floor.width; x++) {
      if (floor.tiles[y * floor.width + x]!.explored) continue;
      const p = { x, y };
      if (!walkableAt(floor, p)) continue;
      const d = field[y * floor.width + x]!;
      if (d < 0 || d >= bestDist) continue;
      bestDist = d;
      best = p;
    }
  }
  return best;
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

/** 相手から最も遠ざかる方向 */
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
 * 相手を見失っているときの徘徊。
 * 毎回ランダムだとその場で震えるだけになるので、進行方向を覚えて進み続ける。
 */
function wander(rng: Rng, floor: FloorState, actor: Actor): MonsterAction {
  const current = actor.wanderDir;
  if (current !== undefined && canStep(floor, actor.pos, current) && rng.chance(0.8)) {
    return { type: "move", dir: current };
  }
  const options = ALL_DIRS.filter((d) => canStep(floor, actor.pos, d));
  if (options.length === 0) return { type: "wait" };
  const dir = rng.pick(options);
  actor.wanderDir = dir;
  return { type: "move", dir };
}

/** 遠隔攻撃は縦横斜めの直線上にいるときだけ飛ばす */
function isStraightLine(a: Vec2, b: Vec2): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy);
}
