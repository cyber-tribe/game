/**
 * 自動テストプレイエージェント(plan/archive/auto-tester.md)。
 *
 *   npm run build && npx vite preview --port 4173 &
 *   URL=http://127.0.0.1:4173/ npm run auto-tester
 *
 * npm run playtest(決まった導線の機械的な回帰確認)とは違い、重み付き
 * ランダムな入力で複数セッション自由に探索し、見つけた異常を
 * ${OUT}/report.json にまとめる。実際のGitHub Issue作成は
 * .github/workflows/auto-tester.yml 側の actions/github-script が
 * このreport.jsonを読んで行う(このスクリプト自身はGitHub APIを呼ばない)。
 *
 * 環境変数:
 *   URL              遊びに行くアドレス (既定 http://127.0.0.1:5173/)
 *   OUT              スクリーンショット・report.json の出力先 (既定 ./auto-tester-shots)
 *   SESSIONS         セッション数 (既定 8)
 *   MAX_TURNS        1セッションあたりの最大ターン数 (既定 200)
 *   MAX_SESSION_MS   1セッションあたりの壁時計時間の上限 (既定 180000 = 3分)
 *   CHROMIUM_PATH / PLAYWRIGHT_PATH  npm run playtest と同じ
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fingerprint, normalizeMessage, topStackFrame } from "./fingerprint.mjs";
import { SOFTLOCK_TURNS, SoftlockDetector } from "./softlock-detector.mjs";

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
const OUT = process.env.OUT ?? "auto-tester-shots";
const SESSIONS = Number(process.env.SESSIONS ?? 8);
const MAX_TURNS = Number(process.env.MAX_TURNS ?? 200);
const MAX_SESSION_MS = Number(process.env.MAX_SESSION_MS ?? 3 * 60_000);
/** HUD読み取りがこの時間応答しなければ「応答なし」とみなす */
const HANG_TIMEOUT_MS = 10_000;

mkdirSync(OUT, { recursive: true });

function chromiumPath() {
  const explicit = process.env.CHROMIUM_PATH;
  if (explicit) return explicit;
  const preinstalled = "/opt/pw-browsers/chromium";
  return existsSync(preinstalled) ? preinstalled : undefined;
}

/** mulberry32。入力選択に使う乱数シードとして、実行のたびに記録・再現できるようにする */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weightedPick(rng, entries) {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * total;
  for (const [key, weight] of entries) {
    roll -= weight;
    if (roll < 0) return key;
  }
  return entries[entries.length - 1][0];
}

const DIRECTIONS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];

const readHud = (page) =>
  page.evaluate(() => {
    const app = globalThis.__app;
    if (!app?.game) return null;
    // 拠点の3D化(plan/town-3d-exploration.md): 拠点は「村を歩く→建物へ
    // 確定で入る→TownScreen」の2段構えになった。debugVillageActive()が
    // 無い(=このビルドより前の)実装でも動くよう、任意呼び出しにしてある
    const screen = app.debugVillageActive?.()
      ? "village"
      : document.querySelector("#town")?.style.display === "flex"
        ? "town"
        : "dungeon";
    return {
      screen,
      depth: app.game.depth,
      pos: { x: app.game.player.pos.x, y: app.game.player.pos.y },
      hp: app.game.player.hp,
      status: app.game.status,
      allies: app.game.allyList.length,
    };
  });

/**
 * 進行不能を疑ったその瞬間の状態を撮る。「本当に動けなかったのか、
 * それとも単にランダムな入力が壁ばかり選んだのか」を後から見分けられるよう、
 * 周囲8マスの通行可否と、入力を横取りしうるもの(モーダル・再生ロック等)を
 * まとめて残す
 */
const captureDetectionState = (page, hud) =>
  page
    .evaluate(() => {
      const app = globalThis.__app;
      const game = app?.game;
      if (!game) return null;
      const player = game.player;
      const neighbors = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const x = player.pos.x + dx;
          const y = player.pos.y + dy;
          const inside = x >= 0 && y >= 0 && x < game.floor.width && y < game.floor.height;
          const tile = inside ? game.floor.tiles[y * game.floor.width + x] : null;
          const occupant = game.floor.actors.find((a) => a.alive && a.pos.x === x && a.pos.y === y);
          neighbors.push({
            delta: `${dx},${dy}`,
            tile: tile ? tile.kind : "outOfBounds",
            occupant: occupant ? occupant.kind : null,
          });
        }
      }
      return {
        turn: game.turnCount,
        pos: { ...player.pos },
        // 入力が盤面まで届かない状態になっていないか(届いていないなら
        // 「動けない」ではなく「操作を受け付けていない」側の不具合)
        blockedBy: {
          lock: app.lock,
          anyModalOpen: app.anyModalOpen?.() ?? null,
          photoMode: app.photoMode ?? null,
          helpVisible: app.helpVisible ?? null,
          villageActive: app.villageActive ?? null,
          ended: app.ended ?? null,
        },
        neighbors,
        log: [...document.querySelectorAll("#log div")].map((d) => d.textContent).slice(-6),
      };
    })
    .catch(() => null)
    .then((state) => (state ? { ...state, hud } : null));

