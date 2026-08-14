/**
 * plan/game/archive/forced-landscape.md: タッチ端末(pointer: coarse)かつ
 * 縦持ち(orientation: portrait)のときだけ、ゲーム画面を90度回転させて
 * 横向きのまま描画する(`forced-landscape`クラス)。DOM・matchMediaを
 * 持たない純粋な判定・変換だけをここに集め、`src/ui/orientation-guard.ts`
 * (クラスの付け外し)・`src/ui/touch-controls.ts`(入力座標の補正)から
 * それぞれ呼び出す(`src/entities/debugPanel.ts`と同じ、ロジックとDOM配線を
 * 分ける形)。
 */

/**
 * タッチ端末以外(マウス・トラックパッド等)では、縦長ウィンドウであっても
 * 強制横向きにしない。横向きを強制する理由は「タッチの操作ボタンが
 * 縦持ちでは画面に収まらない」ことだけで、デスクトップの縦長ウィンドウは
 * そもそも対象外
 */
export function shouldForceLandscape(pointerCoarse: boolean, orientationPortrait: boolean): boolean {
  return pointerCoarse && orientationPortrait;
}

/**
 * `forced-landscape`が有効な間、生のポインタ座標(`PointerEvent.clientX/Y`、
 * 回転前の画面座標系のまま届く)の差分を、CSSで90度回転させた描画上の
 * 見た目どおりの差分に読み替える。CSS側は`transform: rotate(90deg)
 * translateY(-100%)`(画面を時計回りに90度回転させて横向きにはめ込む)
 * なので、その逆変換にあたる`(dx, dy) -> (dy, -dx)`を適用する。
 *
 * `forced-landscape`が無効なとき(横持ち・デスクトップ)は素通しする。
 */
export function forcedLandscapePointerDelta(
  dx: number,
  dy: number,
  forcedLandscapeActive: boolean,
): { dx: number; dy: number } {
  return forcedLandscapeActive ? { dx: dy, dy: -dx } : { dx, dy };
}
