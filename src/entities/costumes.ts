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
  | { kind: "nightlyDreamDepth"; depth: number };

export interface CostumeDef {
  id: string;
  name: string;
  description: string;
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
];

export function costumeById(id: string): CostumeDef {
  return COSTUMES.find((c) => c.id === id) ?? COSTUMES[0]!;
}
