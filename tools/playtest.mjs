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

// セーブ枠選択
await page.keyboard.press("Enter");
await settle();

// ひなたの寝穴(plan/game/tutorial-dungeon.md): 新規セーブ(このスクリプトは
// 毎回ストレージの無いフレッシュなブラウザプロファイルで動くため、常に
// 新規セーブ扱い)の初回出発は、村を経由せず自動的にチュートリアル専用
// ダンジョンへ潜る。まずここを実際に踏破してから、以降の村なか探索の
// 検証に進む(踏破しないと第一地方が解放されず、後続のダイブ検証が
// すべて的外れになるため)
const startedInHinata = await page.evaluate(() => globalThis.__app?.game?.dungeonId === "hinata");
console.log("新規セーブでひなたの寝穴へ自動的に潜った:", startedInHinata);
if (!startedInHinata) {
  console.error("新規セーブなのにひなたの寝穴へ自動誘導されなかった。");
  process.exitCode = 1;
}
await page.screenshot({ path: `${OUT}/00a-hinata.png` });
for (let i = 0; i < 2; i++) {
  await page.evaluate(() => globalThis.__app.debugBoostHp());
  await page.evaluate(() => globalThis.__app.debugDescend());
  await settle();
}
const hinataStatus = await page.evaluate(() => {
  const app = globalThis.__app;
  app.game.player.pos = { ...app.game.floor.stairs };
  app.submit({ type: "bank" });
  return app.game.status;
});
await settle(15_000);
console.log("ひなたの寝穴を踏破した:", hinataStatus === "cleared");
if (hinataStatus !== "cleared") {
  console.error("ひなたの寝穴を踏破できなかった。");
  process.exitCode = 1;
}
await page.evaluate(() => globalThis.__app.returnToTownAfterRun());
await settle();
await page.screenshot({ path: `${OUT}/00-village.png` });

/**
 * 拠点の3D化(plan/town-3d-exploration.md)。拠点は村を3D空間として
 * 歩き回る場面に変わった。北へ歩けば必ず「旅の看板」(村の入口すぐ)に
 * 着くようにしてあるので、決め打ちの方向で近づき、確定キーで拠点画面を開く。
 */
async function enterNearestVillageBuilding(key = "ArrowUp", timeout = 20_000) {
  // 元は1回のkeydown保持 + waitForFunctionだったが、CIの遅いソフトウェア描画下
  // ではメインループのdtクランプ(main.tsのMath.min(0.05, this.clock.getDelta()))
  // により、保持中のフレーム数そのものが極端に減って移動量が足りないことが
  // あった(単純なタイムアウト延長では解決しなかった)。walkToBuildingAndEnterと
  // 同じく、短い保持を何度も繰り返して都度到着を確認する方式にすることで、
  // 1フレームでも進めば着実に前進できるようにする
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const near = await page.evaluate(() => globalThis.__app?.debugVillageNearBuildingId?.() ?? null);
    if (near !== null) break;
    await page.keyboard.down(key);
    await page.waitForTimeout(150);
    await page.keyboard.up(key);
  }
  await settle();
  await page.keyboard.press("Space");
  await settle();
}

/**
 * 建物・村人ごとの役割メニュー(plan/game/archive/village-scoped-menus.md)。
 * 建物ごとに座標が違うので、決め打ちの方向キーではなく、
 * `debugVillagePos`/`debugVillageBuildings`(いずれもデバッグ用の入口)を
 * 見ながら狙った建物のidに着くまで少しずつ歩く。着いたら確定キーで入る
 */
