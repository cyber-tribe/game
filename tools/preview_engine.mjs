/**
 * モデルのエンジン内スナップショット(plan/models/archive/
 * engine-preview-snapshots.md)。
 *
 * `public/models/*.glb` を1体ずつ、実際のゲームと同じ描画スタック
 * (Three.js + トゥーンマテリアル + 背面ハル輪郭線 + ACES + ブルーム +
 * 色調グレーディング。tools/preview-harness.ts/htmlが実体)で
 * ヘッドレスChromiumに描かせ、tools/preview/<名前>.png に保存する。
 * 最後に一覧ページ tools/preview/README.md も作り直す。
 *
 *   npm run dev &
 *   npm run preview-engine
 *
 * 環境変数は npm run playtest と同じ流儀(tools/playtest.mjs参照)。
 *   URL              遊びに行くアドレス (既定 http://127.0.0.1:5173/)
 *   CHROMIUM_PATH    Chromium の実行ファイル
 *   PLAYWRIGHT_PATH  playwright パッケージの場所
 *   MODELS           カンマ区切りで対象を絞る(既定は全モデル)
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
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

const { chromium } = await loadPlaywright();

const SITE_URL = process.env.URL ?? "http://127.0.0.1:5173/";
const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const MODELS_DIR = join(REPO_ROOT, "public", "models");
const OUT_DIR = join(REPO_ROOT, "tools", "preview");
mkdirSync(OUT_DIR, { recursive: true });

function chromiumPath() {
  const explicit = process.env.CHROMIUM_PATH;
  if (explicit) return explicit;
  const preinstalled = "/opt/pw-browsers/chromium";
  return existsSync(preinstalled) ? preinstalled : undefined;
}

/** 対象モデル名の一覧。public/models/*.glb を走査するので、追加登録の手間がない */
function targetModels() {
  const all = readdirSync(MODELS_DIR)
    .filter((name) => name.endsWith(".glb"))
    .map((name) => basename(name, ".glb"))
    .sort();
  const only = process.env.MODELS?.split(",").map((s) => s.trim()).filter(Boolean);
  return only && only.length > 0 ? all.filter((name) => only.includes(name)) : all;
}

const browser = await chromium.launch({
  executablePath: chromiumPath(),
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--use-gl=angle", "--disable-gpu-sandbox"],
});
const page = await browser.newPage();

const failures = [];
const shot = [];

for (const model of targetModels()) {
  const target = `${SITE_URL}tools/preview-harness.html?model=${encodeURIComponent(model)}&attack=1`;
  try {
    await page.goto(target, { waitUntil: "load" });
    await page.waitForFunction(
      () => window.__previewReady === true || typeof window.__previewError === "string",
      { timeout: 20_000 },
    );
    const error = await page.evaluate(() => window.__previewError);
    if (error) throw new Error(error);
    const path = join(OUT_DIR, `${model}.png`);
    // ページ全体ではなくcanvas要素だけを撮る(ビューポートの余白を含めない)
    await page.locator("canvas").screenshot({ path });
    shot.push(model);
    console.log(`撮影: ${model}`);
  } catch (e) {
    failures.push({ model, error: e instanceof Error ? e.message : String(e) });
    console.error(`失敗: ${model} — ${e instanceof Error ? e.message : e}`);
  }
}

await browser.close();

// 一覧ページ(GitHub上でこの1ページを開けば全キャラを見渡せる)
const rows = shot
  .map((name) => `| ${name} | ![${name}](./${name}.png) |`)
  .join("\n");
const readme = `# モデルのエンジン内プレビュー

\`tools/preview_engine.mjs\`が自動生成する(手で編集しない)。
実際のゲームと同じ描画スタック(トゥーンマテリアル・輪郭線・
ポストプロセス)で撮っているので、ゲーム内の見た目と一致する
(plan/models/archive/engine-preview-snapshots.md)。

| モデル | 見た目 |
|---|---|
${rows}
`;
writeFileSync(join(OUT_DIR, "README.md"), readme);

if (failures.length > 0) {
  console.log(`\n${failures.length}件のモデルで撮影に失敗した:`);
  for (const f of failures) console.log(`  ${f.model}: ${f.error}`);
  process.exitCode = 1;
} else {
  console.log(`\n${shot.length}件のモデルを撮影した。エラーなし`);
}
