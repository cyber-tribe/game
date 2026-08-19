import type { Rng } from "../core/rng";
import { ALL_DIRS, type Dir, type Vec2, chebyshev, dirDelta, eq, isDiagonal } from "../core/grid";
import {
  STATUS_FEAR,
  STATUS_INVISIBLE,
  STATUS_SEAL,
  type Actor,
  type AllyActor,
  type AllyStance,
  type BossMoveId,
  type CombatantActor,
  type DreamArtId,
  type FloorState,
  type MonsterActor,
  actorAt,
  barrelAt,
  hasStatus,
  isHostile,
  isWalkable,
  tileAt,
  walkableAt,
} from "../core/types";
import { canSee } from "../dungeon/visibility";
import { DREAM_ARTS } from "./dreamArts";
import { hasSkill } from "./skills";
import { speciesById } from "./species";

/** burrow AI が潜ってから次に現れるまでのターン数(plan/monster-compendium.md) */
const BURROW_INTERVAL = 3;
/** burrow AI が現れる際、targetからこの距離以内の空きマスを探す */
const BURROW_SURFACE_RANGE = 2;
/** guard AI の反撃力補正(plan/monster-compendium.md) */
export const GUARD_COUNTER_BONUS = 1.3;
/** かく乱のこだま(warnCall)が、周囲のモンスターの新規気づきを抑える確率 */
const WARN_CALL_SUPPRESS_CHANCE = 0.4;
/** かく乱のこだまが効く範囲(そのモンスターからの距離) */
const WARN_CALL_RANGE = 4;

