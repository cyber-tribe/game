/**
 * ゆめわざ(plan/game/archive/companion-leveling-and-arts.md)。仲間モンスターが
 * レベルで習得する能動的な特技・魔法。既存のパッシブ特技(skills.ts)は
 * 夢あわせで引き継ぐ受動効果だが、こちらは戦闘中に仲間AIが自動判断で
 * 発動する能動アクション。「夢のかけらが見せる夢の断片」という設定で、
 * 魔法に相当する不思議な業もここに含める。
 *
 * この1ファイルが「発動条件(trigger)・発動確率・クールダウン・表示」の
 * 単一の情報源になる。実際の効果(HP増減・状態異常付与等、Gameの内部状態を
 * 直接いじる部分)は domain/party/dreamArtEffects.ts の DREAM_ART_EFFECTS が
 * 持つ(bossMoves.tsと同じ「判定はentities/、実行はsystems/」の分担)。
 */
import { chebyshev, type Vec2 } from "../core/grid";
import {
  type Actor,
  type AllyActor,
  type BarrelKind,
  type DreamArtId,
  type FloorState,
  isHostile,
  roomContains,
  TILE_WALL,
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
  /**
   * ぬしのゆめわざ(plan/game/archive/boss-dream-arts.md)。地方ボス種専用の
   * 1件だけの習得表であることを示す。なじみ最高段階でのCD短縮の対象になる
   */
  isBossExclusive?: boolean;
  /**
   * タルわざ(plan/game/archive/barrel-arts.md)。設定されていれば、この
   * ゆめわざは戦闘中の自動発動ではなく、空のタルをこの種類の元素タルへ
   * 変えるプレイヤー主導の指示でだけ使う(triggerは常にnullを返す)
   */
  barrelKind?: BarrelKind;
}

/** 自分と敵対する、同じ部屋にいる生存アクター。ぬしの部屋規模のゆめわざが使う */
export function foesInRoom(floor: FloorState, self: Actor): Actor[] {
  const room = floor.rooms.find((r) => roomContains(r, self.pos));
  if (!room) return [];
  return floor.actors.filter((a) => a.alive && isHostile(self, a) && roomContains(room, a.pos));
}

/**
 * selfの上下左右で、掘り抜ける壁マス(壁タイル・かつフロア外周ではない)を
 * 1つ探す。ぬしのゆめわざ「つらぬき掘り」が使う。外周壁を除くのは
 * ソフトロック防止(plan/game/archive/boss-dream-arts.md)
 */
