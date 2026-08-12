/**
 * 村の発展(plan/village-development.md)。
 * 物語の進行(章の節目)とゴールド投資の両方を条件に、拠点(ネンネ村)が
 * 段階的に発展していく。章立て(design/story.md)自体は未実装のため、
 * 代わりに既存の最深到達記録(SaveData.deepest)を進行度の代替指標として使う
 * (plan/multiple-dungeons.mdの解放条件と同じ簡略化)。
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
  { stage: 2, minDeepest: 3, cost: 300, label: "依頼板が建つ" },
  { stage: 3, minDeepest: 6, cost: 800, label: "工房の拡張" },
  { stage: 4, minDeepest: 10, cost: 2000, label: "山を静めたあとの村" },
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
