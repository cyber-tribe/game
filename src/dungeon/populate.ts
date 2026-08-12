import type { Rng } from "../core/rng";
import { type Vec2, chebyshev, eq } from "../core/grid";
import {
  type Actor,
  type Barrel,
  type BarrelKind,
  type FloorState,
  type Item,
  type Room,
  type SkillId,
  type Species,
  type TrapKind,
  actorAt,
  barrelAt,
  isWalkable,
  roomContains,
  roomOf,
} from "../core/types";
import { bondBonus } from "../entities/companionBond";
import { shopPrice } from "../entities/shop";
import { fullSkillSet } from "../entities/skills";
import { speciesById, speciesForDepth } from "../entities/species";
import type { StoredMonster } from "../entities/storedMonster";
import { itemsForDepth } from "../items/catalog";
import { randomTileInRoom } from "./generate";

export interface IdSource {
  nextActorId(): number;
  nextItemUid(): number;
  nextBarrelId(): number;
}

const TRAP_KINDS: readonly TrapKind[] = ["damage", "sleep", "alarm", "pitfall", "poison"];

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

/**
 * 仲間になったモンスター。
 * 野生の同種より少しだけ丈夫にしてある。捕まえる手間に見合わないと、
 * わざわざタルをぶつける気にならないため。
 */
export function createAlly(id: number, species: Species, pos: Vec2): Actor {
  const actor = createMonster(id, species, pos);
  actor.kind = "ally";
  actor.maxHp = Math.round(species.maxHp * 1.3);
  actor.hp = actor.maxHp;
  actor.atk = Math.round(species.atk * 1.15);
  actor.exp = 0;
  actor.aware = true;
  applySkills(actor, species, fullSkillSet(species.id));
  return actor;
}

/** 特技一式をactorに反映する。とおなげ(longThrow)は遠隔射程+1に変換する */
function applySkills(actor: Actor, species: Species, skills: SkillId[]): void {
  actor.skills = skills;
  actor.rangedRange = species.range;
  if (skills.includes("longThrow") && actor.rangedRange !== undefined) {
    actor.rangedRange += 1;
  }
}

/**
 * ねむり小屋(plan/monster-fusion.md)から連れ出した仲間を、盤面のアクターに
 * 起こす。レベルに応じてステータスを底上げする(仲間自身の経験値蓄積・
 * レベルアップはまだ実装されていないため、ここでの level は捕獲時や
 * 夢あわせの結果のまま変わらない)。
 */
export function createAllyFromStored(id: number, stored: StoredMonster, pos: Vec2): Actor {
  const species = speciesById(stored.speciesId);
  const actor = createAlly(id, species, pos);
  actor.level = stored.level;
  const growth = Math.max(0, stored.level - 1) * 0.08;
  actor.maxHp = Math.round(actor.maxHp * (1 + growth));
  actor.hp = actor.maxHp;
  actor.atk = Math.round(actor.atk * (1 + growth));
  actor.def = Math.round(actor.def * (1 + growth));
  applySkills(actor, species, fullSkillSet(species.id, stored.skills));
  actor.nickname = stored.nickname;
  // なじみ(plan/companion-bond-growth.md): 種族基礎値・レベル成長とは独立した
  // 最後の一段として、既存ステータスにさらに掛ける
  actor.bondSuccessCount = stored.bondSuccessCount;
  const bond = bondBonus(stored.bondSuccessCount);
  if (bond > 0) {
    actor.maxHp = Math.round(actor.maxHp * (1 + bond));
    actor.hp = actor.maxHp;
    actor.atk = Math.round(actor.atk * (1 + bond));
    actor.def = Math.round(actor.def * (1 + bond));
  }
  // 成熟(plan/companion-evolution.md): ダイブ中は夢あわせを行えないため値自体は
  // 変化しないが、帰還時にactorToStoredMonsterへ引き継ぐために乗せておく
  actor.recentFusionMaterials = stored.recentFusionMaterials;
  return actor;
}

