/**
 * 三面図(SVG)と3Dモデルの平行投影シルエットを重ねて照合する
 * (plan/models/2d-turnaround-first-workflow.mdの受け入れ基準2・3)。
 *
 * design/characters/<名前>/turnarounds/<名前>.svg(正面。
 * <名前>-side.svgがあれば側面も)を黒塗りに変換してレンダーし、
 * tools/build_models.py --silhouette が出力する3D側の平行投影
 * シルエットと、Playwrightのcanvasで赤(三面図)・青(3D)に色分けして
 * 重ね合わせる。重なった部分は紫、ずれた部分は赤or青だけになるので、
 * 一目でずれが分かる。
 *
 *   tools/venv/bin/python tools/build_models.py <名前> --silhouette
 *   node tools/compare_turnaround.mjs <名前>
 *
 * 出力は tools/preview/silhouettes/<名前>-front-compare.png
 * (側面があれば -side-compare.png も)。
 *
 * 環境変数は他のtools/*.mjsと同じ流儀。
 *   CHROMIUM_PATH    Chromium の実行ファイル
 *   PLAYWRIGHT_PATH  playwright パッケージの場所
 */
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
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

const name = process.argv[2];
if (!name) {
  console.error("使い方: node tools/compare_turnaround.mjs <キャラ名>");
  console.error("(先に tools/venv/bin/python tools/build_models.py <キャラ名> --silhouette を実行しておくこと)");
  process.exitCode = 1;
  process.exit();
}

const { chromium } = await loadPlaywright();
const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const PREVIEW_DIR = join(REPO_ROOT, "tools", "preview", "silhouettes");
const CHAR_DIR = join(REPO_ROOT, "design", "characters", name, "turnarounds");

function chromiumPath() {
  const explicit = process.env.CHROMIUM_PATH;
  if (explicit) return explicit;
  const preinstalled = "/opt/pw-browsers/chromium";
  return existsSync(preinstalled) ? preinstalled : undefined;
}

const browser = await chromium.launch({ executablePath: chromiumPath() });
const page = await browser.newPage();

/** SVGの全fillを黒に強制した版を、白背景でレンダーしたPNGのdata URLを返す */
async function svgSilhouetteDataUrl(svgPath) {
  const svg = readFileSync(svgPath, "utf-8")
    .replace(/<text[\s\S]*?<\/text>/g, "") // 目視用のキャプション文字はシルエット照合に含めない
    .replace(/fill="(?!none)[^"]*"/g, 'fill="#000"')
    .replace(/stroke="(?!none)[^"]*"/g, 'stroke="#000"');
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#fff}</style>${svg}`,
  );
  const el = await page.$("svg");
  const box = await el.boundingBox();
  await page.setViewportSize({ width: Math.ceil(box.width), height: Math.ceil(box.height) });
  return `data:image/png;base64,${(await el.screenshot()).toString("base64")}`;
}

/** 2枚のシルエットPNG(片方=三面図/赤、片方=3D/青)を重ねて1枚にする */
async function compare(turnaroundPath, modelPath, outPath, size = 500) {
  const turnaroundUrl = await svgSilhouetteDataUrl(turnaroundPath);
  const modelBuf = readFileSync(modelPath);
  const modelUrl = `data:image/png;base64,${modelBuf.toString("base64")}`;

  await page.setContent(`<!doctype html><meta charset="utf-8">
    <style>html,body{margin:0;background:#fff}canvas{display:block}</style>
    <canvas id="c" width="${size}" height="${size}"></canvas>`);
  await page.evaluate(
    async ({ turnaroundUrl, modelUrl, size }) => {
      function loadImg(src) {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = src;
        });
      }
      // 白地に黒塗りの画像から、黒い部分だけ抜き出して指定色に塗った
      // ImageDataを作る(白背景はそのまま透明にする)
      function tint(img, r, g, b) {
        const c = document.createElement("canvas");
        c.width = size; c.height = size;
        const cx = c.getContext("2d");
        // 中央にアスペクト比を保って収める
        const scale = Math.min(size / img.width, size / img.height) * 0.9;
        const w = img.width * scale, h = img.height * scale;
        cx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        const data = cx.getImageData(0, 0, size, size);
        for (let i = 0; i < data.data.length; i += 4) {
          const lum = (data.data[i] + data.data[i + 1] + data.data[i + 2]) / 3;
          const isBlack = lum < 128 && data.data[i + 3] > 0;
          data.data[i] = isBlack ? r : 255;
          data.data[i + 1] = isBlack ? g : 255;
          data.data[i + 2] = isBlack ? b : 255;
          data.data[i + 3] = 255;
        }
        cx.putImageData(data, 0, 0);
        return c;
      }
      const [turnaroundImg, modelImg] = await Promise.all([loadImg(turnaroundUrl), loadImg(modelUrl)]);
      const turnaroundCanvas = tint(turnaroundImg, 220, 40, 40); // 三面図=赤
      const modelCanvas = tint(modelImg, 40, 80, 220); // 3D=青

      const out = document.getElementById("c");
      const ctx = out.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, size, size);
      ctx.globalCompositeOperation = "multiply";
      ctx.drawImage(turnaroundCanvas, 0, 0);
      ctx.drawImage(modelCanvas, 0, 0);
    },
    { turnaroundUrl, modelUrl, size },
  );
  await page.locator("canvas").screenshot({ path: outPath });
  console.log(`撮影: ${outPath} (赤=三面図のみ / 青=3Dのみ / 紫=一致)`);
}

const frontTurnaround = join(CHAR_DIR, `${name}.svg`);
const frontModel = join(PREVIEW_DIR, `${name}-front.png`);
if (!existsSync(frontTurnaround)) {
  console.error(`三面図が見つからない: ${frontTurnaround}`);
  process.exitCode = 1;
} else if (!existsSync(frontModel)) {
  console.error(`3Dシルエットが見つからない: ${frontModel}`);
  console.error(`先に実行: tools/venv/bin/python tools/build_models.py ${name} --silhouette`);
  process.exitCode = 1;
} else {
  await compare(frontTurnaround, frontModel, join(PREVIEW_DIR, `${name}-front-compare.png`));
  const sideTurnaround = join(CHAR_DIR, `${name}-side.svg`);
  const sideModel = join(PREVIEW_DIR, `${name}-side.png`);
  if (existsSync(sideTurnaround) && existsSync(sideModel)) {
    await compare(sideTurnaround, sideModel, join(PREVIEW_DIR, `${name}-side-compare.png`));
  }
}

await browser.close();
