import type { Rng } from "../core/rng";
import { type Vec2, chebyshev, eq } from "../core/grid";
import {
  type Actor,
  type FloorState,
  type Item,
  type Species,
  type TrapKind,
  actorAt,
  isWalkable,
} from "../core/types";
import { speciesForDepth } from "../entities/species";
import { itemsForDepth } from "../items/catalog";
import { randomTileInRoom } from "./generate";

export interface IdSource {
  nextActorId(): number;
  nextItemUid(): number;
}

const TRAP_KINDS: readonly TrapKind[] = ["damage", "sleep", "alarm", "pitfall"];

export function createMonster(id: number, species: Species, pos: Vec2): Actor {
  return {
    id,
    kind: "monster",
    name: species.name,
    speciesId: species.id,
    model: species.model,
    pos,
    facing: 4,
    hp: species.maxHp,
    maxHp: species.maxHp,
    atk: species.atk,
    def: species.def,
    level: 1,
    statuses: [],
    alive: true,
    aiKind: species.ai,
    rangedRange: species.range,
    inflicts: species.inflicts,
    exp: species.exp,
    aware: false,
  };
}

export function createItem(uid: number, defId: string, charges?: number): Item {
  return charges === undefined ? { uid, defId } : { uid, defId, charges };
}

/** 空いている歩行可能マスを探す。条件を満たす場所が無ければ null */
export function findFreeTile(
  rng: Rng,
  floor: FloorState,
  opts: { roomsOnly?: boolean; avoid?: Vec2[]; minDistanceFrom?: { pos: Vec2; distance: number } } = {},
): Vec2 | null {
  for (let attempt = 0; attempt < 200; attempt++) {
    const pos = opts.roomsOnly
      ? randomTileInRoom(rng, rng.pick(floor.rooms))
      : randomWalkable(rng, floor);
    if (!pos) continue;
    if (eq(pos, floor.stairs)) continue;
    if (actorAt(floor, pos)) continue;
    if (floor.items.some((gi) => eq(gi.pos, pos))) continue;
    if (floor.traps.some((t) => eq(t.pos, pos))) continue;
    if (opts.avoid?.some((a) => eq(a, pos))) continue;
    const md = opts.minDistanceFrom;
    if (md && chebyshev(pos, md.pos) < md.distance) continue;
    return pos;
  }
  return null;
}

function randomWalkable(rng: Rng, floor: FloorState): Vec2 | null {
  for (let i = 0; i < 50; i++) {
    const x = rng.int(1, floor.width - 2);
    const y = rng.int(1, floor.height - 2);
    if (isWalkable(floor.tiles[y * floor.width + x]!.kind)) return { x, y };
  }
  return null;
}

/** プレイヤーの開始地点。できるだけ階段から離れた部屋を選ぶ */
export function choosePlayerStart(rng: Rng, floor: FloorState): Vec2 {
  const candidates = floor.rooms.filter((room) => {
    const inStairsRoom =
      floor.stairs.x >= room.x &&
      floor.stairs.x < room.x + room.w &&
      floor.stairs.y >= room.y &&
      floor.stairs.y < room.y + room.h;
    return !inStairsRoom;
  });
  const room = candidates.length > 0 ? rng.pick(candidates) : rng.pick(floor.rooms);
  for (let i = 0; i < 50; i++) {
    const pos = randomTileInRoom(rng, room);
    if (!eq(pos, floor.stairs)) return pos;
  }
  return randomTileInRoom(rng, room);
}

/**
 * 生成した地形の上にモンスター・アイテム・罠を配置する。
 * 深い階ほどモンスターと罠が増える。
 */
export function populateFloor(
  rng: Rng,
  floor: FloorState,
  ids: IdSource,
  playerStart: Vec2,
): void {
  const pool = speciesForDepth(floor.depth);
  const monsterCount = Math.min(12, 4 + Math.floor(floor.depth / 2));
  for (let i = 0; i < monsterCount; i++) {
    const pos = findFreeTile(rng, floor, {
      roomsOnly: true,
      minDistanceFrom: { pos: playerStart, distance: 6 },
    });
    if (!pos) break;
    const species = rng.pickWeighted(pool, (s) => s.weight);
    floor.actors.push(createMonster(ids.nextActorId(), species, pos));
  }

  const itemPool = itemsForDepth(floor.depth);
  const itemCount = rng.int(3, 6);
  for (let i = 0; i < itemCount; i++) {
    const pos = findFreeTile(rng, floor, { roomsOnly: true, avoid: [playerStart] });
    if (!pos) break;
    const def = rng.pickWeighted(itemPool, (d) => d.weight);
    floor.items.push({ item: createItem(ids.nextItemUid(), def.id, def.charges), pos });
  }

  const trapCount = Math.min(8, 2 + Math.floor(floor.depth / 3));
  for (let i = 0; i < trapCount; i++) {
    const pos = findFreeTile(rng, floor, {
      avoid: [playerStart],
      minDistanceFrom: { pos: playerStart, distance: 3 },
    });
    if (!pos) break;
    floor.traps.push({ pos, kind: rng.pick(TRAP_KINDS), revealed: false });
  }
}

/** 探索中に湧いてくるモンスター。プレイヤーから離れた場所にだけ出す */
export function spawnWanderingMonster(
  rng: Rng,
  floor: FloorState,
  ids: IdSource,
  playerPos: Vec2,
): Actor | null {
  const pos = findFreeTile(rng, floor, {
    roomsOnly: true,
    minDistanceFrom: { pos: playerPos, distance: 8 },
  });
  if (!pos) return null;
  const pool = speciesForDepth(floor.depth);
  const species = rng.pickWeighted(pool, (s) => s.weight);
  const monster = createMonster(ids.nextActorId(), species, pos);
  floor.actors.push(monster);
  return monster;
}
