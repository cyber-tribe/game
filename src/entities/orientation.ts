/**
 * plan/touch-ui-overlap-fix.md: タッチ端末(pointer: coarse)かつ縦持ち
 * (orientation: portrait)のときだけ、ゲーム画面を隠して「横向きにして
 * ください」の案内に切り替える。DOM・matchMediaを持たない純粋な判定だけを
 * ここに集め、`src/ui/orientation-guard.ts`から呼び出す
 * (`src/entities/debugPanel.ts`と同じ、ロジックとDOM配線を分ける形)。
 */

/**
 * タッチ端末以外(マウス・トラックパッド等)では、縦長ウィンドウであっても
 * 案内に切り替えない。横向きを強制する理由は「タッチの操作ボタンが
 * 縦持ちでは画面に収まらない」ことだけで、デスクトップの縦長ウィンドウは
 * そもそも対象外
 */
export function shouldLockToPortraitPrompt(pointerCoarse: boolean, orientationPortrait: boolean): boolean {
  return pointerCoarse && orientationPortrait;
}
