/**
 * 村の発展(plan/village-development.md)。
 * 物語の進行(章の節目)とゴールド投資の両方を条件に、拠点(ネンネ村)が
 * 段階的に発展していく。章立て(design/story.md)自体は未実装のため、
 * 代わりに既存の最深到達記録(SaveData.deepest)を進行度の代替指標として使う
 * (plan/multiple-dungeons.mdの解放条件と同じ簡略化)。
 *
 * minDeepestの各値は地方境界(plan/region-expansion.mdのREGION_SIZE=6)に
 * 沿わせている(plan/village-stage-rebalance.md)。表の寝穴がMAIN_CAVE_MAX_DEPTH
 * =48に拡張されたことで、旧来の3/6/10という値のままでは村段階4(物語クリア
 * 相当の節目)が第二地方クリア程度の早い段階で満たせてしまうため、
 * 12(第二地方)/24(第四地方)/48(第八地方=完全踏破)に引き上げた。
 */
export type VillageStage = 1 | 2 | 3 | 4;

export interface VillageStageRequirement {
  stage: VillageStage;
  /** 章クリアの代替指標。最深到達記録がこの階以上で満たす */
  minDeepest: number;
  /** 発展に必要なゴールド */
  cost: number;
  label: string;
}

/** 段階を上げる条件。段階1(始まりの村)は既定なので含まない */
export const VILLAGE_STAGE_REQUIREMENTS: readonly VillageStageRequirement[] = [
  { stage: 2, minDeepest: 12, cost: 300, label: "依頼板が建つ" },
  { stage: 3, minDeepest: 24, cost: 800, label: "工房の拡張" },
  { stage: 4, minDeepest: 48, cost: 2000, label: "山を静めたあとの村" },
];

const HUT_CAPACITY: Record<VillageStage, number> = { 1: 8, 2: 12, 3: 20, 4: 30 };

export function hutCapacity(stage: VillageStage): number {
  return HUT_CAPACITY[stage];
}

export function villageStageRequirement(stage: VillageStage): VillageStageRequirement | undefined {
  return VILLAGE_STAGE_REQUIREMENTS.find((r) => r.stage === stage);
}

/** 次の段階への要件。既に最終段階なら undefined */
export function nextVillageStageRequirement(
  stage: VillageStage,
): VillageStageRequirement | undefined {
  return villageStageRequirement(((stage + 1) as VillageStage));
}

export function canDevelopVillage(stage: VillageStage, deepest: number, gold: number): boolean {
  const next = nextVillageStageRequirement(stage);
  if (!next) return false;
  return deepest >= next.minDeepest && gold >= next.cost;
}

import type { StoryChapter } from "./story";

/**
 * 村の暮らし(plan/village-life.md)。NPC・絆の基盤。
 */
export type VillageNpcId = "mogurababa" | "gendo" | "otone" | "okiyo" | "pochi" | "otama";

export interface VillageNpcDef {
  id: VillageNpcId;
  name: string;
  role: string;
  /** 表示に必要な章。省略時は常に表示(design/story.mdの「進行状況で出現が変わるNPC」の実装) */
  appearsFromChapter?: StoryChapter;
}

export const VILLAGE_NPCS: readonly VillageNpcDef[] = [
  { id: "mogurababa", name: "モグラ婆", role: "育ての親・倉庫番" },
  { id: "gendo", name: "樽転がしのゲンド", role: "樽細工職人" },
  { id: "otone", name: "肝いりのオトネ", role: "村の顔役" },
  { id: "okiyo", name: "物知りのおキヨ", role: "生き物に詳しい老人" },
  { id: "pochi", name: "ひよっこのポチ", role: "村の子供" },
  // 第二章到達(design/story.mdの救出イベント後)で出現(plan/story-chapters.md)。
  // plan/village-life.mdが暫定にしていたdeepest>=12条件を、章立て実装により
  // 本来の条件(storyChapter>=2)に差し替えた
  { id: "otama", name: "目覚めたおたま", role: "救出された村人", appearsFromChapter: 2 },
];

export function visibleVillageNpcs(chapter: StoryChapter): readonly VillageNpcDef[] {
  return VILLAGE_NPCS.filter((npc) => npc.appearsFromChapter === undefined || chapter >= npc.appearsFromChapter);
}
