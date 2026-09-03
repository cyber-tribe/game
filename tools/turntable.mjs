/**
 * 商品確認用ターンテーブル(plan/models/garudo-product-turntable.md)。
 *
 * `tools/preview-harness.html?model=<名前>&turntable=1` をヘッドレス
 * Chromiumで開き、0/45/90/135/180°の5枚と**ゲーム実カメラ**の1枚を
 * 横に並べた1枚のPNGを tools/preview/turntable/<名前>.png に保存する。
 *
 * 目的は数値QAを増やすことではなく、**最終判定を目で行う場所を固定する**
 * こと。数値が全部PASSなのに見た目がおかしい、が何度も起きているのは
 * 自動QAの不備ではなく、キャラクターデザインという問題の性質による。
 *
 *   npm run dev &
 *   npm run turntable            # 既定は主要キャラ
 *   MODELS=garudo npm run turntable
 *
 * 環境変数は npm run preview-engine と同じ流儀(tools/preview_engine.mjs)。
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    const require = createRequire(import.meta.url);
    return require(process.env.PLAYWRIGHT_PATH ?? "/opt/node22/lib/node_modules/playwright");
  }
}
const { chromium } = await loadPlaywright();

const SITE_URL = process.env.URL ?? "http://127.0.0.1:5173/";
const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT_DIR = join(REPO_ROOT, "tools", "preview", "turntable");
mkdirSync(OUT_DIR, { recursive: true });

function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const preinstalled = "/opt/pw-browsers/chromium";
  return existsSync(preinstalled) ? preinstalled : undefined;
}

/** 既定はプレイヤーが長く見るキャラだけ(全モデルを撮ると目視の意味が薄れる) */
const DEFAULT_MODELS = ["garudo"];
const models = (process.env.MODELS ?? DEFAULT_MODELS.join(","))
  .split(",").map((s) => s.trim()).filter(Boolean);

const browser = await chromium.launch({
  executablePath: chromiumPath(),
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
const failures = [];
for (const model of models) {
  const page = await browser.newPage({ viewport: { width: 640, height: 640 } });
  try {
    const target = `${SITE_URL}tools/preview-harness.html`
      + `?model=${encodeURIComponent(model)}&turntable=1`;
    await page.goto(target, { waitUntil: "load" });
    await page.waitForFunction(
      () => window.__previewReady === true || window.__previewError !== undefined,
      null, { timeout: 120_000 },
    );
    const error = await page.evaluate(() => window.__previewError);
    if (error) throw new Error(error);
    const dataUrl = await page.evaluate(() => window.__turntableDataUrl);
    if (!dataUrl) throw new Error("ターンテーブルが返らなかった");
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    writeFileSync(join(OUT_DIR, `${model}.png`), Buffer.from(base64, "base64"));
    console.log(`撮影: ${model}`);
  } catch (e) {
    failures.push(model);
    console.error(`失敗: ${model} — ${e instanceof Error ? e.message : e}`);
  } finally {
    await page.close();
  }
}
await browser.close();
console.log(`\n${models.length - failures.length}件を撮影した。`
  + (failures.length ? `失敗 ${failures.length}件: ${failures.join(", ")}` : "エラーなし"));
if (failures.length > 0) process.exitCode = 1;