/** 空いている歩行可能マスを探す。条件を満たす場所が無ければ null */
export function findFreeTile(
  rng: Rng,
  floor: FloorState,
  opts: {
    roomsOnly?: boolean;
    /** 指定すれば、この部屋の中だけを探す */
    room?: Room;
    avoid?: Vec2[];
    minDistanceFrom?: { pos: Vec2; distance: number };
  } = {},
): Vec2 | null {
  // 通常の配置ではモンスターハウスの部屋を素通りする。専用の湧かせ枠
  // (populateMonsterHouse)と混ざると、部屋に踏み込んだときの
  // 「ほぼ全員が一斉に主人公を視認する」体験が薄まってしまうため
  const normalRoomPool = floor.rooms.filter((r) => r.kind === undefined);
  for (let attempt = 0; attempt < 200; attempt++) {
    const pos = opts.room
      ? randomTileInRoom(rng, opts.room)
      : opts.roomsOnly
        ? randomTileInRoom(rng, rng.pick(normalRoomPool.length > 0 ? normalRoomPool : floor.rooms))
        : randomWalkable(rng, floor);
    if (!pos) continue;
    if (eq(pos, floor.stairs)) continue;
    if (actorAt(floor, pos)) continue;
    if (barrelAt(floor, pos)) continue;
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

/** プレイヤーの開始地点。できるだけ階段から離れた部屋を選ぶ。モンスターハウスは避ける */
export function choosePlayerStart(rng: Rng, floor: FloorState): Vec2 {
  const candidates = floor.rooms.filter((room) => {
    if (room.kind === "monsterHouse") return false;
    return !roomContains(room, floor.stairs);
  });
  const room = candidates.length > 0 ? rng.pick(candidates) : rng.pick(floor.rooms);
  for (let i = 0; i < 50; i++) {
    const pos = randomTileInRoom(rng, room);
    if (!eq(pos, floor.stairs)) return pos;
  }
  return randomTileInRoom(rng, room);
}

/**
 * 「山分けの階」ギミックでアイテム・タル・モンスターの数を増やす倍率。
 * 増える両者の比率を1:1程度に保つ(plan/floor-gimmicks.md)。
 */
const WINDFALL_MULTIPLIER = 1.5;
/** 「おちあなの階」ギミックで、罠を落とし穴にする確率 */
const PITFALL_GIMMICK_CHANCE = 0.5;

/**
 * 生成した地形の上にモンスター・アイテム・罠を配置する。
 * 深い階ほどモンスターと罠が増える。`floor.gimmick`(plan/floor-gimmicks.md)
 * に応じて出現数・出現内容を調整する。
 */
/** ほこら粉寄せの匂い袋(plan/protagonist-equipment.md)を装備しているときの重み倍率 */
const DUST_LURE_WEIGHT_MULTIPLIER = 3;

/** かがやきの夢のかけら(plan/monster-compendium.md)の出現確率(通常の抽選への追加ロール) */
const SHINING_CHANCE = 0.01;
/** かがやきの夢のかけらのステータス倍率 */
const SHINING_STAT_MULTIPLIER = 1.3;

/** 生成した個体に、確率でかがやきの夢のかけらの補正をかける */
function rollShining(rng: Rng, monster: Actor, shiningChanceMultiplier: number): void {
  if (!rng.chance(SHINING_CHANCE * shiningChanceMultiplier)) return;
  monster.shining = true;
  monster.maxHp = Math.round(monster.maxHp * SHINING_STAT_MULTIPLIER);
  monster.hp = monster.maxHp;
  monster.atk = Math.round(monster.atk * SHINING_STAT_MULTIPLIER);
  monster.def = Math.round(monster.def * SHINING_STAT_MULTIPLIER);
}

export function populateFloor(
  rng: Rng,
  floor: FloorState,
  ids: IdSource,
  playerStart: Vec2,
  /** ほこら粉寄せの匂い袋を装備中なら "hokoraDust" を渡す。出現重みを底上げする */
  boostedItemDefId?: string,
  /** 万引き済みで警戒状態(plan/shops-and-thieves.md)なら true。売値が割高になる */
  shopWary = false,
  /** 図鑑コンプリート済みなら、かがやきの夢のかけらの出現確率に掛ける倍率(plan/monster-compendium.md) */
  shiningChanceMultiplier = 1,
  /** 難易度モード(plan/difficulty-modes.md)による、モンスターの攻撃力に掛ける倍率 */
  monsterAtkMultiplier = 1,
  /** 難易度モード(plan/difficulty-modes.md)による、金貨の山の量に掛ける倍率 */
  goldRewardMultiplier = 1,
  /**
   * ダンジョンごと(plan/multiple-dungeons.md)の、出現モンスター・アイテムの
   * 抽選テーブルに足す深さのずれ。実際の階数(floor.depth、モンスター数や
   * 金貨の量に使う)はそのままで、テーブル選択だけをずらす
   */
  speciesDepthOffset = 0,
): void {
  const gimmick = floor.gimmick;
  const tableDepth = Math.max(1, floor.depth + speciesDepthOffset);
  const pool = speciesForDepth(tableDepth);
  const baseMonsterCount = Math.min(12, 4 + Math.floor(floor.depth / 2));
  const monsterCount =
    gimmick === "silence"
      ? 0
      : gimmick === "windfall"
        ? Math.round(baseMonsterCount * WINDFALL_MULTIPLIER)
        : baseMonsterCount;
  for (let i = 0; i < monsterCount; i++) {
    const pos = findFreeTile(rng, floor, {
      roomsOnly: true,
      minDistanceFrom: { pos: playerStart, distance: 6 },
    });
    if (!pos) break;
    const species = rng.pickWeighted(pool, (s) => s.weight);
    const monster = createMonster(ids.nextActorId(), species, pos);
    if (gimmick === "alert") monster.aware = true;
    monster.atk = Math.round(monster.atk * monsterAtkMultiplier);
    rollShining(rng, monster, shiningChanceMultiplier);
    floor.actors.push(monster);

    // swarm(plan/monster-compendium.md): 生成時に複数体まとまって配置される。
    // 群れの残りは、最初の1体と同じ部屋の空きマスを探して置く(部屋がなければ諦める)
    if (species.ai === "swarm" && species.swarmSize) {
      const room = roomOf(floor, pos);
      if (room) {
        const [min, max] = species.swarmSize;
        const extra = rng.int(min, max) - 1;
        const placed = [pos];
        for (let j = 0; j < extra; j++) {
          const nearPos = findFreeTile(rng, floor, { room, avoid: placed });
          if (!nearPos) break;
          placed.push(nearPos);
          const companion = createMonster(ids.nextActorId(), species, nearPos);
          if (gimmick === "alert") companion.aware = true;
          companion.atk = Math.round(companion.atk * monsterAtkMultiplier);
          rollShining(rng, companion, shiningChanceMultiplier);
          floor.actors.push(companion);
        }
      }
    }
  }

  const itemPool = itemsForDepth(tableDepth);
  const baseItemCount = rng.int(3, 6);
  const itemCount =
    gimmick === "windfall" ? Math.round(baseItemCount * WINDFALL_MULTIPLIER) : baseItemCount;
  for (let i = 0; i < itemCount; i++) {
    const pos = findFreeTile(rng, floor, { roomsOnly: true, avoid: [playerStart] });
    if (!pos) break;
    const def = rng.pickWeighted(itemPool, (d) =>
      d.id === boostedItemDefId ? d.weight * DUST_LURE_WEIGHT_MULTIPLIER : d.weight,
    );
    floor.items.push({ item: createItem(ids.nextItemUid(), def.id, def.charges), pos });
  }

  const trapCount = Math.min(8, 2 + Math.floor(floor.depth / 3));
  for (let i = 0; i < trapCount; i++) {
    const pos = findFreeTile(rng, floor, {
      avoid: [playerStart],
      minDistanceFrom: { pos: playerStart, distance: 3 },
    });
    if (!pos) break;
    const kind: TrapKind =
      gimmick === "pitfall" && rng.chance(PITFALL_GIMMICK_CHANCE) ? "pitfall" : rng.pick(TRAP_KINDS);
    floor.traps.push({ pos, kind, revealed: false });
  }

  const goldCount = rng.int(2, 5);
  for (let i = 0; i < goldCount; i++) {
    const pos = findFreeTile(rng, floor, { roomsOnly: true, avoid: [playerStart] });
    if (!pos) break;
    const amount = Math.round(rng.int(5, 10 + floor.depth * 4) * goldRewardMultiplier);
    floor.goldPiles.push({ id: ids.nextItemUid(), pos, amount });
  }

  placeBarrels(rng, floor, ids, playerStart);
  populateMonsterHouse(rng, floor, ids, shiningChanceMultiplier, monsterAtkMultiplier, speciesDepthOffset);
  populateShop(rng, floor, ids, shopWary, speciesDepthOffset);
}

/**
 * 近道屋の出店(plan/shops-and-thieves.md)の部屋があれば、店主と
 * 売り物を置く。店主は万引きされるまで動かず攻撃もしない
 */
function populateShop(
  rng: Rng,
  floor: FloorState,
  ids: IdSource,
  wary: boolean,
  speciesDepthOffset = 0,
): void {
  const room = floor.rooms.find((r) => r.kind === "shop");
  if (!room) return;

  // 「しじまの階」ギミック中は野生モンスターが一切湧かない。店主は野生の
  // モンスターではないが、既存のテスト前提(この階はkind:"monster"が0体)を
  // 尊重し、売り物だけは変わらず置いたまま店主だけを省く
  const keeperPos = floor.gimmick === "silence" ? null : findFreeTile(rng, floor, { room });
  if (keeperPos) {
    floor.actors.push({
      id: ids.nextActorId(),
      kind: "monster",
      name: "近道屋の行商人",
      model: "gajiri",
      pos: keeperPos,
      facing: 4,
      hp: 999,
      maxHp: 999,
      atk: 30,
      def: 10,
      level: 1,
      statuses: [],
      alive: true,
      aiKind: "shopkeeper",
      aware: true,
    });
  }

  const itemPool = itemsForDepth(Math.max(1, floor.depth + speciesDepthOffset));
  const goodsCount = rng.int(2, 4);
  for (let i = 0; i < goodsCount; i++) {
    const pos = findFreeTile(rng, floor, { room });
    if (!pos) break;
    const def = rng.pickWeighted(itemPool, (d) => d.weight);
    const item = createItem(ids.nextItemUid(), def.id, def.charges);
    floor.items.push({ item, pos, forSale: { price: shopPrice(def, item, wary) } });
  }
}

/**
 * モンスターハウス(plan/monster-house.md)の部屋があれば、通常のモンスター
 * 予算とは別枠でまとめて湧かせる。全員 aware: false のまま部屋に置くだけで、
 * 入室した瞬間ほぼ全員が同時にプレイヤーを視認する。ご褒美も部屋の中に置く。
 *
 * 「しじまの階」ギミック中は野生モンスターが一切湧かないので、
 * モンスターハウスの中身も湧かせない(ご褒美だけは変わらず置く)。
 */
function populateMonsterHouse(
  rng: Rng,
  floor: FloorState,
  ids: IdSource,
  shiningChanceMultiplier: number,
  monsterAtkMultiplier = 1,
  speciesDepthOffset = 0,
): void {
  const room = floor.rooms.find((r) => r.kind === "monsterHouse");
  if (!room) return;

  if (floor.gimmick !== "silence") {
    const pool = speciesForDepth(Math.max(1, floor.depth + speciesDepthOffset));
    const monsterCount = Math.min(8, 5 + Math.floor(floor.depth / 10));
    for (let i = 0; i < monsterCount; i++) {
      const pos = findFreeTile(rng, floor, { room });
      if (!pos) break;
      const species = rng.pickWeighted(pool, (s) => s.weight);
      const monster = createMonster(ids.nextActorId(), species, pos);
      if (floor.gimmick === "alert") monster.aware = true;
      monster.atk = Math.round(monster.atk * monsterAtkMultiplier);
      rollShining(rng, monster, shiningChanceMultiplier);
      floor.actors.push(monster);
    }
  }

  const itemPool = itemsForDepth(Math.max(1, floor.depth + speciesDepthOffset));
  const rewardCount = rng.int(1, 2);
  for (let i = 0; i < rewardCount; i++) {
    const pos = findFreeTile(rng, floor, { room });
    if (!pos) break;
    const def = rng.pickWeighted(itemPool, (d) => d.weight);
    floor.items.push({ item: createItem(ids.nextItemUid(), def.id, def.charges), pos });
  }
}

/**
 * タルを撒く。空のタルが主役なので多めに、爆発タルは深い階ほど混ざる。
 * タルが無いと仲間を捕まえられないので、どの階にも必ず数個は置く。
 */
function placeBarrels(rng: Rng, floor: FloorState, ids: IdSource, playerStart: Vec2): void {
  const baseCount = rng.int(3, 5);
  const count =
    floor.gimmick === "windfall" ? Math.round(baseCount * WINDFALL_MULTIPLIER) : baseCount;
  const bombChance = Math.min(0.4, 0.08 + floor.depth * 0.035);
  for (let i = 0; i < count; i++) {
    const pos = findFreeTile(rng, floor, {
      roomsOnly: true,
      avoid: [playerStart],
      minDistanceFrom: { pos: playerStart, distance: 2 },
    });
    if (!pos) break;
    const kind: BarrelKind = rng.chance(bombChance) ? "bomb" : "empty";
    floor.barrels.push({ id: ids.nextBarrelId(), kind, pos });
  }
}

export function createBarrel(id: number, kind: BarrelKind, pos: Vec2, speciesId?: string): Barrel {
  return speciesId === undefined ? { id, kind, pos } : { id, kind, pos, speciesId };
}

/**
 * 探索中に湧いてくるモンスター。プレイヤーから離れた場所にだけ出す。
 * 「しじまの階」ギミック中は野生モンスターがまったく湧かない。
 */
export function spawnWanderingMonster(
  rng: Rng,
  floor: FloorState,
  ids: IdSource,
  playerPos: Vec2,
  speciesDepthOffset = 0,
): Actor | null {
  if (floor.gimmick === "silence") return null;
  const pos = findFreeTile(rng, floor, {
    roomsOnly: true,
    minDistanceFrom: { pos: playerPos, distance: 8 },
  });
  if (!pos) return null;
  const pool = speciesForDepth(Math.max(1, floor.depth + speciesDepthOffset));
  const species = rng.pickWeighted(pool, (s) => s.weight);
  const monster = createMonster(ids.nextActorId(), species, pos);
  if (floor.gimmick === "alert") monster.aware = true;
  floor.actors.push(monster);
  return monster;
}
