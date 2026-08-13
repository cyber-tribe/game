import { shouldLockToPortraitPrompt } from "../entities/orientation";

/**
 * plan/touch-ui-overlap-fix.md: タッチ端末かつ縦持ちを`matchMedia`で監視し、
 * `document.body`へ`portrait-lock`クラスを反映するだけの薄い配線。実際の
 * 表示切り替え(ゲーム画面を隠し「横向きにしてください」を出す)はCSS側
 * (index.html)に任せる。回転で横向きに戻れば`change`イベントで自動的に
 * クラスが外れ、既存の横持ちレイアウトへ戻る。
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
    const lock = shouldLockToPortraitPrompt(this.pointerCoarse.matches, this.orientationPortrait.matches);
    this.body.classList.toggle("portrait-lock", lock);
  }
}
