/**
 * 衣装・見た目カスタマイズ(plan/costumes.md)。戦闘には一切関わらない、
 * 見た目だけの記念スロット。新規3Dモデルは作らず、既存のガルドモデルの
 * 色調(マテリアルの色)を変えるだけで表現する(README記載の「かがやきの
 * 夢のかけら」の色替えの発想を流用)。
 */
export type CostumeUnlock =
  | "always"
  | { kind: "compendiumComplete" }
  | { kind: "villageStage"; stage: number }
  | { kind: "nightlyDreamDepth"; depth: number }
  /**
   * NPCサイドストーリー(plan/side-stories-part2.md)。汎用の自動判定
   * (refreshUnlockedCostumes)には乗せず、対応するNPCと話した時点で
   * src/save.tsのtalkToNpcが直接SaveData.unlockedCostumesへ追加する
   */
  | { kind: "npcSideStory" };

export interface CostumeDef {
  id: string;
  name: string;
  description: string;
  /** 既存のdescriptionとは別行で、着替え画面の詳細表示に追加する */
  flavorText?: string;
  /** マテリアルの色に掛けるRGB倍率。既定は[1,1,1](色替えなし) */
  tint?: readonly [number, number, number];
  unlock: CostumeUnlock;
}

export const DEFAULT_COSTUME_ID = "default";

export const COSTUMES: readonly CostumeDef[] = [
  { id: DEFAULT_COSTUME_ID, name: "普段着", description: "いつもの見習い樽守りの装い。", unlock: "always" },
  {
    id: "okiyoHappi",
    name: "おキヨお手製のはっぴ",
    description: "モンスター図鑑を全種「捕まえた」で埋めた記念に、物知りのおキヨが仕立ててくれた、藍染めのはっぴ。",
    tint: [0.3, 0.55, 1.5],
    unlock: { kind: "compendiumComplete" },
  },
  {
    id: "quietMountainHaori",
    name: "山を静めた者の羽織",
    description: "ネンネ村が大きく発展した証。深い緑をまとった、落ち着いた羽織。",
    tint: [0.45, 1.35, 0.55],
    unlock: { kind: "villageStage", stage: 4 },
  },
  {
    id: "ancientDreamRobe",
    name: "最古の夢へ寄り添う衣",
    description: "夜ごとの夢を深くまで潜り抜けた者だけが纏える、紫にほのかに光る衣。",
    tint: [1.35, 0.5, 1.55],
    unlock: { kind: "nightlyDreamDepth", depth: 20 },
  },
  {
    id: "pochiHandMeDownHappi",
    name: "ポチのおさがり半纏",
    description: "物語を歩んだ末、見習いになったポチから譲り受けた、少し丈の合わない半纏。",
    flavorText: "袖はまだ少し長い。けれど、いつか着こなせる日が来ることを、ポチ自身が一番わかっている。",
    tint: [1.4, 1.1, 0.4],
    unlock: { kind: "npcSideStory" },
  },
];

export function costumeById(id: string): CostumeDef {
  return COSTUMES.find((c) => c.id === id) ?? COSTUMES[0]!;
}
