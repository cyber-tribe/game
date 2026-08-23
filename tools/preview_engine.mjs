/**
 * モデルのエンジン内スナップショット(plan/models/archive/
 * engine-preview-snapshots.md、plan/models/archive/
 * preview-animation-gif.md)。
 *
 * `public/models/*.glb` を1体ずつ、実際のゲームと同じ描画スタック
 * (Three.js + トゥーンマテリアル + 背面ハル輪郭線 + ACES + ブルーム +
 * 色調グレーディング。tools/preview-harness.ts/htmlが実体)で
 * ヘッドレスChromiumに描かせる。アニメーションクリップを持つモデルは
 * idle→walk→attack→hit→dieを繋いだ1本の tools/preview/<名前>.gif に、
 * 持たないモデル(静止物)は従来どおり tools/preview/<名前>.png に保存する。
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
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
  const target = `${SITE_URL}tools/preview-harness.html?model=${encodeURIComponent(model)}`;
  try {
    await page.goto(target, { waitUntil: "load" });
    await page.waitForFunction(
      () => window.__previewReady === true || typeof window.__previewError === "string",
      // GIF撮影(idle→walk→attack→hit→dieを繋いだ数十コマ)は
      // 静止画1枚より時間が掛かる
      { timeout: 30_000 },
    );
    const error = await page.evaluate(() => window.__previewError);
    if (error) throw new Error(error);

    // クリップを持つモデルはtools/preview-harness.tsがGIFを
    // window.__gifDataUrlに用意する(plan/models/archive/
    // preview-animation-gif.md)。持たないモデルは従来どおり
    // canvasのスクリーンショットをPNGとして保存する
    const gifDataUrl = await page.evaluate(() => window.__gifDataUrl ?? null);
    let ext;
    if (gifDataUrl) {
      const base64 = gifDataUrl.slice(gifDataUrl.indexOf(",") + 1);
      writeFileSync(join(OUT_DIR, `${model}.gif`), Buffer.from(base64, "base64"));
      rmSync(join(OUT_DIR, `${model}.png`), { force: true }); // 旧PNGが残っていたら消す
      ext = "gif";
    } else {
      await page.locator("canvas").screenshot({ path: join(OUT_DIR, `${model}.png`) });
      rmSync(join(OUT_DIR, `${model}.gif`), { force: true });
      ext = "png";
    }
    shot.push({ model, ext });
    console.log(`撮影: ${model} (.${ext})`);
  } catch (e) {
    failures.push({ model, error: e instanceof Error ? e.message : String(e) });
    console.error(`失敗: ${model} — ${e instanceof Error ? e.message : e}`);
  }
}

await browser.close();

// 一覧ページ(GitHub上でこの1ページを開けば全キャラを見渡せる。
// GitHubはmarkdown内の.gifをそのままアニメーション表示する)
const rows = shot
  .map(({ model, ext }) => `| ${model} | ![${model}](./${model}.${ext}) |`)
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
