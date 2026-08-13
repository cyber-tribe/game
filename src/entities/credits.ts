import { SPECIES } from "./species";
import { VILLAGE_NPCS } from "./village";

/**
 * エンドロール(plan/ending-sequence.md)。実在の制作者名の代わりに、
 * ゲーム内の制作物一覧(モンスター・地方・NPCの名前)を実質的な
 * クレジットとして使う。
 */

/** design/regions.mdの8地方。地方名を保持する既存のデータ構造は無いため、ここに直接書く */
export const CREDIT_REGIONS: readonly string[] = [
  "うたたねの参道",
  "忘れ潮の湿地",
  "まどろみの茸林",
  "骨積みの回廊",
  "なみだの滝つぼ",
  "こだまの尾根",
  "わすれられた祭りの跡",
  "めざめの前庭",
];

/** 村のNPCの一覧。既存のVILLAGE_NPCSから生成し、二重管理を避ける */
export function creditVillagerNames(): string[] {
  return VILLAGE_NPCS.map((npc) => npc.name);
}

/** モンスター(夢のかけら)の一覧。既存のSPECIESから生成し、追加のたびの手作業更新を無くす */
export function creditMonsterNames(): string[] {
  return SPECIES.map((s) => s.name);
}
