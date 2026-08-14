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
    this.update();
  }

  private update(): void {
    const force = shouldForceLandscape(this.pointerCoarse.matches, this.orientationPortrait.matches);
    this.body.classList.toggle("forced-landscape", force);
  }
}
