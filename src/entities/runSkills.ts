/**
 * レベルアップ時のスキル選択(plan/game/archive/run-build-skills.md)。
 * ガルドはダイブごとにLv1から始まり、レベルアップのたびに3系統
 * (攻撃・支援・タル)1件ずつの3択からスキルを1つ選んで、そのダイブ
 * 限りのビルドを組む。「鍛え方」による数値の自動成長とは役割が別
 * (数値は鍛え方、選択肢はこのスキル)。
 *
 * この1ファイルが「系統・表示名・説明」の単一の情報源になる。実際の
 * 効果はgame.ts側の各所(attack・killActor・useItem等)が
 * `this.runSkills.includes(id)` を直接見て判定する(dreamArtsのような
 * 専用実行レジストリを持つほど個々の効果が均質ではないため、素朴な判定に留めた)
 */
import type { Rng } from "../core/rng";
import type { RunSkillId } from "../core/types";

export type RunSkillCategory = "attack" | "support" | "barrel";

export interface RunSkillDef {
  id: RunSkillId;
  name: string;
  category: RunSkillCategory;
  description: string;
}

export const RUN_SKILLS: Readonly<Record<RunSkillId, RunSkillDef>> = {
  // ---- 攻撃系統 ----
  wideSlash: {
    id: "wideSlash",
    name: "なぎはらい",
    category: "attack",
    description: "攻撃が正面3方向に当たるようになる。",
  },
  stepIn: {
    id: "stepIn",
    name: "ふみこみ",
    category: "attack",
    description: "攻撃の間合いが1マス伸びる。",
  },
  launcher: {
    id: "launcher",
    name: "かちあげ",
    category: "attack",
    description: "攻撃した敵を1マス吹き飛ばす。",
  },
  braced: {
    id: "braced",
    name: "がまんのかまえ",
    category: "attack",
    description: "足踏みした直後の1撃は、与ダメージが2倍になる。",
  },
  allIn: {
    id: "allIn",
    name: "すてみ",
    category: "attack",
    description: "与ダメージ+50%、被ダメージ+25%(常時)。",
  },
  finisher: {
    id: "finisher",
    name: "とどめのさき",
    category: "attack",
    description: "HP1/4以下の敵への攻撃が必ず急所に当たる。",
  },
  // ---- 支援系統 ----
  sharingHand: {
    id: "sharingHand",
    name: "わけあう手",
    category: "support",
    description: "回復の草を使うと、隣接する仲間にも半分の効果が及ぶ。",
  },
  encouragement: {
    id: "encouragement",
    name: "はげましの声",
    category: "support",
    description: "仲間のゆめわざのクールダウンが25%短くなる。",
  },
  mutualGuard: {
    id: "mutualGuard",
    name: "かばいあい",
    category: "support",
    description: "隣接する仲間・自分への攻撃を、確率でどちらかが代わりに受ける。",
  },
  appreciation: {
    id: "appreciation",
    name: "ねぎらい",
    category: "support",
    description: "敵を倒すたび、仲間全員のHPが1回復する。",
  },
  captureMastery: {
    id: "captureMastery",
    name: "つれさりの心得",
    category: "support",
    description: "からのタルでの捕獲確率+15%。",
  },
  wakingPrayer: {
    id: "wakingPrayer",
    name: "目覚めのいのり",
    category: "support",
    description: "仲間が倒れる一撃を、そのダイブで一度だけHP1で耐えさせる。",
  },
  // ---- タル系統 ----
  rollingThrow: {
    id: "rollingThrow",
    name: "ころがし",
    category: "barrel",
    description: "タルを投げる代わりに直線に転がし、当たった敵全員に小ダメージ。",
  },
  lightCarry: {
    id: "lightCarry",
    name: "かるがる",
    category: "barrel",
    description: "タルを抱えたままでも投げの射程+2。",
  },
  gentleThrow: {
    id: "gentleThrow",
    name: "いたわり投げ",
    category: "barrel",
    description: "からのタルを投げて捕獲を狙うと、相手のHPを必ず1で止める。",
  },
  refillBarrel: {
    id: "refillBarrel",
    name: "つぎたし",
    category: "barrel",
    description: "あけた元素タルが、もう1回ぶん中身を残す。",
  },
  barrelBurst: {
    id: "barrelBurst",
    name: "タルやぶり",
    category: "barrel",
    description: "正面に置かれたタルを攻撃で割ると、中身の効果が発揮される。",
  },
  stealthCarry: {
    id: "stealthCarry",
    name: "かつぎばしり",
    category: "barrel",
    description: "タルを抱えている間、移動のたび低確率で敵の注意を引かない。",
  },
};

const CATEGORIES: readonly RunSkillCategory[] = ["attack", "support", "barrel"];

export function runSkillDef(id: RunSkillId): RunSkillDef {
  return RUN_SKILLS[id];
}

/**
 * レベルアップ時の3択を引く。3系統それぞれから、まだ持っていないスキルを
 * 1つずつ抽選する(同一ダイブ中に同じスキルは二度提示しない)。ある系統が
 * すでに全て習得済みなら、その枠は飛ばす(3択未満になりうる)
 */
export function rollRunSkillChoices(rng: Rng, known: readonly RunSkillId[]): RunSkillId[] {
  const result: RunSkillId[] = [];
  for (const category of CATEGORIES) {
    const pool = Object.values(RUN_SKILLS).filter(
      (def) => def.category === category && !known.includes(def.id),
    );
    if (pool.length === 0) continue;
    result.push(rng.pick(pool).id);
  }
  return result;
}
