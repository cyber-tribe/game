/**
 * 仲間の経験値・レベルアップ(plan/game/archive/companion-leveling-and-arts.md)。
 * ダイブ中に育つ、育成の第四の軸(夢あわせ・成熟・なじみに続く)。
 */
import type { AllyActor, DreamArtId, Species } from "../core/types";
import { bondBonus } from "./companionBond";
import { addDreamArt, nextLearnableDreamArt } from "./dreamArts";
import { expForLevel, MAX_LEVEL } from "./player";
import { speciesById } from "./species";

/**
 * 仲間の経験値曲線の係数(未決事項: 捕獲階=適正レベル帯から育て直すため、
 * ガルドより軽くして追いつきが苦行にならないようにする。0.7を初期値とする)
 */
const ALLY_EXP_COEFFICIENT = 0.7;

/**
 * ぬしのゆめわざ(plan/game/archive/boss-dream-arts.md): 地方ボス種は経験値
 * テーブルが重く、必要量が通常種の2倍になる。専用のゆめわざ(Lv15)は
 * 長く育てた者だけの到達点にするための調整
 */
const BOSS_EXP_MULTIPLIER = 2;

/** 仲間がこのレベルに上がるのに必要な累計経験値 */
export function allyExpForLevel(level: number, multiplier = 1): number {
  return Math.round(expForLevel(level) * ALLY_EXP_COEFFICIENT * multiplier);
}

/**
 * 種族基礎値・レベル・なじみから、仲間のmaxHp/atk/defを計算し直す。
 * dungeon/populate.tsのcreateAllyFromStored(ねむり小屋から連れ出すとき)と
 * ダイブ中のレベルアップ(game.ts)の両方が、この1つの式を共有する
 * (計算式が2箇所に分かれてズレることを防ぐ)
 */
export function computeAllyStats(
  species: Species,
  level: number,
  bondSuccessCount: number,
): { maxHp: number; atk: number; def: number } {
  const growth = Math.max(0, level - 1) * 0.08;
  const bond = bondBonus(bondSuccessCount);
  const mul = (1 + growth) * (1 + bond);
  return {
    maxHp: Math.round(Math.round(species.maxHp * 1.3) * mul),
    atk: Math.round(Math.round(species.atk * 1.15) * mul),
    def: Math.round(species.def * mul),
  };
}

export interface AllyLevelUpResult {
  levelsGained: number;
  /** レベルアップのたびに、その時点で新しく習得したゆめわざ(習得順) */
  learnedDreamArts: { level: number; id: DreamArtId }[];
}

/**
 * 経験値を加算し、必要なだけレベルアップさせる。レベルアップ時は
 * plan/game/archive/levelup-full-heal.mdのプレイヤー仕様に揃えて全回復する。
 * ステータスは種族基礎値から毎回計算し直す(computeAllyStats)ため、
 * 何度呼んでも値がズレない
 */
export function gainAllyExp(ally: AllyActor, amount: number): AllyLevelUpResult {
  const result: AllyLevelUpResult = { levelsGained: 0, learnedDreamArts: [] };
  if (!ally.speciesId || amount <= 0) return result;
  const species = speciesById(ally.speciesId);
  const expMultiplier = species.isRegionBoss ? BOSS_EXP_MULTIPLIER : 1;
  ally.growthExp = (ally.growthExp ?? 0) + amount;

  while (ally.level < MAX_LEVEL && ally.growthExp >= allyExpForLevel(ally.level + 1, expMultiplier)) {
    ally.level++;
    result.levelsGained++;
    const stats = computeAllyStats(species, ally.level, ally.bondSuccessCount ?? 0);
    ally.maxHp = stats.maxHp;
    ally.atk = stats.atk;
    ally.def = stats.def;
    ally.hp = ally.maxHp; // レベルアップ時は全回復

    const known = ally.dreamArts ?? [];
    const learned = nextLearnableDreamArt(species.dreamArts, ally.level, known);
    if (learned) {
      ally.dreamArts = addDreamArt(known, learned);
      result.learnedDreamArts.push({ level: ally.level, id: learned });
    }
  }
  return result;
}
