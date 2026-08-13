import type { Barrel, PlayerActor } from "../core/types";
import { type ArtId, createArtCooldowns } from "./arts";
import { type Inventory, createInventory, headBonus, shieldBonus, weaponBonus } from "../items/inventory";

export const MAX_SATIETY = 100;

/** 同時に連れ歩ける仲間の数 */
export const MAX_ALLIES = 2;

/**
 * 鍛え方(plan/protagonist-training.md、アーカイブ済み)。
 * レベルアップのたびの成長配分の方針。maxHp+6 はどれを選んでも共通。
 */
export type TrainingFocus = "offense" | "defense" | "balance";

export interface PlayerState extends PlayerActor {
  kind: "player";
  exp: number;
  satiety: number;
  maxSatiety: number;
  inventory: Inventory;
  gold: number;
  /** 頭上に抱えているタル。抱えている間は攻撃できない */
  carrying: Barrel | null;
  /** 身構え中(足踏みの直後)。次に被弾するまで被ダメージが軽減される */
  guarding: boolean;
  /** 樽守りの技(plan/protagonist-arts.md)の残りクールダウンターン数 */
  artCooldowns: Record<ArtId, number>;
  /** 会心の樽投げが有効。次に投げるからのタルの威力・捕獲判定を最大にする */
  critBarrelReady: boolean;
  /** 樽受け身が有効。次の1回の被弾ダメージを無効にする(1ターンだけ) */
  ukemiReady: boolean;
  /** 抱え投げの奥義が有効。次に投げるタルを貫通させる */
  pierceReady: boolean;
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
    guarding: false,
    artCooldowns: createArtCooldowns(),
    critBarrelReady: false,
    ukemiReady: false,
    pierceReady: false,
  };
}

/** 装備込みの攻撃力 */
export function totalAttack(player: PlayerState): number {
  return player.atk + weaponBonus(player.inventory);
}

/** 装備込みの守備力 */
export function totalDefense(player: PlayerState): number {
  return player.def + shieldBonus(player.inventory) + headBonus(player.inventory);
}

/**
 * 経験値を加算し、上がったレベルの数を返す。
 * 一度に複数レベル上がることもあるのでループで判定する。
 *
 * maxHp+6 はどの鍛え方でも共通の保証として残し、残りの成長を focus で
 * 振り分ける("balance" は現行の固定成長 atk+2/def+1 に近い配分)。
 */
export function gainExp(
  player: PlayerState,
  amount: number,
  focus: TrainingFocus = "balance",
): number {
  player.exp += amount;
  let levelsGained = 0;
  while (player.level < MAX_LEVEL && player.exp >= expForLevel(player.level + 1)) {
    player.level++;
    levelsGained++;
    player.maxHp += 6;
    player.hp = player.maxHp;
    if (focus === "offense") {
      player.atk += 3;
    } else if (focus === "defense") {
      player.def += 2;
    } else {
      player.atk += 1;
      player.def += 1;
    }
  }
  return levelsGained;
}
