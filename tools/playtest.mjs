/**
 * ヘッドレスブラウザで実際に遊んでみて、動くことを確かめる。
 *
 *   npx vite --port 5173 &
 *   NODE_PATH=/opt/node22/lib/node_modules node tools/playtest.mjs
 *
 * WebGL はソフトウェア実装 (SwiftShader) を使う。GPU の無い環境で
 * Chromium を動かすときはこの指定が要る。
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";

/**
 * playwright はプロジェクトの依存には入れていない(ブラウザまで抱えると重い)。
 * インストールされていればそれを使い、無ければ環境に置かれているものを探す。
 */
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

const URL = process.env.URL ?? "http://127.0.0.1:5173/";
const OUT = process.env.OUT ?? "/tmp/shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: [
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--use-gl=angle",
    "--disable-gpu-sandbox",
  ],
});

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});
page.on("response", (r) => {
  if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`);
});
page.on("requestfailed", (r) => {
  errors.push(`requestfailed: ${r.url()} (${r.failure()?.errorText})`);
});

await page.goto(URL, { waitUntil: "load" });

// モデルの読み込みが終わるまで待つ
await page.waitForFunction(
  () => document.querySelector("#loading")?.style.display === "none",
  { timeout: 60_000 },
);
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/01-start.png` });

const readHud = () =>
  page.evaluate(() => ({
    depth: document.querySelector("#hud-depth")?.textContent,
    hp: document.querySelector("#hud-hp-text")?.textContent,
    satiety: document.querySelector("#hud-satiety-text")?.textContent,
    level: document.querySelector("#hud-level")?.textContent,
    log: [...document.querySelectorAll("#log div")].map((d) => d.textContent),
  }));

console.log("起動直後:", JSON.stringify(await readHud(), null, 1));

/** キーを押しっぱなしにして歩かせる */
async function walk(key, ms) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
  await page.waitForTimeout(250);
}

// あちこち歩き回って、移動・戦闘・視界が動くことを見る
for (const [key, ms] of [
  ["ArrowRight", 900],
  ["ArrowDown", 900],
  ["ArrowLeft", 700],
  ["ArrowUp", 700],
]) {
  await walk(key, ms);
}
await page.screenshot({ path: `${OUT}/02-walked.png` });
console.log("歩いたあと:", JSON.stringify(await readHud(), null, 1));

// 持ち物メニュー
await page.keyboard.press("KeyI");
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/03-menu.png` });
const menuShown = await page.evaluate(
  () => document.querySelector("#menu")?.style.display !== "none",
);
await page.keyboard.press("Escape");
await page.waitForTimeout(250);

// 視点回転
await page.keyboard.press("KeyE");
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/04-rotated.png` });

// 階段まで一気に進めて、フロア移動を確かめる
const descended = await page.evaluate(async () => {
  const app = globalThis.__app;
  if (!app) return "デバッグ用の参照がない";
  app.debugDescend();
  return "ok";
});
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/05-next-floor.png` });
console.log("階層移動:", descended, JSON.stringify(await readHud(), null, 1));

// たくさん足踏みして、モンスターの行動と満腹度の減少を回す
for (let i = 0; i < 40; i++) {
  await page.keyboard.press("Period");
  await page.waitForTimeout(180);
}
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/06-after-waits.png` });
console.log("足踏み40回後:", JSON.stringify(await readHud(), null, 1));

// モンスターの隣に立って殴り合う。攻撃・被弾・撃破の流れを見る
const fight = await page.evaluate(() => globalThis.__app.debugFightNearest());
console.log("戦闘準備:", fight);
// 移動と攻撃は「押しっぱなし」を見て判定しているので、press では動かない
await page.keyboard.down(fight.key ?? "ArrowRight");
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/07-fight.png` });
await page.waitForTimeout(1400);
await page.keyboard.up(fight.key ?? "ArrowRight");
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/08-after-fight.png` });
console.log("戦闘後:", JSON.stringify(await readHud(), null, 1));

// アイテムを持たせてメニューから使う
await page.evaluate(() => {
  globalThis.__app.debugGive("healLeaf");
  globalThis.__app.debugGive("hatchet");
  globalThis.__app.debugGive("mapScroll");
});
await page.keyboard.press("KeyI");
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/09-menu-items.png` });
await page.keyboard.press("Enter");
await page.waitForTimeout(250);
await page.screenshot({ path: `${OUT}/10-menu-sub.png` });
await page.keyboard.press("Enter");
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/11-item-used.png` });
console.log("アイテム使用後:", JSON.stringify(await readHud(), null, 1));

const stats = await page.evaluate(() => {
  const app = globalThis.__app;
  return app ? app.debugStats() : null;
});
console.log("内部状態:", JSON.stringify(stats));

await browser.close();

if (errors.length > 0) {
  console.log("\n--- エラー ---");
  for (const e of errors) console.log(e);
  process.exitCode = 1;
} else {
  console.log("\nエラーなし");
}
