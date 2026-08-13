import type { Actor, SkillId } from "../core/types";

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
  // ---- ここから plan/monster-compendium.md ----
  {
    id: "ambushStrike",
    name: "ふいのいちげき",
    description: "そのランの最初の1撃のダメージ+50%。",
  },
  {
    id: "confusingClaw",
    name: "みだしのつめ",
    description: "攻撃時、低確率で相手を混乱させる。",
  },
  {
    id: "burrowEscape",
    name: "とんずら",
    description: "瀕死になると1回だけ、その場から離脱してダメージを避ける(1ラン1回)。",
  },
  {
    id: "flutterDodge",
    name: "はねひらり",
    description: "被弾を確率でかわし、無効化する。",
  },
  {
    id: "sealBite",
    name: "ふうじのキバ",
    description: "攻撃時、低確率で相手を封じる。",
  },
  {
    id: "slowMend",
    name: "しずけさのいやし",
    description: "被弾しなかったターンに、わずかにHPが回復する。",
  },
  {
    id: "warnCall",
    name: "かく乱のこだま",
    description: "周囲の敵が新たに気づく確率をわずかに下げる。",
  },
  {
    id: "disguise",
    name: "みをかくす",
    description: "複数の相手に隣接されたとき、自分が狙われにくくなる。",
  },
  // ---- ここから plan/companion-evolution.md ----
  {
    id: "steadfastBody",
    name: "ゆるがぬからだ",
    description: "被弾ダメージを必ず1割軽減する(「みをまもる」の常時発動版)。",
  },
];

/** 種族固有の特技(由来種族を捕まえた/夢あわせで習得した個体が持つ) */
export const NATIVE_SKILL_BY_SPECIES: Record<string, SkillId> = {
  gajiri: "quickStart",
  madoromi: "drowsyBreath",
  tsubute: "longThrow",
  honegarami: "stubborn",
  purun: "softBody",
  // ---- ここから plan/monster-compendium.md ----
  moyautsubo: "ambushStrike",
  wasuregani: "confusingClaw",
  yumekuimogura: "burrowEscape",
  horoholocho: "flutterDodge",
  yoroimukade: "sealBite",
  urumiguma: "slowMend",
  yamabikogitsune: "warnCall",
  menkaburikozo: "ambushStrike",
  yumemayoinokage: "disguise",
  // オイテケボシ・しずくうお・こだまうさぎ・かざりだるま・ヨリシロの残響: 特技なし
  // ---- ここから plan/monster-roster-expansion-species.md ----
  // まどろみぐも: モヤウツボと同系統のambushStrike。他29種は「特技なし」が大半という
  // 既存比率(plan/archive/monster-compendium.md参照)を踏襲し、意図的に増やさない
  madoromigumo: "ambushStrike",
  // ---- ここから plan/companion-evolution.md ----
  tokoshiepurun: "steadfastBody",
  // いしずえねずみ: 特技なし(coward→guardのAI変化とステータス底上げが本体)
  // ゆめみるぷるん: 特技ではなくspecies.inflicts(眠り付与)そのもので表現する
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

/** 夢あわせ(plan/monster-fusion.md)で得た特技を持っているか。特技を持てるのは仲間だけ */
export function hasSkill(actor: Actor, id: SkillId): boolean {
  return actor.kind === "ally" && (actor.skills?.includes(id) ?? false);
}