// タイムアウトは元々8秒だったが、CIの遅いソフトウェア描画下ではメインループの
// dtクランプ(main.tsのMath.min(0.05, ...))により村なかの移動速度も実時間に
// 対して遅くなることがあり、まれに間に合わないことが分かった(#745-749と同じ
// 「CIの遅い描画」由来の時間切れ)。移動そのものは壊れていないので、待つ時間を
// 広げて確実に間に合わせる
async function walkToBuildingAndEnter(id, timeout = 20_000) {
  const target = await page.evaluate(
    (bid) => globalThis.__app?.debugVillageBuildings?.()?.find((b) => b.id === bid) ?? null,
    id,
  );
  if (!target) return false;

  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const near = await page.evaluate(() => globalThis.__app?.debugVillageNearBuildingId?.() ?? null);
    if (near === id) break;
    const pos = await page.evaluate(() => globalThis.__app?.debugVillagePos?.() ?? null);
    if (!pos) break;
    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    const keys = [];
    if (Math.abs(dx) > 0.25) keys.push(dx > 0 ? "ArrowRight" : "ArrowLeft");
    if (Math.abs(dz) > 0.25) keys.push(dz > 0 ? "ArrowDown" : "ArrowUp");
    if (keys.length === 0) break;
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(120);
    for (const k of keys) await page.keyboard.up(k);
  }
  const near = await page.evaluate(() => globalThis.__app?.debugVillageNearBuildingId?.() ?? null);
  if (near !== id) return false;
  await page.keyboard.press("Space");
  await settle();
  return true;
}

await enterNearestVillageBuilding();
const enteredTownFromVillage = await page.evaluate(
  () => document.querySelector("#town")?.style.display === "flex",
);
console.log("村を歩いて拠点画面(旅の看板)を開けた:", enteredTownFromVillage);
if (!enteredTownFromVillage) {
  console.error("村なかを歩いて建物に近づいても拠点画面が開かなかった。");
  process.exitCode = 1;
}

// 旅の看板(plan/game/archive/village-scoped-menus.md): 列(0〜19)を持たない
// 特別な場所になった。掲示を読むだけで出発はしないので、Enterで村へ戻る
await page.keyboard.press("Enter");
await settle();
const backToVillageFromSignpost = await page.evaluate(() => globalThis.__app?.debugVillageActive?.());
console.log("旅の看板からEnterで村へ戻れた:", backToVillageFromSignpost);
if (!backToVillageFromSignpost) {
  console.error("旅の看板を閉じても村なかへ戻らなかった。");
  process.exitCode = 1;
}

// 洞窟の入口(plan/game/archive/village-scoped-menus.md): 出発の支度一式
// (倉庫・持ち込み・出発地点・鍛え方・つれていく仲間・難易度・潜るダンジョン)
// を開ける建物。ここまで歩いて入り、倉庫から持ち込んでから潜る
const enteredCave = await walkToBuildingAndEnter("cave");
console.log("洞窟の入口まで歩いて拠点画面を開けた:", enteredCave);
if (!enteredCave) {
  console.error("洞窟の入口まで歩いても拠点画面が開かなかった。");
  process.exitCode = 1;
}
await page.keyboard.press("Enter");
await settle();
await page.keyboard.press("Space");
await settle();
await page.screenshot({ path: `${OUT}/01-start.png` });

