import type { SkillId } from "../core/types";

export type { SkillId };

/**
 * 夢あわせ(plan/monster-fusion.md、アーカイブ済み)で引き継げる特技。
 * 種族ごとに1つ、素の生態に紐づく特技を割り当てる。既存の
 * `inflicts`/`ai`/`range` とは別に、戦闘へ小さな補正を足すだけに留める。
 */
export interface SkillDef {
  id: SkillId;
  name: string;
  description: string;
}

export const SKILLS: readonly SkillDef[] = [
  { id: "quickStart", name: "ふいうち", description: "そのランの最初の1手を必ず先制できる。" },
  {
    id: "drowsyBreath",
    name: "ねむりごな",
    description: "隣接する敵を攻撃したとき、眠り付与の確率に+10%。",
  },
  { id: "longThrow", name: "とおなげ", description: "遠隔攻撃の射程+1。" },
  {
    id: "stubborn",
    name: "ふんばり",
    description: "HPが1残っていれば、致死ダメージを1回だけ耐える(1ラン1回)。",
  },
  { id: "softBody", name: "みをまもる", description: "被弾ダメージを確率5割で1割軽減する。" },
];

/** 種族固有の特技(由来種族を捕まえた/夢あわせで習得した個体が持つ) */
export const NATIVE_SKILL_BY_SPECIES: Record<string, SkillId> = {
  gajiri: "quickStart",
  madoromi: "drowsyBreath",
  tsubute: "longThrow",
  honegarami: "stubborn",
  purun: "softBody",
};

/** 1体が同時に持てる特技の最大数(自分の種族由来 + 夢あわせで得た1つ、程度の枠) */
export const MAX_SKILLS = 2;

export function skillDef(id: SkillId): SkillDef {
  const def = SKILLS.find((s) => s.id === id);
  if (!def) throw new Error(`未知の特技: ${id}`);
  return def;
}

/**
 * 個体が実際に持つ特技一式。種族由来(native)は常に暗黙で持ち、保存する
 * のは夢あわせで追加された分だけにする(冗長な二重管理を避けるため)。
 */
export function fullSkillSet(speciesId: string, extra: readonly SkillId[] = []): SkillId[] {
  const native = NATIVE_SKILL_BY_SPECIES[speciesId];
  const set = new Set<SkillId>(extra);
  if (native) set.add(native);
  return [...set];
}
