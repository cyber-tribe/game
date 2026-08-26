/**
 * plan/game/archive/orientation-rotate-prompt.md: タッチ端末
 * (pointer: coarse)かつ縦持ち(orientation: portrait)のときだけ、
 * 横に持ち替えるよう促す全画面の案内表示(`rotate-prompt`クラス)を出す。
 * 以前はCSSでゲーム画面自体を90度回転させる方式(forced-landscape、
 * plan/game/archive/forced-landscape.md)だったが、回転ぶんの座標変換・
 * 軸入れ替えが影響する範囲が広く不具合が繰り返し見つかったため撤回した。
 * DOM・matchMediaを持たない純粋な判定だけをここに置き、
 * `src/ui/orientation-guard.ts`(クラスの付け外し)から呼び出す
 * (`src/entities/debugPanel.ts`と同じ、ロジックとDOM配線を分ける形)。
 */

/**
 * タッチ端末以外(マウス・トラックパッド等)では、縦長ウィンドウであっても
 * 回転案内を出さない。案内が要る理由は「タッチの操作ボタンが縦持ちでは
 * 画面に収まらない」ことだけで、デスクトップの縦長ウィンドウはそもそも対象外
 */
export function shouldPromptRotate(pointerCoarse: boolean, orientationPortrait: boolean): boolean {
  return pointerCoarse && orientationPortrait;
}