export function diggableWallNear(floor: FloorState, pos: Vec2): Vec2 | null {
  const deltas: Vec2[] = [
    { x: pos.x - 1, y: pos.y },
    { x: pos.x + 1, y: pos.y },
    { x: pos.x, y: pos.y - 1 },
    { x: pos.x, y: pos.y + 1 },
  ];
  for (const p of deltas) {
    if (p.x <= 0 || p.y <= 0 || p.x >= floor.width - 1 || p.y >= floor.height - 1) continue;
    const tile = floor.tiles[p.y * floor.width + p.x];
    if (tile && tile.kind === TILE_WALL) return p;
  }
  return null;
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

  // ---- ぬしのゆめわざ(plan/game/archive/boss-dream-arts.md) ----
  // 各ぬしが専用の1件だけを習得する(Lv15、Species.dreamArts側で定義)。
  // 敵として使ってきた大技の「借用」という位置づけで、通常のゆめわざより
  // 一段強い代わりにクールダウンを長くしてある(1フロア1〜2回の切り札)
  jibikiNoNegaeri: {
    id: "jibikiNoNegaeri",
    name: "じびきの寝がえり",
    cooldownTurns: 15,
    activationChance: 0.5,
    description: "周囲2マスの敵にダメージを与え、1ターン怯ませる(おおねぼすけの大技の借用)。",
    isBossExclusive: true,
    trigger(ctx) {
      const foe = nearestFoeWithin(ctx.floor, ctx.ally, 2);
      return foe ? {} : null;
    },
  },
  oomarunomi: {
    id: "oomarunomi",
    name: "おおまるのみ",
    cooldownTurns: 18,
    activationChance: 0.5,
    description: "隣接する敵1体を呑んで封じ、吐き出して小ダメージを与える(ヌシガエルの大技の借用)。",
    isBossExclusive: true,
    trigger(ctx) {
      return ctx.adjacentFoe ? { targetId: ctx.adjacentFoe.id } : null;
    },
  },
  fukaiMadoromi: {
    id: "fukaiMadoromi",
    name: "ふかいまどろみ",
    cooldownTurns: 25,
    activationChance: 0.5,
    description: "同じ部屋にいる敵全員を眠らせる(オオマドロミの大技の借用)。",
    isBossExclusive: true,
    trigger(ctx) {
      return foesInRoom(ctx.floor, ctx.ally).length > 0 ? {} : null;
    },
  },
  honeNoToride: {
    id: "honeNoToride",
    name: "ホネのとりで",
    cooldownTurns: 20,
    activationChance: 0.5,
    description: "自分の周囲に骨の壁を最大3マス生成する(ホネヅカのぬしの大技の借用)。",
    isBossExclusive: true,
    trigger(ctx) {
      const foe = nearestFoeWithin(ctx.floor, ctx.ally, 3);
      return foe ? {} : null;
    },
  },
  uzuNoSasoi: {
    id: "uzuNoSasoi",
    name: "うずのさそい",
    cooldownTurns: 20,
    activationChance: 0.5,
    description: "同じ部屋にいる敵を自分へ引き寄せる(淵の主の大技の借用)。",
    isBossExclusive: true,
    trigger(ctx) {
      return foesInRoom(ctx.floor, ctx.ally).length > 0 ? {} : null;
    },
  },
  kodamaNoOtakebi: {
    id: "kodamaNoOtakebi",
    name: "こだまのおたけび",
    cooldownTurns: 25,
    activationChance: 0.5,
    description: "次の3ターン、仲間全員の攻撃が2回響くようになる(こだまの主の大技の借用)。",
    isBossExclusive: true,
    trigger(ctx) {
      const foe = nearestFoeWithin(ctx.floor, ctx.ally, 4);
      return foe ? {} : null;
    },
  },
  maboroshiNoKoujou: {
    id: "maboroshiNoKoujou",
    name: "まぼろしの口上",
    cooldownTurns: 22,
    activationChance: 0.5,
    description: "同じ部屋にいる敵全員を混乱させる(見世物のぬしの大技の借用)。",
    isBossExclusive: true,
    trigger(ctx) {
      return foesInRoom(ctx.floor, ctx.ally).length > 0 ? {} : null;
    },
  },
  tsuranukiBori: {
    id: "tsuranukiBori",
    name: "つらぬき掘り",
    cooldownTurns: 15,
    activationChance: 0.5,
    description: "隣接する壁を1マス掘り抜いて通路にする(外周壁は不可。掘り杭の主の大技の借用)。",
    isBossExclusive: true,
    trigger(ctx) {
      return diggableWallNear(ctx.floor, ctx.ally.pos) ? {} : null;
    },
  },

  // ---- タルわざ(plan/game/archive/barrel-arts.md) ----
  // 戦闘中には自動発動しない(trigger は常にnull)。空のタルを抱えたプレイヤーが
  // 「仲間へ指示」から明示的に頼んだときだけ、domain/party/dreamArtEffects.tsを
  // 経由せず game.ts が直接 barrelKind を見て処理する
  waterBarrelArt: {
    id: "waterBarrelArt",
    name: "水タルわざ",
    cooldownTurns: 0,
    activationChance: 0,
    description: "空のタルを水タルに変える(仲間へ指示から使う)。",
    barrelKind: "water",
    trigger: () => null,
  },
  windBarrelArt: {
    id: "windBarrelArt",
    name: "風タルわざ",
    cooldownTurns: 0,
    activationChance: 0,
    description: "空のタルを風タルに変える(仲間へ指示から使う)。",
    barrelKind: "wind",
    trigger: () => null,
  },
  lightBarrelArt: {
    id: "lightBarrelArt",
    name: "光タルわざ",
    cooldownTurns: 0,
    activationChance: 0,
    description: "空のタルを光タルに変える(仲間へ指示から使う)。",
    barrelKind: "light",
    trigger: () => null,
  },
  stoneBarrelArt: {
    id: "stoneBarrelArt",
    name: "石タルわざ",
    cooldownTurns: 0,
    activationChance: 0,
    description: "空のタルを石タルに変える(仲間へ指示から使う)。",
    barrelKind: "stone",
    trigger: () => null,
  },
  sleepBarrelArt: {
    id: "sleepBarrelArt",
    name: "ねむタルわざ",
    cooldownTurns: 0,
    activationChance: 0,
    description: "空のタルをねむタルに変える(仲間へ指示から使う)。",
    barrelKind: "sleep",
    trigger: () => null,
  },
};

export function dreamArtDef(id: DreamArtId): DreamArtDef {
  return DREAM_ARTS[id];
}

/**
 * タルわざ(plan/game/archive/barrel-arts.md)。この仲間が習得済みのゆめわざの
 * うち、タルわざ(barrelKindを持つもの)を1つ返す。1体が複数覚えていても
 * (MAX_DREAM_ARTS=2の範囲で)最初に見つかったものを使う
 */
export function knownBarrelArt(known: readonly DreamArtId[]): DreamArtDef | undefined {
  for (const id of known) {
    const def = DREAM_ARTS[id];
    if (def.barrelKind) return def;
  }
  return undefined;
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
