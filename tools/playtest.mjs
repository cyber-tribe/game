/**
 * ヘッドレスブラウザで実際に遊んでみて、動くことを確かめる。
 *
 *   npm run dev &
 *   npm run playtest
 *
 * 環境変数で行き先を変えられる。
 *   URL              遊びに行くアドレス (既定 http://127.0.0.1:5173/)
 *   OUT              スクリーンショットの出力先 (既定 ./playtest-shots)
 *   CHROMIUM_PATH    Chromium の実行ファイル。未指定なら playwright が持つものを使う
 *   PLAYWRIGHT_PATH  playwright パッケージの場所。依存に無い環境向けの逃げ道
 *
 * WebGL はソフトウェア実装 (SwiftShader) で動かす。CI のランナーにも
 * 手元のコンテナにも GPU は無いので、これが無いと WebGL の初期化に失敗する。
 *
 * ソフトウェア描画は1フレームぶんのラスタライズをすべて CPU でやるので、
 * 実行時間はほぼ画素数に比例する。ビューポートを小さめに取ってあるのはそのため
 * (1280x800 から 800x500 に落としたところ、CI の所要時間が大きく縮んだ)。
 * 同じ理由でスクリーンショットも1枚ごとに高くつくため、各場面につき1枚に絞ってある。
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync } from "node:fs";

/**
 * playwright はプロジェクトの依存には入れていない。ブラウザまで抱えると、
 * ゲームを動かしたいだけの人にまで数百MBを背負わせることになるため。
 * 入っていればそれを使い、無ければ環境に置かれているものを探す。
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
const OUT = process.env.OUT ?? "playtest-shots";
mkdirSync(OUT, { recursive: true });

/** 明示された実行ファイルがあればそれを、無ければ playwright に任せる */
function chromiumPath() {
  const explicit = process.env.CHROMIUM_PATH;
  if (explicit) return explicit;
  // このコンテナには playwright 用の Chromium が別置きされている
  const preinstalled = "/opt/pw-browsers/chromium";
  return existsSync(preinstalled) ? preinstalled : undefined;
}

const browser = await chromium.launch({
  executablePath: chromiumPath(),
  args: [
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--use-gl=angle",
    "--disable-gpu-sandbox",
  ],
});

const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
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

/**
 * 直前の操作が処理され、アニメーションの再生が終わるまで待つ。
 *
 * 固定時間で待つのはやめてある。遅い環境では再生が終わる前に次の操作へ進んでしまい、
 * その入力が握り潰されて後続の検査が巻き添えで落ちる。速い環境では逆に待ちすぎる。
 *
 * まず rAF を2回まわして、直前に送ったキーがループに取り込まれるのを確かめてから、
 * ロックが解けるのを待つ。App 側は lock 中の入力を捨てるので、この順序で待たないと
 * 「押したのに1ターンも進んでいない」が静かに起きる。
 */
async function settle(timeout = 10_000) {
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
  await page
    .waitForFunction(() => globalThis.__app?.debugIdle() !== false, { timeout })
    .catch(() => {}); // 掴めなくても先へ進む。異常は後続のアサートとエラー収集が拾う
}

/** 要素の表示状態が変わるまで待つ */
async function waitForDisplay(selector, shown, timeout = 5_000) {
  await page
    .waitForFunction(
      ([sel, want]) => {
        const el = document.querySelector(sel);
        if (!el) return !want;
        return (el.style.display !== "none") === want;
      },
      [selector, shown],
      { timeout },
    )
    .catch(() => {});
}

await page.goto(URL, { waitUntil: "load" });

// モデルの読み込みが終わるまで待つ
await page.waitForFunction(
  () => document.querySelector("#loading")?.style.display === "none",
  { timeout: 60_000 },
);
await settle();
await page.screenshot({ path: `${OUT}/00-town.png` });

// 拠点。倉庫から2つ持ち込んでから潜る
await page.keyboard.press("Enter");
await settle();
await page.keyboard.press("Enter");
await settle();
await page.keyboard.press("Space");
await settle();
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

/** キーを押しっぱなしにして歩かせる。押している長さが、進むターン数を決める */
async function walk(key, ms) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
  await settle();
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
await waitForDisplay("#menu", true);
await page.screenshot({ path: `${OUT}/03-menu.png` });
const menuShown = await page.evaluate(
  () => document.querySelector("#menu")?.style.display !== "none",
);
await page.keyboard.press("Escape");
await waitForDisplay("#menu", false);

// 視点回転
await page.keyboard.press("KeyE");
await settle();

// 階段まで一気に進めて、フロア移動を確かめる
const descended = await page.evaluate(async () => {
  const app = globalThis.__app;
  if (!app) return "デバッグ用の参照がない";
  app.debugDescend();
  return "ok";
});
await settle();
await page.screenshot({ path: `${OUT}/05-next-floor.png` });
console.log("階層移動:", descended, JSON.stringify(await readHud(), null, 1));

// たくさん足踏みして、モンスターの行動と満腹度の減少を回す。
//
// 回数を 40 から 20 に減らしてあるが、実際に進むターン数はむしろ増えている。
// 以前は固定時間で待っていたため、再生中に送ったキーが App 側で捨てられ、
// 40回押しても実際には10ターン前後しか進んでいなかった。settle を挟むと
// 20回ぶんが確実に20ターンになる。
const STEP_IN_PLACE = 20;
for (let i = 0; i < STEP_IN_PLACE; i++) {
  await page.keyboard.press("Period");
  await settle();
}
console.log(`足踏み${STEP_IN_PLACE}回後:`, JSON.stringify(await readHud(), null, 1));

