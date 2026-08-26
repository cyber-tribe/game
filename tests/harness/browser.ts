import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import type { Browser, BrowserContext } from "playwright";

/**
 * playwrightはプロジェクトの依存に入れていない(tools/playtest.mjsと同じ方針)。
 * 入っていればそれを使い、無ければ環境に置かれているものを探す
 */
async function loadPlaywright(): Promise<typeof import("playwright")> {
  try {
    return await import("playwright");
  } catch {
    const require = createRequire(import.meta.url);
    const fallback = process.env.PLAYWRIGHT_PATH ?? "/opt/node22/lib/node_modules/playwright";
    return require(fallback);
  }
}

/** 明示された実行ファイルがあればそれを、無ければ playwright に任せる(tools/playtest.mjsと同じ) */
function chromiumPath(): string | undefined {
  const explicit = process.env.CHROMIUM_PATH;
  if (explicit) return explicit;
  const preinstalled = "/opt/pw-browsers/chromium";
  return existsSync(preinstalled) ? preinstalled : undefined;
}

/**
 * 箱庭のPlaywright E2Eテスト(plan/game/test-dungeon-harness.md)向けの
 * ブラウザ起動。スマホ相当(タッチ有効・モバイル画面サイズ)を既定にする。
 * セーブ削除ボタン(#837)のようなタッチ限定UIもこの箱庭で検証できるように
 * するための既定。GPUが無い実行環境向けにSwiftShaderで描画する
 */
export async function launchMobileBrowser(): Promise<{ browser: Browser; context: BrowserContext }> {
  const { chromium, devices } = await loadPlaywright();
  const browser: Browser = await chromium.launch({
    executablePath: chromiumPath(),
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--use-gl=angle", "--disable-gpu-sandbox"],
  });
  const pixel5 = devices["Pixel 5"];
  // このゲームは横持ち固定(plan/game/archive/orientation-rotate-prompt.md):
  // タッチ端末が縦持ちのままだと回転案内オーバーレイが全画面入力を遮断して
  // 操作できなくなるため、Pixel 5プリセットのviewportを横向き(幅と高さを
  // 入れ替え)にして使う。タッチ有効・isMobile等は既定のまま
  const context: BrowserContext = await browser.newContext({
    ...pixel5,
    viewport: { width: pixel5.viewport.height, height: pixel5.viewport.width },
  });
  return { browser, context };
}
