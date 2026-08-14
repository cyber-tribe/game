import type { InputMode } from "../entities/inputText";

/**
 * plan/game/mobile-layout-redesign.md: 文言のタッチ対応。判定は既存の
 * タッチUI表示条件(`pointer: coarse`)と同じにする
 * (`src/ui/orientation-guard.ts`が使っているのと同じメディアクエリ)。
 * 呼び出しの都度matchMediaを引くだけの薄い関数で、値の変化を監視する
 * 必要がある箇所(表示の出しっぱなし)は無いため、状態やイベント購読は持たない。
 */
export function currentInputMode(): InputMode {
  return typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches ? "touch" : "keyboard";
}
