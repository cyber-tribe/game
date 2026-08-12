import type { StoredMonster } from "./storedMonster";

/**
 * 仲間の成熟(plan/companion-evolution.md)。夢あわせ(plan/monster-fusion.md、
 * アーカイブ済み)の「何を糧に選んだか」によって、軸にした仲間が別の姿へ育つ。
 */
export interface EvolutionRule {
  fromSpeciesId: string;
  toSpeciesId: string;
  requiredLevel: number;
  /** 直近lookbackFusions回の夢あわせのうち、過半数がこの種族(または種族グループ)であること */
  triggerMaterial: string | string[];
  lookbackFusions: number;
}

export const EVOLUTION_RULES: readonly EvolutionRule[] = [
  {
    fromSpeciesId: "gajiri",
    toSpeciesId: "ishizuenezumi",
    requiredLevel: 10,
    triggerMaterial: "honegarami",
    lookbackFusions: 3,
  },
  {
    fromSpeciesId: "purun",
    toSpeciesId: "tokoshiepurun",
    requiredLevel: 10,
    triggerMaterial: "purun",
    lookbackFusions: 3,
  },
  {
    fromSpeciesId: "purun",
    toSpeciesId: "yumemirupurun",
    requiredLevel: 10,
    triggerMaterial: "madoromi",
    lookbackFusions: 3,
  },
];

/** 直近の夢あわせ履歴(recentFusionMaterials)を1件分保持する上限。全ルールのlookbackFusionsの最大値でよい */
export const MAX_RECENT_FUSION_MATERIALS = Math.max(...EVOLUTION_RULES.map((r) => r.lookbackFusions));

/**
 * 夢あわせ後の個体が成熟条件を満たしていれば、種族を置き換えて返す。
 * 満たしていなければ何もせずそのまま返す。
 *
 * ステータス・AI・特技は`speciesId`から常に再計算される設計(createAllyFromStored、
 * fullSkillSet)のため、ここでは`speciesId`を差し替えるだけで、本文が言う
 * 「種族基礎値のカーブに乗り直す」再計算が自動的に成立する
 */
export function tryEvolve(monster: StoredMonster): StoredMonster {
  const rule = EVOLUTION_RULES.find((r) => {
    if (r.fromSpeciesId !== monster.speciesId) return false;
    if (monster.level < r.requiredLevel) return false;
    const recent = monster.recentFusionMaterials.slice(-r.lookbackFusions);
    if (recent.length < r.lookbackFusions) return false;
    const materials = Array.isArray(r.triggerMaterial) ? r.triggerMaterial : [r.triggerMaterial];
    const matchCount = recent.filter((id) => materials.includes(id)).length;
    return matchCount > recent.length / 2;
  });
  if (!rule) return monster;
  return { ...monster, speciesId: rule.toSpeciesId };
}
