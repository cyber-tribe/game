/**
 * SVGの線画をPNGにする(plan/models/archive/2d-turnaround-first-workflow.md)。
 *
 * コンセプト案・三面図はSVGで描く(テキストとしてdiffでき、座標が
 * そのまま読めるため)。目視確認のためだけにPlaywrightでPNG化する。
 * SVG自体は編集の唯一の情報源のまま変えない。キャラクター個別の
 * SVGの置き場所は`design/characters/<キャラ名>/`(plan/は開発内容の
 * 設計を書く場所であり、キャラクター個別の絵の置き場ではないため)。
 *
 *   node tools/render_svg.mjs design/characters/garudo/concepts/garudo-a.svg [...]
 *
 * 出力は tools/preview/<入力ファイルの親ディレクトリ名>/<拡張子抜きの
 * 入力ファイル名>.png(例: design/characters/garudo/concepts/garudo-a.svg
 * → tools/preview/concepts/garudo-a.png、design/characters/garudo/
 * turnarounds/garudo.svg → tools/preview/turnarounds/garudo.png)。
 *
 * --silhouette を先頭に付けると、全fill/strokeを黒に置き換えた
 * シルエット版を tools/preview/silhouettes/<名前>-silhouette.png へ
 * 出力する(plan/models/archive/turnaround-drawing-craft.mdの
 * 受け入れ基準2「黒塗りシルエット版の画像」用。3Dモデル側との重ね
 * 合わせ照合はtools/compare_turnaround.mjsを使う)。
 *
 *   node tools/render_svg.mjs --silhouette design/characters/garudo/turnarounds/garudo.svg
 *
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

const rawArgs = process.argv.slice(2);
const silhouette = rawArgs.includes("--silhouette");
const inputs = rawArgs.filter((a) => a !== "--silhouette");
if (inputs.length === 0) {
  console.error("使い方: node tools/render_svg.mjs [--silhouette] <svgファイル> [...]");
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
  let svg = readFileSync(input, "utf-8");
  if (silhouette) {
    // キャプション文字はシルエット判定に含めない。全fill/strokeを
    // 黒にして、輪郭だけで判読できるかを確認する
    svg = svg
      .replace(/<text[\s\S]*?<\/text>/g, "")
      .replace(/fill="(?!none)[^"]*"/g, 'fill="#000"')
      .replace(/stroke="(?!none)[^"]*"/g, 'stroke="#000"');
  }
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
  const outDir = join(PREVIEW_ROOT, silhouette ? "silhouettes" : basename(dirname(input)));
  mkdirSync(outDir, { recursive: true });
  const suffix = silhouette ? "-silhouette" : "";
  const out = join(outDir, `${basename(input, ".svg")}${suffix}.png`);
  await el.screenshot({ path: out });
  console.log(`撮影: ${out}`);
}

await browser.close();
