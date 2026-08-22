/**
 * playwrightはプロジェクトの依存に入れていない(tools/playtest.mjsと同じ方針。
 * 遊びたいだけの人にまで数百MBを背負わせないため)。CIやこの実行環境には
 * 別途用意されている前提で、tests/harness/browser.ts から動的importで読む。
 * ここは型チェックだけを通すための最小限のアンビエント宣言で、実際の
 * 型定義(@types/playwright相当)は使わない
 */
declare module "playwright" {
  export const chromium: any;
  export const devices: any;
  export type Browser = any;
  export type BrowserContext = any;
  export type Page = any;
}
