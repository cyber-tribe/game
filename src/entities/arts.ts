/**
 * 樽守りの技(plan/protagonist-arts.md、アーカイブ済み)。
 * ガルドだけがプレイヤーの判断で繰り出す特別な一手。レベルアップの
 * 節目で1つずつ覚え、資源(MP等)は持たずクールダウンだけで管理する。
 */
export type ArtId = "critBarrel" | "soothe" | "ukemi" | "shout" | "pierce";

export interface ArtDef {
  id: ArtId;
  name: string;
  unlockLevel: number;
  cooldownTurns: number;
  description: string;
}

export const ARTS: readonly ArtDef[] = [
  {
    id: "critBarrel",
    name: "会心の樽投げ",
    unlockLevel: 3,
    cooldownTurns: 10,
    description: "次に投げるからのタルの威力・捕獲判定が最大になる。",
  },
  {
    id: "soothe",
    name: "なだめの手つき",
    unlockLevel: 7,
    cooldownTurns: 6,
    description: "正面のモンスターを、ダメージを与えずに弱らせる(捕獲しやすくなる)。",
  },
  {
    id: "ukemi",
    name: "樽受け身",
    unlockLevel: 12,
    cooldownTurns: 8,
    description: "次の1回、被弾ダメージを無効にする(発動から1ターンだけ有効)。",
  },
  {
    id: "shout",
    name: "目覚ましの一喝",
    unlockLevel: 16,
    cooldownTurns: 12,
    description: "地方ボスの予兆つき大技を1回だけ強制的に中断させる。",
  },
  {
    id: "pierce",
    name: "抱え投げの奥義",
    unlockLevel: 20,
    cooldownTurns: 15,
    description: "抱えているタルを、当たった先まで貫通させて投げる。",
  },
];

export function artDef(id: ArtId): ArtDef {
  const def = ARTS.find((a) => a.id === id);
  if (!def) throw new Error(`未知の技: ${id}`);
  return def;
}

/** そのレベルまでに習得済みの技 */
export function artsForLevel(level: number): ArtDef[] {
  return ARTS.filter((a) => a.unlockLevel <= level);
}

export function createArtCooldowns(): Record<ArtId, number> {
  return { critBarrel: 0, soothe: 0, ukemi: 0, shout: 0, pierce: 0 };
}
