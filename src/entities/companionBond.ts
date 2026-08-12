/**
 * なじみ(plan/companion-bond-growth.md)。何も消費せず、ただ一緒に潜り続ける
 * だけで少しずつ強くなる第三の成長軸。夢あわせ・成熟とは違い、既存ステータス
 * (maxHp/atk/def)への小さな掛け率としてのみ効く
 */

/** なじみの段階 */
export type BondStage = "none" | "familiar" | "close" | "irreplaceable";

const STAGES: readonly { threshold: number; stage: BondStage; bonus: number; label: string }[] = [
  { threshold: 30, stage: "irreplaceable", bonus: 0.12, label: "かけがえのない仲間" },
  { threshold: 15, stage: "close", bonus: 0.07, label: "すっかりなじんだ" },
  { threshold: 5, stage: "familiar", bonus: 0.03, label: "なじんできた" },
];

/** 同伴成功回数(bondSuccessCount)から、maxHp/atk/defに掛けるボーナス率を返す。上限+12% */
export function bondBonus(count: number): number {
  for (const s of STAGES) {
    if (count >= s.threshold) return s.bonus;
  }
  return 0;
}

/** 同伴成功回数から段階を返す */
export function bondStage(count: number): BondStage {
  for (const s of STAGES) {
    if (count >= s.threshold) return s.stage;
  }
  return "none";
}

/** 段階の表示名。"none" は空文字(表示しない) */
export function bondStageLabel(stage: BondStage): string {
  return STAGES.find((s) => s.stage === stage)?.label ?? "";
}