// #646: 固定シードが無いため、このあとの「あちこち歩き回る」「足踏み20回」の
// ような単なる時間経過のステップでも、モンスターの攻撃で偶然全滅することが
// あった。倒れると以降のタル/仲間の検証までまるごと巻き添えで失敗するため、
// ここで一度だけHPを底上げしておく(debugFightNearest()が殴り合いの直前に
// 同じ底上げをしていたのと同じ考え方を、それ以外の場面にも広げた)
await page.evaluate(() => globalThis.__app.debugBoostHp());

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
//
// 攻撃専用キー(plan/attack-button.md)導入により、移動キーで敵の方向へ
// 進んでも「押し出し」になるだけで攻撃にはならない。debugFightNearest()は
// 既にモンスターの方向へ向かせたうえで攻撃キーのコードを返すので、それを
// tapする。keydownのrepeatは無視される作りのため、押しっぱなしではなく
// 1手ごとにtapを繰り返す(他の一度きり操作と同じやり方)
const fight = await page.evaluate(() => globalThis.__app.debugFightNearest());
console.log("戦闘準備:", fight);
const ATTACK_KEY = "KeyX"; // src/view/input.ts の ATTACK_KEY_CODE と合わせる
for (let i = 0; i < 6; i++) {
  await page.keyboard.press(fight.key ?? ATTACK_KEY);
  await settle();
}
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

  // #646/#716と同じ考え方をここにも広げる。固定シードが無いフロアで
  // たまたまモンスターが多い(8〜9体)ときに、このあとの6連続攻撃で
  // 囲まれた反撃を受けて偶然力尽きることがあったため、露出する直前に
  // もう一度底上げしておく
  await page.evaluate(() => globalThis.__app.debugBoostHp());

  // HP満タンだと吸い込みにくいので、まず殴って弱らせる。debugMonsterInFront()が
  // 既にモンスターの方を向かせてあるので、移動キー(押し出しになってしまう)
  // ではなく攻撃専用キー(front.key、plan/attack-button.md)をtapで繰り返す
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press(front.key);
    await settle();
  }

  // 空のタルは捕獲判定に進む相手のHPを1未満にはしない(barrel-capture-clarity.md)が、
  // captureChanceは瀕死でも最大0.85までしか上がらない(仕様どおりの確率)ため、
  // 1回の投げつけで必ず入るとは限らない。ログに成功メッセージが出るまで、
  // 生きている限り再度タルを持たせて投げ直す(投げるたびにHPは1へ寄っていく
  // だけで、倒すことはない)。debugMonsterInFront()はモンスターのHPを
  // 400へ戻してしまうため、判定の再取得には使わない。固定シードが無いため、
  // これをやらないと数十回に一度は「弱らせたのに捕獲だけ失敗する」flakeになっていた
  const captured = (log) => log.some((line) => line?.includes(`${front.name}をタルに吸い込んだ`));
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.keyboard.press("KeyG");
    await settle();
    const stats = await page.evaluate(() => globalThis.__app.debugStats());
    if (captured(stats.log) || stats.monsters === 0) break;
    await page.evaluate(() => globalThis.__app.debugGiveBarrel("empty"));
    await settle();
  }
}

// 中身入りのタルを抱えて投げ、仲間にする。
// 前に投げたタルが正面に転がっていると邪魔なので、向きを変えてから投げる
//
// 着地点の半径2マスに空きが無いと「出てくる場所がなかった……」で仲間に
// ならない(src/domain/barrel/barrelDrop.ts)。この判定はプレイヤーの
// 位置・向き・射程だけで決まる完全な決定的処理(traceThrow)で、乱数は
// 絡まない。**同じ位置から向きだけ変えて投げ直しても、debugFaceOpenSide()
// は隣接マスが空いてさえいれば同じ方向を返すので、結果は毎回同じになる**
// (PR #1028 のCIで、4回とも同一のログで失敗して発覚)。モンスターが
// 密集した部屋に立っていると、その場に留まる限り何度投げても直らない。
// 失敗したら投げる前に1マス歩いて着地点そのものを変える
const STEP_KEYS = ["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"];
let allyInfo = null;
for (let attempt = 0; attempt < 4; attempt++) {
  if (attempt > 0) {
    await page.keyboard.press(STEP_KEYS[attempt % STEP_KEYS.length]);
    await settle();
  }
  await page.evaluate(() => globalThis.__app.debugFaceOpenSide());
  await page.evaluate(() => globalThis.__app.debugGiveBarrel("caught", "gajiri"));
  await settle();
  await page.keyboard.press("KeyG");
  await settle();
  allyInfo = await page.evaluate(() => {
    const s = globalThis.__app.debugStats();
    return { allies: s.allies, barrels: s.barrels, log: s.log };
  });
  if (allyInfo.allies.length > 0) break;
  console.log(`仲間にできなかった(${attempt + 1}回目)。直前のログ:`, allyInfo.log);
}
await page.screenshot({ path: `${OUT}/16-recruited.png` });
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
await settle();
// 拠点の3D化(plan/town-3d-exploration.md): R キーで戻る先も村なかの
// 3D空間になったので、建物に近づいて確定するところまで確かめる
await enterNearestVillageBuilding();
const townShown = await page.evaluate(
  () => document.querySelector("#town")?.style.display === "flex",
);
console.log("拠点に戻った:", townShown, "/ メニュー表示:", menuShown);
if (!townShown) {
  console.error("倒れたあと R キーで村へ戻り、建物に近づいても拠点画面が開かなかった。");
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
