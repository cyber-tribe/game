/**
 * ゆめわざ(plan/game/archive/companion-leveling-and-arts.md)。仲間モンスターが
 * レベルで習得する能動的な特技・魔法。既存のパッシブ特技(skills.ts)は
 * 夢あわせで引き継ぐ受動効果だが、こちらは戦闘中に仲間AIが自動判断で
 * 発動する能動アクション。「夢のかけらが見せる夢の断片」という設定で、
 * 魔法に相当する不思議な業もここに含める。
 *
 * この1ファイルが「発動条件(trigger)・発動確率・クールダウン・表示」の
 * 単一の情報源になる。実際の効果(HP増減・状態異常付与等、Gameの内部状態を
 * 直接いじる部分)は systems/dreamArtEffects.ts の DREAM_ART_EFFECTS が
 * 持つ(bossMoves.tsと同じ「判定はentities/、実行はsystems/」の分担)。
 */
import { chebyshev, type Vec2 } from "../core/grid";
import {
  type Actor,
  type AllyActor,
  type DreamArtId,
  type FloorState,
  isHostile,
} from "../core/types";

/** ゆめわざの発動条件が見た情報。判定だけ行い、副作用は一切持たない */
export interface DreamArtTriggerContext {
  floor: FloorState;
  ally: AllyActor;
  /** ガルド(プレイヤー)。いやしのしずく等、仲間以外も対象になりうるゆめわざが参照する */
  leader: Actor;
  /** 隣接している敵(いなければnull)。adjacentFoeの結果をそのまま渡す */
  adjacentFoe: Actor | null;
}

/** 発動する場合に返す。targetIdは対象を取るゆめわざだけが持つ */
export interface DreamArtTriggerResult {
  targetId?: number;
}

export interface DreamArtDef {
  id: DreamArtId;
  name: string;
  cooldownTurns: number;
  /**
   * 条件を満たした瞬間に必ず撃つわけではなく、ここで最後にもう一段階
   * 抽選する。「1つで戦況を決めない小粒の効果」という方針を、AIの判断に
   * 淡々と従わせるのではなく毎回の使用頻度としても反映するための係数
   */
  activationChance: number;
  description: string;
  trigger: (ctx: DreamArtTriggerContext) => DreamArtTriggerResult | null;
}

function nearestFoeWithin(
  floor: FloorState,
  self: Actor,
  maxDistance: number,
  opts?: { straightLineOnly?: boolean; minDistance?: number },
): Actor | null {
  let best: Actor | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const other of floor.actors) {
    if (!other.alive || !isHostile(self, other)) continue;
    const d = chebyshev(self.pos, other.pos);
    if (d > maxDistance || d < (opts?.minDistance ?? 0)) continue;
    if (opts?.straightLineOnly && !isStraightLine(self.pos, other.pos)) continue;
    if (d < bestDist) {
      bestDist = d;
      best = other;
    }
  }
  return best;
}

function isStraightLine(a: Vec2, b: Vec2): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy);
}

/** hp/maxHpの割合が最も低い、生きている対象を選ぶ。しきい値未満のものだけを候補にする */
function lowestHpBelow(candidates: readonly Actor[], ratioBelow: number): Actor | null {
  let worst: Actor | null = null;
  let worstRatio = ratioBelow;
  for (const c of candidates) {
    if (!c.alive) continue;
    const ratio = c.maxHp > 0 ? c.hp / c.maxHp : 1;
    if (ratio < worstRatio) {
      worstRatio = ratio;
      worst = c;
    }
  }
  return worst;
}

