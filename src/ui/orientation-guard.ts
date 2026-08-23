import { shouldForceLandscape } from "../entities/orientation";

/**
 * plan/game/archive/forced-landscape.md: タッチ端末かつ縦持ちを`matchMedia`で
 * 監視し、`document.body`へ`forced-landscape`クラスを反映するだけの薄い
 * 配線。実際の表示切り替え(ゲーム画面全体を90度回転させて横向きのまま
 * 描画する)はCSS側(index.html)に任せる。回転で横向きに戻れば`change`
 * イベントで自動的にクラスが外れ、既存の横持ちレイアウトへ戻る
 * (OS側の画面回転ロックで`orientation: portrait`が変わらないままでも、
 * 端末を物理的に横へ持ち替えればCSSの回転でそのまま正位置になる)。
 *
 * `matchMedia`の`change`だけには頼らない(issue #874: iOS Safariでは
 * 回転後もこのイベントが発火しない・発火してもクラスの反映が遅れる癖が
 * 実機で報告された。`src/view/renderer.ts`のresize()が同じiOS Safariの
 * 回転タイミングの癖に対してResizeObserverをフォールバックに使っている
 * のと同じ考え方で、`document.documentElement`のボックスサイズが
 * 実際に変わった時点でも再判定する。change自体が届いていれば二重に
 * 呼ぶだけなので害はない)。
 *
 * `src/ui/touch-controls.ts`同様、DOM前提でありUI層のためvitestの対象外
 * (判定ロジック自体は`src/entities/orientation.ts`側でテスト済み)。
 */
export class OrientationGuard {
  private readonly pointerCoarse: MediaQueryList;
  private readonly orientationPortrait: MediaQueryList;

  constructor(private readonly body: HTMLElement = document.body) {
    this.pointerCoarse = matchMedia("(pointer: coarse)");
    this.orientationPortrait = matchMedia("(orientation: portrait)");
    const update = (): void => this.update();
    this.pointerCoarse.addEventListener("change", update);
    this.orientationPortrait.addEventListener("change", update);
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(update).observe(document.documentElement);
    }
    this.update();
  }

  private update(): void {
    const force = shouldForceLandscape(this.pointerCoarse.matches, this.orientationPortrait.matches);
    this.body.classList.toggle("forced-landscape", force);
  }
}