// モンスターの隣に立って殴り合う。攻撃・被弾・撃破の流れを見る
const fight = await page.evaluate(() => globalThis.__app.debugFightNearest());
console.log("戦闘準備:", fight);
// 移動と攻撃は「押しっぱなし」を見て判定しているので、press では動かない
await page.keyboard.down(fight.key ?? "ArrowRight");
await page.waitForTimeout(1900);
await page.keyboard.up(fight.key ?? "ArrowRight");
await settle();
await page.screenshot({ path: `${OUT}/08-after-fight.png` });
console.log("戦闘後:", JSON.stringify(await readHud(), null, 1));

// アイテムを持たせてメニューから使う
await page.evaluate(() => {
  globalThis.__app.debugGive("healLeaf");
  globalThis.__app.debugGive("hatchet");
  globalThis.__app.debugGive("mapScroll");
});
await page.keyboard.press("KeyI");
await waitForDisplay("#menu", true);
await page.keyboard.press("Enter");
await settle();
await page.keyboard.press("Enter");
await settle();
await page.screenshot({ path: `${OUT}/11-item-used.png` });
console.log("アイテム使用後:", JSON.stringify(await readHud(), null, 1));

// 選んだ道具によっては、使ったあともメニューが開いたまま残る。開いたままだと
// 以降のキーをメニューが食ってしまい、最後の「R キーで拠点に戻る」まで効かなくなる。
// (実際この取りこぼしのせいで、拠点帰還の確認はずっと false のまま素通りしていた)
await page.keyboard.press("Escape");
await waitForDisplay("#menu", false);

const stats = await page.evaluate(() => {
  const app = globalThis.__app;
  return app ? app.debugStats() : null;
});
console.log("内部状態:", JSON.stringify(stats));

// ---- タルと仲間 ----
// 目の前のモンスターに空のタルをぶつけて吸い込み、投げて仲間にするまで
const front = await page.evaluate(() => globalThis.__app.debugMonsterInFront());
console.log("タルの的:", front);
if (front) {
  await page.evaluate(() => globalThis.__app.debugGiveBarrel("empty"));
  await settle();

  // HP満タンだと吸い込みにくいので、まず殴って弱らせる
  await page.keyboard.down(front.key);
  await page.waitForTimeout(1200);
  await page.keyboard.up(front.key);
  await settle();

  await page.keyboard.press("KeyG");
  await settle();
}

// 中身入りのタルを抱えて投げ、仲間にする。
// 前に投げたタルが正面に転がっていると邪魔なので、向きを変えてから投げる
await page.evaluate(() => globalThis.__app.debugFaceOpenSide());
await page.evaluate(() => globalThis.__app.debugGiveBarrel("caught", "gajiri"));
await settle();
await page.keyboard.press("KeyG");
await settle();
await page.screenshot({ path: `${OUT}/16-recruited.png` });
const allyInfo = await page.evaluate(() => {
  const s = globalThis.__app.debugStats();
  return { allies: s.allies, barrels: s.barrels, log: s.log };
});
console.log("仲間にした結果:", JSON.stringify(allyInfo));
if (allyInfo.allies.length === 0) {
  console.error("仲間にできなかった。直前のログ:", allyInfo.log);
  process.exitCode = 1;
}

// 仲間にすると命名ダイアログ(#naming)が開く。これは素の text input に
// フォーカスを持たせる作りなので、開いているあいだキー入力はすべてそちらへ行く。
// 閉じずに進めると、以降の「爆発タルを投げる」「仲間を連れて歩く」
// 「R キーで拠点に戻る」がまるごと無反応になる。Esc は「あとで」に当たる。
await page.keyboard.press("Escape");
await waitForDisplay("#naming", false);

// 爆発タルも一度出しておく
await page.evaluate(() => globalThis.__app.debugGiveBarrel("bomb"));
await settle();
await page.keyboard.press("KeyG");
await settle();
await page.screenshot({ path: `${OUT}/17-explosion.png` });

// 仲間を連れたまま数ターン歩く
await page.keyboard.down("ArrowDown");
await page.waitForTimeout(900);
await page.keyboard.up("ArrowDown");
await settle();
console.log("同行中:", JSON.stringify(await page.evaluate(() => globalThis.__app.debugStats())));

// 倒れたときの流れ。全滅表示 → R キーで拠点に戻る
await page.evaluate(() => globalThis.__app.debugKill());
await settle();
await page.screenshot({ path: `${OUT}/12-gameover.png` });
const overlayText = await page.evaluate(
  () => document.querySelector("#overlay")?.textContent?.trim(),
);
console.log("全滅表示:", overlayText);

await page.keyboard.press("KeyR");
await waitForDisplay("#town", true);
const townShown = await page.evaluate(
  () => document.querySelector("#town")?.style.display === "flex",
);
console.log("拠点に戻った:", townShown, "/ メニュー表示:", menuShown);
if (!townShown) {
  console.error("倒れたあと R キーで拠点に戻れなかった。");
  process.exitCode = 1;
}

await browser.close();

if (errors.length > 0) {
  console.log("\n--- エラー ---");
  for (const e of errors) console.log(e);
  process.exitCode = 1;
} else {
  console.log("\nエラーなし");
}
