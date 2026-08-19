import type { DreamArtId, SkillId } from "../core/types";

/**
 * ねむり小屋(plan/monster-fusion.md、アーカイブ済み)に預けてある仲間。
 * `save.ts`(永続化)と `game.ts`(ダイブ開始時の仲間生成)の両方が
 * 参照するため、どちらにも依存しないこの場所に定義を置く。
 */
export interface StoredMonster {
  /** ねむり小屋の中で個体を識別する連番 */
  uid: number;
  speciesId: string;
  level: number;
  /** 仲間の蓄積経験値(plan/game/archive/companion-leveling-and-arts.md) */
  exp: number;
  /** 習得済みのゆめわざ。最大2つ。entities/dreamArts.tsのDREAM_ARTSが定義を持つ */
  dreamArts: DreamArtId[];
  /** 夢あわせで引き継いだ特技(種族由来のnativeは含まない)。最大 MAX_SKILLS-1 個 */
  skills: SkillId[];
  /** プレイヤーがつけた名前。任意 */
  nickname?: string;
  /**
   * なじみ(plan/companion-bond-growth.md)。連れて行って踏破・区切りで
   * 生きて持ち帰った回数。夢あわせで軸にすると引き継ぎ、糧にすると消える
   */
  bondSuccessCount: number;
  /**
   * 成熟(plan/companion-evolution.md)。直近の夢あわせで糧に選んだ種族idの履歴
   * (新しい順ではなく古い順。MAX_RECENT_FUSION_MATERIALS件だけ保持)
   */
  recentFusionMaterials: string[];
  /**
   * お気に入り(plan/companion-favorite-lock.md)。trueの個体は、夢あわせの
   * 糧・夢に還す、の対象として選べなくなる(誤操作防止)。既定はfalse相当
   */
  favorite?: boolean;
}
