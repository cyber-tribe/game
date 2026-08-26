/**
 * SVGの線画をPNGにする(plan/models/archive/2d-turnaround-first-workflow.md)。
 *
 * コンセプト案・三面図はSVGで描く(テキストとしてdiffでき、座標が
 * そのまま読めるため)。目視確認のためだけにPlaywrightでPNG化する。
 * SVG自体は編集の唯一の情報源のまま変えない。
 *
 *   node tools/render_svg.mjs plan/models/concepts/garudo-a.svg [...]
 *
 * 出力は tools/preview/<入力ファイルの親ディレクトリ名>/<拡張子抜きの
 * 入力ファイル名>.png(例: plan/models/concepts/garudo-a.svg →
 * tools/preview/concepts/garudo-a.png、plan/models/turnarounds/garudo.svg
 * → tools/preview/turnarounds/garudo.png)。
 * 環境変数は他のtools/*.mjsと同じ流儀。
 *   CHROMIUM_PATH    Chromium の実行ファイル
 *   PLAYWRIGHT_PATH  playwright パッケージの場所
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
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

const inputs = process.argv.slice(2);
if (inputs.length === 0) {
  console.error("使い方: node tools/render_svg.mjs <svgファイル> [...]");
  process.exitCode = 1;
  process.exit();
}

const { chromium } = await loadPlaywright();
const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const PREVIEW_ROOT = join(REPO_ROOT, "tools", "preview");

function chromiumPath() {
  const explicit = process.env.CHROMIUM_PATH;
  if (explicit) return explicit;
  const preinstalled = "/opt/pw-browsers/chromium";
  return existsSync(preinstalled) ? preinstalled : undefined;
}

const browser = await chromium.launch({ executablePath: chromiumPath() });
const page = await browser.newPage();

for (const input of inputs) {
  const svg = readFileSync(input, "utf-8");
  // 背景を白にして、線画をそのままの座標で表示する(viewBoxの寸法で
  // ページも合わせるので、SVG側の余白設計がそのままPNGの余白になる)
  await page.setContent(
    `<!doctype html><meta charset="utf-8">
     <style>html,body{margin:0;background:#fff}</style>
     ${svg}`,
  );
  const el = await page.$("svg");
  const box = await el.boundingBox();
  await page.setViewportSize({ width: Math.ceil(box.width), height: Math.ceil(box.height) });
  const outDir = join(PREVIEW_ROOT, basename(dirname(input)));
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, `${basename(input, ".svg")}.png`);
  await el.screenshot({ path: out });
  console.log(`撮影: ${out}`);
}

await browser.close();