async function runSession(browser, index) {
  const inputSeed = ((Date.now() ^ (index * 0x9e3779b9)) >>> 0) || 1;
  const rng = mulberry32(inputSeed);
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  const anomalies = [];
  const record = (kind, detail, extra = {}) => {
    anomalies.push({ kind, detail, ...extra });
  };
  page.on("pageerror", (e) => record("pageerror", e.message, { stack: e.stack }));
  page.on("console", (m) => {
    if (m.type() === "error") record("consoleError", m.text());
  });
  page.on("response", (r) => {
    if (r.status() >= 400) record("http", `${r.status()} ${r.url()}`);
  });
  page.on("requestfailed", (r) => record("requestfailed", `${r.url()} (${r.failure()?.errorText})`));

  let rngState = null;
  let turn = 0;
  let finalHud = null;
  try {
    await page.goto(URL, { waitUntil: "load" });
    await page.waitForFunction(() => document.querySelector("#loading")?.style.display === "none", {
      timeout: 60_000,
    });
    await page.waitForTimeout(800);

    // 建物・村人ごとの役割メニュー(plan/game/archive/village-scoped-menus.md):
    // 起動直後は村なかの3D空間から始まる。「旅の看板」は列(0〜19)を持たない
    // 掲示専用の場所に変わったため、出発の支度一式を開ける「洞窟の入口」まで
    // debugVillagePos/debugVillageBuildings(いずれもデバッグ用の入口)を
    // 見ながら歩き、近づいて確定してから、既定の持ち込みのまま即座に潜る
    const cave = await page.evaluate(
      () => globalThis.__app?.debugVillageBuildings?.()?.find((b) => b.id === "cave") ?? null,
    );
    if (cave) {
      const deadline = Date.now() + 8_000;
      while (Date.now() < deadline) {
        const near = await page.evaluate(() => globalThis.__app?.debugVillageNearBuildingId?.() ?? null);
        if (near === "cave") break;
        const pos = await page.evaluate(() => globalThis.__app?.debugVillagePos?.() ?? null);
        if (!pos) break;
        const dx = cave.x - pos.x;
        const dz = cave.z - pos.z;
        const keys = [];
        if (Math.abs(dx) > 0.25) keys.push(dx > 0 ? "ArrowRight" : "ArrowLeft");
        if (Math.abs(dz) > 0.25) keys.push(dz > 0 ? "ArrowDown" : "ArrowUp");
        if (keys.length === 0) break;
        for (const k of keys) await page.keyboard.down(k);
        await page.waitForTimeout(120);
        for (const k of keys) await page.keyboard.up(k);
      }
    }
    await page.keyboard.press("Space");
    await page.waitForTimeout(700);

    rngState = await page.evaluate(() => globalThis.__app?.game?.rng?.getState() ?? null);

    const softlock = new SoftlockDetector();
    const sessionStart = Date.now();
    const descendAtTurn = Math.floor(MAX_TURNS * 0.7);

    for (; turn < MAX_TURNS; turn++) {
      if (Date.now() - sessionStart > MAX_SESSION_MS) break;

      let hud;
      try {
        hud = await Promise.race([
          readHud(page),
          new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), HANG_TIMEOUT_MS)),
        ]);
      } catch {
        record("hang", `HUD状態の読み取りが${HANG_TIMEOUT_MS / 1000}秒応答なし`);
        break;
      }
      if (!hud) break;
      finalHud = hud;

      softlock.observe(JSON.stringify(hud));

      if (softlock.takeReport()) {
        // 検知した「その瞬間」の状態を撮っておく。セッション末尾でまとめて
        // 撮る snapshot / recentLog は、報告時点から何十ターンも先の
        // 別の場面になっていることがあり、それを頼りに調べると
        // まったく無関係な状況を追いかけることになる(#396)
        const atDetection = await captureDetectionState(page, hud);
        record("softlock-suspected", `連続${SOFTLOCK_TURNS}ターンHUD状態が変化しない`, {
          lowConfidence: true,
          atDetection,
        });
        await page
          .screenshot({ path: `${OUT}/session-${index}-softlock-turn${turn}.png` })
          .catch(() => {});
      }

      // ダイブが終わっている(全滅・踏破など)か、拠点(村なか・TownScreen)で
      // 待機している状態。このエージェントの通常アクション(move/wait/menu/
      // rotate/orders)には「R で拠点へ戻る」「村なかで確定して建物へ入る」
      // 「Space で潜る」が無いため、ここで拾わないとターン予算が尽きるまで
      // HUDが一切変化せず、本物の進行不能と見分けがつかない
      // 「ソフトロック疑い」を大量に誤検知してしまう
      if (hud.status !== "playing" || hud.screen === "town" || hud.screen === "village") {
        if (hud.screen === "village") {
          // 拠点の3D化(plan/town-3d-exploration.md): どの建物に近いかは
          // 分からないので、軽く動いてから確定を試す程度に留める。
          // 外れても停滞の計測は毎回やり直すので、誤検知にはならない
          const dir = DIRECTIONS[Math.floor(rng() * DIRECTIONS.length)];
          await page.keyboard.down(dir).catch(() => {});
          await page.waitForTimeout(400);
          await page.keyboard.up(dir).catch(() => {});
          await page.keyboard.press("Space").catch(() => {});
          await page.waitForTimeout(400);
        } else {
          // 建物・村人ごとの役割メニュー(plan/game/archive/village-scoped-menus.md):
          // 「旅の看板」やシステム系の「≡」メニューはSpaceでは閉じない
          // (出発の暴発防止)。Escapeを先に試してから、従来どおりR・Spaceも試す
          await page.keyboard.press("Escape").catch(() => {});
          await page.waitForTimeout(200);
          await page.keyboard.press("KeyR").catch(() => {});
          await page.waitForTimeout(400);
          await page.keyboard.press("Space").catch(() => {});
          await page.waitForTimeout(700);
        }
        softlock.reset();
        continue;
      }

      const action = weightedPick(rng, [
        ["move", 60],
        ["wait", 15],
        ["menu", 10],
        ["rotate", 5],
        ["orders", 10],
      ]);

      if (action === "move") {
        const dir = DIRECTIONS[Math.floor(rng() * DIRECTIONS.length)];
        softlock.noteDirection(dir);
        const ms = 150 + Math.floor(rng() * 300);
        await page.keyboard.down(dir);
        await page.waitForTimeout(ms);
        await page.keyboard.up(dir);
      } else if (action === "wait") {
        await page.keyboard.press("Period");
      } else if (action === "menu") {
        await page.keyboard.press("KeyI");
        await page.waitForTimeout(150);
        if (rng() < 0.5) await page.keyboard.press("ArrowDown");
        await page.waitForTimeout(100);
        await page.keyboard.press("Escape");
      } else if (action === "rotate") {
        await page.keyboard.press("KeyE");
      } else if (action === "orders") {
        await page.keyboard.press("KeyT");
        await page.waitForTimeout(150);
        await page.keyboard.press("Escape");
      }
      await page.waitForTimeout(120);

      // 階層の進め方: ターン予算の7割を消化した時点でまだ同じ階にいれば強制的に次の階へ
      if (turn === descendAtTurn) {
        await page
          .evaluate(() => {
            if (globalThis.__app?.game?.status === "playing") globalThis.__app.debugDescend();
          })
          .catch(() => {});
        await page.waitForTimeout(400);
      }
    }
  } catch (e) {
    record("sessionError", e instanceof Error ? e.message : String(e));
  }

  await page.screenshot({ path: `${OUT}/session-${index}-end.png` }).catch(() => {});

  const snapshot = await page
    .evaluate(() => {
      const app = globalThis.__app;
      if (!app?.game?.toSnapshot) return null;
      const snap = app.game.toSnapshot();
      return JSON.parse(JSON.stringify({ ...snap, floor: { ...snap.floor, tiles: undefined } }));
    })
    .catch(() => null);

  const recentLog = await page
    .evaluate(() => [...document.querySelectorAll("#log div")].map((d) => d.textContent).slice(-30))
    .catch(() => []);

  await page.close();

  const fingerprinted = [];
  for (const a of anomalies) {
    const fp = await fingerprint({
      screen: finalHud?.screen ?? "unknown",
      message: a.detail ?? a.kind,
      topFrame: topStackFrame(a.stack),
    });
    fingerprinted.push({ ...a, fingerprint: fp });
  }

  return {
    index,
    inputSeed,
    rngState,
    turns: turn,
    finalHud,
    anomalies: fingerprinted,
    recentLog,
    snapshot,
  };
}

const browser = await chromium.launch({
  executablePath: chromiumPath(),
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--use-gl=angle", "--disable-gpu-sandbox"],
});

const results = [];
for (let i = 0; i < SESSIONS; i++) {
  console.log(`--- セッション ${i + 1}/${SESSIONS} ---`);
  const result = await runSession(browser, i);
  console.log(
    `  turns=${result.turns} depth=${result.finalHud?.depth ?? "?"} anomalies=${result.anomalies.length}`,
  );
  results.push(result);
}
await browser.close();

writeFileSync(`${OUT}/report.json`, JSON.stringify({ generatedAt: new Date().toISOString(), sessions: results }, null, 2));

const totalAnomalies = results.reduce((sum, r) => sum + r.anomalies.length, 0);
console.log(`\n${SESSIONS}セッション完了。異常 ${totalAnomalies} 件検出。`);
console.log(`report.json: ${OUT}/report.json`);
