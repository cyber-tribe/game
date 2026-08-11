import type { Actor, Barrel } from "../core/types";
import { type Inventory, createInventory, shieldBonus, weaponBonus } from "../items/inventory";

export const MAX_SATIETY = 100;

/** 同時に連れ歩ける仲間の数 */
export const MAX_ALLIES = 2;

export interface PlayerState extends Actor {
  kind: "player";
  exp: number;
  satiety: number;
  maxSatiety: number;
  inventory: Inventory;
  gold: number;
  /** 頭上に抱えているタル。抱えている間は攻撃できない */
  carrying: Barrel | null;
}

/** レベル n に上がるのに必要な累計経験値 */
const EXP_TABLE: readonly number[] = [
  0, 0, 10, 25, 50, 90, 150, 235, 350, 500, 700, 960, 1290, 1700, 2200, 2800, 3550, 4450, 5550,
  6900, 8500,
];

export const MAX_LEVEL = EXP_TABLE.length - 1;

export function expForLevel(level: number): number {
  if (level <= 1) return 0;
  if (level > MAX_LEVEL) return Number.POSITIVE_INFINITY;
  return EXP_TABLE[level]!;
}

/** 次のレベルまであといくつか。最大レベルなら null */
export function expToNext(player: PlayerState): number | null {
  if (player.level >= MAX_LEVEL) return null;
  return expForLevel(player.level + 1) - player.exp;
}

export function createPlayer(id: number): PlayerState {
  return {
    id,
    kind: "player",
    name: "ガルド",
    model: "garudo",
    pos: { x: 0, y: 0 },
    facing: 4,
    hp: 25,
    maxHp: 25,
    atk: 8,
    def: 4,
    level: 1,
    exp: 0,
    statuses: [],
    alive: true,
    satiety: MAX_SATIETY,
    maxSatiety: MAX_SATIETY,
    inventory: createInventory(),
    gold: 0,
    carrying: null,
  };
}

/** 装備込みの攻撃力 */
export function totalAttack(player: PlayerState): number {
  return player.atk + weaponBonus(player.inventory);
}

/** 装備込みの守備力 */
export function totalDefense(player: PlayerState): number {
  return player.def + shieldBonus(player.inventory);
}

/**
 * 経験値を加算し、上がったレベルの数を返す。
 * 一度に複数レベル上がることもあるのでループで判定する。
 */
export function gainExp(player: PlayerState, amount: number): number {
  player.exp += amount;
  let levelsGained = 0;
  while (player.level < MAX_LEVEL && player.exp >= expForLevel(player.level + 1)) {
    player.level++;
    levelsGained++;
    player.maxHp += 6;
    player.hp += 6;
    player.atk += 2;
    player.def += 1;
  }
  return levelsGained;
}
