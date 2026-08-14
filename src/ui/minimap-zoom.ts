/**
 * ミニマップのタップ拡大/縮小(plan/game/mobile-layout-redesign.md、未決事項への回答:
 * 「expanded」クラスをつけ外すだけで済み、実装コストが低いので採用する)。
 *
 * `#minimap-wrap`はデスクトップ(pointer: fine)では`#ui`から継承する
 * `pointer-events: none`のままなのでクリックが届かず、この配線自体は常に
 * 生きていてもデスクトップの挙動は変わらない(`index.html`側で
 * `pointer-events: auto`にするのは`@media (pointer: coarse)`の中だけ)。
 * 見た目の拡大サイズはCSS(`#minimap-wrap.expanded`)側が持つ、
 * `src/ui/orientation-guard.ts`と同じ「状態はクラス自身が持つ」薄い配線。
 */
export class MinimapZoomToggle {
  constructor(wrap: HTMLElement) {
    wrap.addEventListener("click", () => {
      wrap.classList.toggle("expanded");
    });
  }
}