export type MonsterAction =
  | { type: "wait" }
  | { type: "move"; dir: Dir }
  | { type: "attack"; targetId: number; empowered?: boolean }
  | { type: "ranged"; targetId: number }
  /** 地方ボス(plan/region-bosses.md)の予兆。この手は攻撃せず、次の隣接攻撃が大技になる */
  | { type: "telegraph"; targetId: number }
  /**
   * 地方ボス(plan/region-bosses.md)の大技本体。予兆を消費した1手。
   * 種類ごとの実装は systems/bossMoves.ts の BOSS_MOVES レジストリにある
   * (moveId→実装の対応はそこに集約し、ここでは種類を区別しない)
   */
  | { type: "bossMove"; moveId: Exclude<BossMoveId, "targetedStrike"> }
  /** burrow(plan/monster-compendium.md)。潜伏から地上へ現れる。呼び出し側で位置を動かし、teleportイベントを出す */
  | { type: "burrowSurface"; to: Vec2 }
  /**
   * ゆめわざ(plan/game/archive/companion-leveling-and-arts.md)。仲間モンスターだけが
   * 選べる。種類ごとの実装は systems/dreamArtEffects.ts の DREAM_ART_EFFECTS
   * レジストリにある(bossMoveと同じ構成)
   */
  | { type: "dreamArt"; id: DreamArtId; targetId?: number };

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

  // 近傍の判定は walkableAt(floor, { x, y }) ではなく添字で行う。
  // ここは1回の探索で数千回まわるため、そのたびに座標オブジェクトを作ると
  // 使い捨てが1ターンあたり万単位になり、GC を無駄に働かせることになる
  const tiles = floor.tiles;
  const walkableIdx = (i: number): boolean => {
    const t = tiles[i];
    return t !== undefined && isWalkable(t.kind);
  };

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
      if (!walkableIdx(nIdx)) continue;
      // 斜めは角抜けを禁止するので、両隣が空いている場合のみ通れる
      if (isDiagonal(dir)) {
        if (!walkableIdx(ny * width + x)) continue;
        if (!walkableIdx(y * width + nx)) continue;
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

/**
 * 隣にいる敵のうち、いちばん体力の減っているもの。
 * avoidDisguised: true なら、「みをかくす」(disguise)持ちの仲間を、
 * 他に候補がいる限り優先的に避ける(plan/monster-compendium.md)
 */
export function adjacentFoe(floor: FloorState, self: Actor, opts?: { avoidDisguised?: boolean }): Actor | null {
  const candidates: Actor[] = [];
  for (const other of floor.actors) {
    if (!other.alive || !isHostile(self, other)) continue;
    if (chebyshev(self.pos, other.pos) !== 1) continue;
    candidates.push(other);
  }
  const pool =
    opts?.avoidDisguised && candidates.some((c) => !hasSkill(c, "disguise"))
      ? candidates.filter((c) => !hasSkill(c, "disguise"))
      : candidates;
  let best: Actor | null = null;
  for (const c of pool) {
    if (!best || c.hp < best.hp) best = c;
  }
  return best;
}

/**
 * とうめいの巻物・かく乱のこだま(warnCall、plan/monster-compendium.md)を
 * 考慮した視認判定。まだ気づいていない相手には、周囲に「かく乱のこだま」を
 * 持つ仲間がいると一定確率で気づけない
 */
function attemptSight(
  rng: Rng,
  floor: FloorState,
  monster: MonsterActor,
  target: Actor,
  /** ヨリシロの気分(plan/yorishiro-moods.md)。省略時は1(無補正) */
  awareDistanceMul = 1,
): boolean {
  if (hasStatus(target, STATUS_INVISIBLE)) return false;
  if (!canSee(floor, monster.pos, target.pos) && nearestVisibleFoe(floor, monster) === null) return false;
  if (monster.aware) return true;
  if (nearbyWarnCallAlly(floor, monster) && rng.chance(WARN_CALL_SUPPRESS_CHANCE)) return false;
  // ヨリシロの気分(plan/yorishiro-moods.md): 隣接時は奇襲を許さないため常に気づく。
  // 隣接していない相手(同室内の遠い相手)にだけ、気づきやすさの係数を掛ける
  if (
    awareDistanceMul < 1 &&
    chebyshev(monster.pos, target.pos) > 1 &&
    !rng.chance(Math.max(0, awareDistanceMul))
  ) {
    return false;
  }
  return true;
}

function nearbyWarnCallAlly(floor: FloorState, monster: Actor): boolean {
  for (const a of floor.actors) {
    if (!a.alive || a.kind !== "ally" || !hasSkill(a, "warnCall")) continue;
    if (chebyshev(monster.pos, a.pos) <= WARN_CALL_RANGE) return true;
  }
  return false;
}

/** burrow AI が地上に現れる位置。targetの近くの空いている歩行可能マスを探す */
function burrowSurfaceSpot(rng: Rng, floor: FloorState, near: Vec2): Vec2 | null {
  const candidates: Vec2[] = [];
  for (let dy = -BURROW_SURFACE_RANGE; dy <= BURROW_SURFACE_RANGE; dy++) {
    for (let dx = -BURROW_SURFACE_RANGE; dx <= BURROW_SURFACE_RANGE; dx++) {
      if (dx === 0 && dy === 0) continue;
      const p = { x: near.x + dx, y: near.y + dy };
      if (!walkableAt(floor, p)) continue;
      if (actorAt(floor, p) !== undefined) continue;
      if (barrelAt(floor, p) !== undefined) continue;
      candidates.push(p);
    }
  }
  return candidates.length > 0 ? rng.pick(candidates) : null;
}

/**
 * 60種化・追加種族(plan/monster-roster-expansion-species.md)。地形連動で
 * 射程が伸びる種族(きりみずち・なだかぜ)の実効射程。自分の足元が深みタイル、
 * または自分の周囲1マス以内に奔流タイルがあると、対応するボーナスを加算する
 */
export function effectiveRangedRange(floor: FloorState, actor: CombatantActor): number {
  const base = actor.rangedRange ?? 0;
  if (!actor.speciesId) return base;
  const species = speciesById(actor.speciesId);
  let bonus = 0;
  if (species.rangeBonusOnQuagmire && tileAt(floor, actor.pos)?.quagmire) {
    bonus += species.rangeBonusOnQuagmire;
  }
  if (species.rangeBonusNearTorrent) {
    const nearTorrent =
      tileAt(floor, actor.pos)?.torrent !== undefined ||
      ALL_DIRS.some((dir) => {
        const delta = dirDelta(dir);
        return tileAt(floor, { x: actor.pos.x + delta.x, y: actor.pos.y + delta.y })?.torrent !== undefined;
      });
    if (nearTorrent) bonus += species.rangeBonusNearTorrent;
  }
  return base + bonus;
}

/**
 * モンスターの行動を決める。
 * target は距離場の元になっている陣営の代表(モンスターにとってはプレイヤー)。
 */
export function decideMonsterAction(
  rng: Rng,
  floor: FloorState,
  monster: MonsterActor,
  target: Actor,
  distField: Int32Array,
  /** ヨリシロの気分(plan/yorishiro-moods.md)。省略時は1(無補正) */
  awareDistanceMul = 1,
): MonsterAction {
  // 地方ボス(plan/region-boss-misemonononushi.md): 幻影(mirrorOfを持つ)は
  // 自分からは一切行動しない。単純な待機状態のまま
  if (monster.mirrorOf !== undefined) return { type: "wait" };

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

  // ambush・mimic(plan/monster-compendium.md): 隣接されるまで完全に気づかず、
  // 気づいた直後の1撃には奇襲補正が乗る(game.ts の attack が ambushReady を見る)。
  // mimic はタルへの視覚的な擬態までは実装せず、この「隣接されるまで潜む」
  // 挙動だけを流用する簡略化とする(アーカイブ注記参照)
  if (monster.aiKind === "ambush" || monster.aiKind === "mimic") {
    const wasAware = monster.aware;
    const adjacent = adjacentFoe(floor, monster, { avoidDisguised: true });
    if (adjacent) {
      monster.aware = true;
      if (!wasAware) monster.ambushReady = true;
      return { type: "attack", targetId: adjacent.id };
    }
    return { type: "wait" };
  }

  // burrow(plan/monster-compendium.md): 追跡の距離場を使わず、一定間隔で
  // 「潜る/現れる」を挟む。隣接していれば潜伏中でも応戦する
  if (monster.aiKind === "burrow") {
    const adjacent = adjacentFoe(floor, monster, { avoidDisguised: true });
    if (adjacent) {
      monster.aware = true;
      return { type: "attack", targetId: adjacent.id };
    }
    const timer = monster.burrowTimer ?? BURROW_INTERVAL;
    if (timer <= 0) {
      monster.burrowTimer = BURROW_INTERVAL;
      const spot = burrowSurfaceSpot(rng, floor, target.pos);
      if (spot) {
        monster.aware = true;
        return { type: "burrowSurface", to: spot };
      }
      return { type: "wait" };
    }
    monster.burrowTimer = timer - 1;
    return { type: "wait" };
  }

  // とうめいの巻物・かく乱のこだまを考慮した視認
  const wasAware = monster.aware;
  if (attemptSight(rng, floor, monster, target, awareDistanceMul)) monster.aware = true;

  // やまびこぎつね(alertsFloorOnSight): 初めて視認した瞬間、フロア中の
  // 他のモンスターにも気づかせる(design/regions.md 第六地方)
  if (!wasAware && monster.aware && monster.speciesId && speciesById(monster.speciesId).alertsFloorOnSight) {
    for (const other of floor.actors) {
      if (other.alive && other.kind === "monster") other.aware = true;
    }
  }

  if (!monster.aware) return wander(rng, floor, monster);

  // 隣に敵がいるなら、それが誰であれ殴る。仲間が割り込んでいれば仲間を殴る
  const adjacent = adjacentFoe(floor, monster, { avoidDisguised: true });
  if (adjacent) {
    // 地方ボス(plan/region-bosses.md): 予兆つきの大技。1ターン警告してから、
    // 次に隣接して攻撃する手が必ず大技になる。既存のattack/telegraphの枠組みに
    // 乗せるだけで、専用の移動AIやUIは増やさない
    // 地方ボス(plan/region-boss-kodamanonushi.md): 分身(sharesHpWithを持つ)は
    // 同じspeciesIdのbossTelegraphを継承してしまうため、予兆サイクルには入らせない
    const telegraph =
      monster.speciesId && monster.sharesHpWith === undefined
        ? speciesById(monster.speciesId).bossTelegraph
        : undefined;
    // 地方ボス(plan/region-boss-nushigaeru.md): HPがactivateBelowHpRatioを
    // 上回っている間はまだ予兆のサイクルに入らず、通常の攻撃で戦う
    if (telegraph && monster.hp <= monster.maxHp * (telegraph.activateBelowHpRatio ?? 1)) {
      if (monster.telegraphCooldown && monster.telegraphCooldown > 0) monster.telegraphCooldown--;
      if (monster.telegraphCharge) {
        monster.telegraphCharge = false;
        if (telegraph.effect && telegraph.effect !== "targetedStrike") {
          return { type: "bossMove", moveId: telegraph.effect };
        }
        return { type: "attack", targetId: adjacent.id, empowered: true };
      }
      if (!monster.telegraphCooldown) {
        monster.telegraphCharge = true;
        monster.telegraphCooldown = telegraph.cooldownTurns;
        return { type: "telegraph", targetId: adjacent.id };
      }
    }
    return { type: "attack", targetId: adjacent.id };
  }

  // 逃げ腰のモンスターは瀕死になると距離を取る
  if (monster.aiKind === "coward" && monster.hp <= monster.maxHp * 0.3) {
    const away = fleeDirection(floor, monster, target.pos);
    if (away !== null) return { type: "move", dir: away };
  }

  // guard(plan/monster-compendium.md): ほとんど自分から動かず、その場を固める
  if (monster.aiKind === "guard") return { type: "wait" };

  // かなしばりの杖: 封じられている間は遠隔攻撃(特技)が使えず、近づくしかない
  const visible = nearestVisibleFoe(floor, monster);
  if (monster.rangedRange !== undefined && visible && !hasStatus(monster, STATUS_SEAL)) {
    const distance = chebyshev(monster.pos, visible.pos);
    if (distance <= effectiveRangedRange(floor, monster) && isStraightLine(monster.pos, visible.pos)) {
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
  ally: AllyActor,
  leader: Actor,
  foeField: Int32Array,
  leaderField: Int32Array,
): MonsterAction {
  const adjacent = adjacentFoe(floor, ally);

  // ゆめわざ(plan/game/archive/companion-leveling-and-arts.md): 条件を満たした
  // ターンに、通常行動(隣接反撃・構え別の移動)の代わりに使う。「ゆめわざ控えめ」
  // (dreamArtsCareful)のときはここを丸ごと飛ばす
  const dreamArt = decideDreamArt(rng, floor, ally, leader, adjacent);
  if (dreamArt) return dreamArt;

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
    case "dreamArtsCareful":
      return freeAction(rng, floor, ally, leader, foeField, leaderField);
  }
}

/**
 * ゆめわざを撃つかどうかを決める。習得順に見て、クールダウンが空いていて
 * 条件(DREAM_ARTS[id].trigger)を満たす最初の1つだけを、さらに発動確率
 * (activationChance)で抽選する。複数条件を同時に満たしても1ターンに1つまで
 */
function decideDreamArt(
  rng: Rng,
  floor: FloorState,
  ally: AllyActor,
  leader: Actor,
  adjacent: Actor | null,
): MonsterAction | null {
  if (ally.stance === "dreamArtsCareful") return null;
  const known = ally.dreamArts ?? [];
  if (known.length === 0) return null;
  for (const id of known) {
    const cooldown = ally.dreamArtCooldowns?.[id] ?? 0;
    if (cooldown > 0) continue;
    const def = DREAM_ARTS[id];
    const result = def.trigger({ floor, ally, leader, adjacentFoe: adjacent });
    if (!result) continue;
    if (!rng.chance(def.activationChance)) continue;
    return { type: "dreamArt", id, targetId: result.targetId };
  }
  return null;
}

/** おまかせ(既定)。敵が見えていれば向かっていき、いなければ主についてくる */
function freeAction(
  rng: Rng,
  floor: FloorState,
  ally: AllyActor,
  leader: Actor,
  foeField: Int32Array,
  leaderField: Int32Array,
): MonsterAction {
  const foe = nearestVisibleFoe(floor, ally);
  if (foe) {
    if (ally.rangedRange !== undefined) {
      const distance = chebyshev(ally.pos, foe.pos);
      if (distance <= effectiveRangedRange(floor, ally) && isStraightLine(ally.pos, foe.pos)) {
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
  ally: AllyActor,
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
function holdAction(floor: FloorState, ally: AllyActor): MonsterAction {
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
  ally: AllyActor,
  foeField: Int32Array,
): MonsterAction {
  const foe = nearestVisibleFoe(floor, ally);
  if (foe) {
    if (ally.rangedRange !== undefined) {
      const distance = chebyshev(ally.pos, foe.pos);
      if (distance <= effectiveRangedRange(floor, ally) && isStraightLine(ally.pos, foe.pos)) {
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
function wander(rng: Rng, floor: FloorState, actor: CombatantActor): MonsterAction {
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
