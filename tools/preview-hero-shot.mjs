/**
 * 看板モデル1体だけの、高解像度・単体構図の「よそ行きの1枚」
 * (plan/models/archive/garudo-hero-quality-pass.md)。
 *
 * `tools/preview_engine.mjs`が全モデルを撮る一覧用(256px・GIF)とは別に、
 * 家庭用ゲームの商品ページに耐えるかを確認するための高解像度の静止画を
 * 1枚だけ撮る。`tools/preview/`の一覧用画像は置き換えない
 * (`<名前>-hero.png`という別名で保存する)。
 *
 *   npm run dev &
 *   npm run preview-hero -- garudo
 *
 * 環境変数はtools/preview_engine.mjsと同じ流儀。
 *   URL              遊びに行くアドレス (既定 http://127.0.0.1:5173/)
 *   CHROMIUM_PATH    Chromium の実行ファイル
 *   PLAYWRIGHT_PATH  playwright パッケージの場所
 *   SIZE             解像度(px、既定1024)
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    const require = createRequire(import.meta.url);
    const fallback = process.env.PLAYWRIGHT_PATH ?? "/opt/node22/lib/node_modules/playwright";
    return require(fallback);
  }
}

const model = process.argv[2];
if (!model) {
  console.error("使い方: npm run preview-hero -- <モデル名>");
  process.exitCode = 1;
  process.exit();
}

const { chromium } = await loadPlaywright();
const SITE_URL = process.env.URL ?? "http://127.0.0.1:5173/";
const SIZE = Number(process.env.SIZE) || 1024;
const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT_DIR = join(REPO_ROOT, "tools", "preview");
mkdirSync(OUT_DIR, { recursive: true });

function chromiumPath() {
  const explicit = process.env.CHROMIUM_PATH;
  if (explicit) return explicit;
  const preinstalled = "/opt/pw-browsers/chromium";
  return existsSync(preinstalled) ? preinstalled : undefined;
}

const browser = await chromium.launch({
  executablePath: chromiumPath(),
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--use-gl=angle", "--disable-gpu-sandbox"],
});
const page = await browser.newPage();

const target = `${SITE_URL}tools/preview-harness.html?model=${encodeURIComponent(model)}&size=${SIZE}&static=1`;
await page.goto(target, { waitUntil: "load" });
await page.waitForFunction(
  () => window.__previewReady === true || typeof window.__previewError === "string",
  { timeout: 30_000 },
);
const error = await page.evaluate(() => window.__previewError);
if (error) {
  console.error(`失敗: ${model} — ${error}`);
  process.exitCode = 1;
} else {
  const out = join(OUT_DIR, `${model}-hero.png`);
  await page.locator("canvas").screenshot({ path: out });
  console.log(`撮影: ${out} (${SIZE}x${SIZE})`);
}

await browser.close();
