/**
 * plan/game/mobile-layout-redesign.md: 「文言のタッチ対応」。キー名を含む
 * メッセージ・チュートリアルtip・操作説明は、入力方式(キーボード/タッチ)
 * ごとに2パターンの文面を持てるようにする。DOM・matchMediaを持たない
 * 純粋な型と関数だけをここに集め、実際の判定(`matchMedia`)は
 * `src/ui/inputMode.ts`側で行う(`src/entities/orientation.ts`と同じ、
 * ロジックとDOM配線を分ける形)。
 */

/** タッチ端末かキーボード(マウス・トラックパッド含む)か */
export type InputMode = "touch" | "keyboard";

/** キー名を含む文言の、入力方式ごとの2パターン */
export interface TextVariant {
  readonly keyboard: string;
  readonly touch: string;
}

/** 現在の入力方式に応じた文面を選ぶ */
export function resolveText(variant: TextVariant, mode: InputMode): string {
  return mode === "touch" ? variant.touch : variant.keyboard;
}