export const DREAM_ARTS: Readonly<Record<DreamArtId, DreamArtDef>> = {
  nemuriUta: {
    id: "nemuriUta",
    name: "ねむりのうた",
    cooldownTurns: 10,
    activationChance: 0.6,
    description: "隣接する敵1体を眠らせる。",
    trigger(ctx) {
      return ctx.adjacentFoe ? { targetId: ctx.adjacentFoe.id } : null;
    },
  },
  tsubuteNage: {
    id: "tsubuteNage",
    name: "つぶてなげ",
    cooldownTurns: 4,
    activationChance: 0.5,
    description: "2マス先まで届く小ダメージの遠隔攻撃。",
    trigger(ctx) {
      if (ctx.adjacentFoe) return null; // 隣接時は通常攻撃に任せる
      const foe = nearestFoeWithin(ctx.floor, ctx.ally, 2, { straightLineOnly: true, minDistance: 2 });
      return foe ? { targetId: foe.id } : null;
    },
  },
  katayaburi: {
    id: "katayaburi",
    name: "かたやぶり",
    cooldownTurns: 12,
    activationChance: 0.4,
    description: "次の一撃を防御無視にする自己強化。",
    trigger(ctx) {
      if (ctx.ally.ignoreDefenseNextHit) return null; // 二重発動しない
      const foe = nearestFoeWithin(ctx.floor, ctx.ally, 3);
      return foe ? {} : null;
    },
  },
  iyashiNoShizuku: {
    id: "iyashiNoShizuku",
    name: "いやしのしずく",
    cooldownTurns: 8,
    activationChance: 0.8,
    description: "ガルドか仲間1体のHPを小回復。",
    trigger(ctx) {
      const candidates = [
        ctx.leader,
        ...ctx.floor.actors.filter((a): a is AllyActor => a.kind === "ally" && a.id !== ctx.ally.id),
      ];
      const target = lowestHpBelow(candidates, 0.7);
      return target ? { targetId: target.id } : null;
    },
  },
  kodamaGaeshi: {
    id: "kodamaGaeshi",
    name: "こだまがえし",
    cooldownTurns: 9,
    activationChance: 0.4,
    description: "受けた次の1撃の半分を相手へ返す。",
    trigger(ctx) {
      if (ctx.ally.reflectNextHit) return null;
      const foe = nearestFoeWithin(ctx.floor, ctx.ally, 2);
      return foe ? {} : null;
    },
  },
  chiisanaKaze: {
    id: "chiisanaKaze",
    name: "ちいさなかぜ",
    cooldownTurns: 8,
    activationChance: 0.5,
    description: "隣接する敵全員を1マス押し出す。",
    trigger(ctx) {
      const anyAdjacent = ctx.floor.actors.some(
        (a) => a.alive && isHostile(ctx.ally, a) && chebyshev(ctx.ally.pos, a.pos) === 1,
      );
      return anyAdjacent ? {} : null;
    },
  },
  honokaNaAkari: {
    id: "honokaNaAkari",
    name: "ほのかなあかり",
    cooldownTurns: 20,
    activationChance: 0.3,
    description: "3ターンの間、視界+1。",
    trigger(ctx) {
      // 戦闘中に割り込ませたい効果ではないので、隣接する敵がいない
      // (探索中の)ときだけ自発的に使わせる
      return ctx.adjacentFoe ? null : {};
    },
  },
  odoshiNaki: {
    id: "odoshiNaki",
    name: "おどしなき",
    cooldownTurns: 9,
    activationChance: 0.45,
    description: "隣接する敵1体を1ターン怯ませる(行動スキップ)。",
    trigger(ctx) {
      return ctx.adjacentFoe ? { targetId: ctx.adjacentFoe.id } : null;
    },
  },
  nebaritsuki: {
    id: "nebaritsuki",
    name: "ねばりつき",
    cooldownTurns: 9,
    activationChance: 0.5,
    description: "敵1体の移動を2ターン封じる。",
    trigger(ctx) {
      const foe = nearestFoeWithin(ctx.floor, ctx.ally, 2);
      return foe ? { targetId: foe.id } : null;
    },
  },
  yumeNoKakebuton: {
    id: "yumeNoKakebuton",
    name: "ゆめのかけぶとん",
    cooldownTurns: 10,
    activationChance: 0.4,
    description: "仲間全員の被弾を1ターン1割軽減。",
    trigger(ctx) {
      const foe = nearestFoeWithin(ctx.floor, ctx.ally, 2);
      return foe ? {} : null;
    },
  },
  honeTsuyoshi: {
    id: "honeTsuyoshi",
    name: "ホネつよし",
    cooldownTurns: 10,
    activationChance: 0.4,
    description: "自分のdefを3ターン強化。",
    trigger(ctx) {
      if ((ctx.ally.defBuffTurns ?? 0) > 0) return null;
      const foe = nearestFoeWithin(ctx.floor, ctx.ally, 3);
      return foe ? {} : null;
    },
  },
  wasuresase: {
    id: "wasuresase",
    name: "わすれさせ",
    cooldownTurns: 14,
    activationChance: 0.5,
    description: "敵1体の「気づき」を解除する(未発見に戻す)。",
    trigger(ctx) {
      const foe = ctx.floor.actors.find(
        (a) =>
          a.kind === "monster" &&
          a.alive &&
          a.aware &&
          chebyshev(ctx.ally.pos, a.pos) <= 3 &&
          isStraightLine(ctx.ally.pos, a.pos),
      );
      return foe ? { targetId: foe.id } : null;
    },
  },
};

export function dreamArtDef(id: DreamArtId): DreamArtDef {
  return DREAM_ARTS[id];
}

/**
 * この種族・レベルの仲間が新たに習得すべきゆめわざ。習得表(Species.dreamArts)を
 * レベル順に見て、まだ持っていないidのうち条件を満たす最初の1つだけを返す
 * (複数同時に習得しても片方しかログが読めないため、1レベルアップにつき1つに絞る)
 */
export function nextLearnableDreamArt(
  dreamArtsTable: readonly { level: number; id: DreamArtId }[] | undefined,
  level: number,
  known: readonly DreamArtId[],
): DreamArtId | null {
  if (!dreamArtsTable) return null;
  for (const entry of dreamArtsTable) {
    if (entry.level > level) continue;
    if (known.includes(entry.id)) continue;
    return entry.id;
  }
  return null;
}

/**
 * 習得済みのゆめわざに新しいものを1つ足す。上限(MAX_DREAM_ARTS)を超える場合は
 * 一番古い(最初に覚えた)ものを忘れる(plan/game/archive/companion-leveling-and-arts.md
 * の「枠2を超える場合は古いものから忘れ」)
 */
export const MAX_DREAM_ARTS = 2;

export function addDreamArt(known: readonly DreamArtId[], id: DreamArtId): DreamArtId[] {
  if (known.includes(id)) return [...known];
  const next = [...known, id];
  return next.length > MAX_DREAM_ARTS ? next.slice(next.length - MAX_DREAM_ARTS) : next;
}
