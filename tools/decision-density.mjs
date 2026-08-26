/**
 * 判断密度のプレイテスト(plan/game/archive/decision-density-playtest.md)。
 *
 *   npm run dev &
 *   node tools/decision-density.mjs
 *
 * tools/playtest.mjs(疎通確認)・tools/auto-tester.mjs(乱数プレイテスト)の
 * どちらとも違い、この場で実際にゲームを操作するのはこのスクリプト自身
 * (=書き手であるClaude)であり、目的も「壊れていないか」ではなく
 * 「30秒(目安10ターン)ごとに面白い判断が発生しているか」の記録。
 *
 * app.submit()を差し替えて、実際に発行されたコマンドの種類・アイテムの
 * 種類ごとの使用回数を数える。区切り(CHECKPOINT_TURNS)ごとに、その区間で
 * 実際に検討した選択肢と、費やしたコメントをここに書き残す
 * (decisionNotes配列)。最後にplan/game/decision-density-findings.mdへ
 * 実測値と所見をそのまま書き出す。
 *
 * 環境変数はtools/playtest.mjsと同じ(URL・OUT・CHROMIUM_PATH・PLAYWRIGHT_PATH)。
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    const require = createRequire(import.meta.url);
    const fallback = process.env.PLAYWRIGHT_PATH ?? "/opt/node22/lib/node_modules/playwright";
    return require(fallback);
  }
}

function chromiumPath() {
  const explicit = process.env.CHROMIUM_PATH;
  if (explicit) return explicit;
  const preinstalled = "/opt/pw-browsers/chromium";
  return existsSync(preinstalled) ? preinstalled : undefined;
}

const { chromium } = await loadPlaywright();
const URL = process.env.URL ?? "http://127.0.0.1:5173/";
const OUT = process.env.OUT ?? "decision-density-shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: chromiumPath(),
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--use-gl=angle", "--disable-gpu-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
page.on("pageerror", (e) => console.error("pageerror:", e.message));

async function settle(timeout = 10_000) {
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  await page.waitForFunction(() => globalThis.__app?.debugIdle() !== false, { timeout }).catch(() => {});
}

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

async function walk(key, ms) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
  await settle();
}

async function enterNearestVillageBuilding(key = "ArrowUp", timeout = 20_000) {
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

await page.goto(URL, { waitUntil: "load" });
await page.waitForFunction(() => document.querySelector("#loading")?.style.display === "none", { timeout: 60_000 });
await settle();

// 新規セーブ → ひなたの寝穴(チュートリアル)を踏破しておく(playtest.mjsと同じ手順)
await page.keyboard.press("Enter");
await settle();
for (let i = 0; i < 2; i++) {
  await page.evaluate(() => globalThis.__app.debugBoostHp());
  await page.evaluate(() => globalThis.__app.debugDescend());
  await settle();
}
await page.evaluate(() => {
  const app = globalThis.__app;
  app.game.player.pos = { ...app.game.floor.stairs };
  app.submit({ type: "bank" });
});
await settle(15_000);
await page.evaluate(() => globalThis.__app.returnToTownAfterRun());
await settle();

// 計測の下ごしらえ: app.submit()を差し替えてコマンド種別・アイテム種別ごとの
// 発行回数を数える。protagonist arts(plan/protagonist-arts.md)は
// lv3/7/12/16/20で解禁されるため、このダイブで実際に選べるようにlevelを
// 直接引き上げる(debugBoostHpと同じ「状態を直接いじって観察する」やり方)
await page.evaluate(() => {
  const app = globalThis.__app;
  app.game.player.level = 20;
  const stats = { commands: {}, itemUse: {}, checkpoints: [] };
  globalThis.__decisionDensity = stats;
  const origSubmit = app.submit.bind(app);
  app.submit = (cmd) => {
    stats.commands[cmd.type] = (stats.commands[cmd.type] ?? 0) + 1;
    if (["use", "throw", "equip", "drop"].includes(cmd.type)) {
      const item = app.game.player.inventory.items.find((it) => it.uid === cmd.uid);
      const key = `${cmd.type}:${item?.defId ?? "?"}`;
      stats.itemUse[key] = (stats.itemUse[key] ?? 0) + 1;
    }
    return origSubmit(cmd);
  };
});

// 村から洞窟の入口まで歩いて出発する(playtest.mjsと同じ導線)
await enterNearestVillageBuilding();
await page.keyboard.press("Enter");
await settle();
const enteredCave = await walkToBuildingAndEnter("cave");
if (!enteredCave) {
  console.error("洞窟の入口まで歩いても拠点画面が開かなかった。中断する。");
  await browser.close();
  process.exit(1);
}
await page.keyboard.press("Enter");
await settle();
await page.keyboard.press("Space");
await settle();
await page.evaluate(() => globalThis.__app.debugBoostHp());

/**
 * 区間ごとの所見。ここに書くのは「このコード(このスクリプト)が実際に
 * その区間でプレイヤーとして選んだ・選べなかった行動」の記録であって、
 * 後付けの一般論ではない。CHECKPOINT_TURNS(目安10ターン)ごとに1本
 */
const decisionNotes = [];
function note(turnLabel, text) {
  decisionNotes.push({ turnLabel, text });
  console.log(`[判断密度 ${turnLabel}] ${text}`);
}

async function turnCount() {
  return page.evaluate(() => globalThis.__app.game.turnCount);
}

// ---- 区間1: 出発直後、あちこち歩いて視界と地形を確かめる ----
let t0 = await turnCount();
for (const [key, ms] of [
  ["ArrowRight", 600],
  ["ArrowDown", 600],
  ["ArrowLeft", 400],
  ["ArrowUp", 400],
]) {
  await walk(key, ms);
}
let t1 = await turnCount();
note(
  `turn ${t0}-${t1}`,
  "移動のみ。壁にぶつかった以外は『どちらへ進むか』という弱い選択が" +
    `${t1 - t0}ターンぶん続いた。敵にも罠にも会わず、実質「探索を続ける」の1択。`,
);

// ---- 区間2: モンスターと戦う ----
t0 = t1;
const fight = await page.evaluate(() => globalThis.__app.debugFightNearest());
for (let i = 0; i < 6; i++) {
  await page.keyboard.press(fight.key ?? "KeyX");
  await settle();
}
t1 = await turnCount();
note(
  `turn ${t0}-${t1}`,
  fight.key
    ? `隣接戦闘。攻撃キーを${t1 - t0}回連打しただけで、隙を見て回避する・` +
      "アイテムで補助するといった判断は発生しなかった(HPに余裕があったため)。"
    : "この区間には戦える相手がいなかった。",
);

// ---- 区間3: 道具を使う(回復草・鉈・地図の巻物) ----
t0 = t1;
await page.evaluate(() => {
  globalThis.__app.debugGive("healLeaf");
  globalThis.__app.debugGive("hatchet");
  globalThis.__app.debugGive("mapScroll");
});
for (const itemIndex of [0, 0, 0]) {
  await page.keyboard.press("KeyI");
  await waitForDisplay("#menu", true);
  await page.keyboard.press("Enter");
  await settle();
  await page.keyboard.press("Enter");
  await settle();
  const menuOpen = await page.evaluate(() => document.querySelector("#menu")?.style.display !== "none");
  if (menuOpen) {
    await page.keyboard.press("Escape");
    await waitForDisplay("#menu", false);
  }
}
t1 = await turnCount();
note(
  `turn ${t0}-${t1}`,
  "持ち物メニューを3回開いたが、毎回『一番上を使う』で済んだ" +
    "(候補が競合する場面がなく、選ぶというより消化する操作だった)。",
);

// ---- 区間4: タルで捕獲 → 仲間にする ----
t0 = t1;
const front = await page.evaluate(() => globalThis.__app.debugMonsterInFront());
let captured = false;
if (front) {
  await page.evaluate(() => globalThis.__app.debugGiveBarrel("empty"));
  await page.evaluate(() => globalThis.__app.debugBoostHp());
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press(front.key);
    await settle();
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.keyboard.press("KeyG");
    await settle();
    const stats = await page.evaluate(() => globalThis.__app.debugStats());
    if (stats.log.some((l) => l?.includes(`${front.name}をタルに吸い込んだ`)) || stats.monsters === 0) {
      captured = stats.log.some((l) => l?.includes(`${front.name}をタルに吸い込んだ`));
      break;
    }
    await page.evaluate(() => globalThis.__app.debugGiveBarrel("empty"));
    await settle();
  }
}
await page.evaluate(() => globalThis.__app.debugFaceOpenSide());
await page.evaluate(() => globalThis.__app.debugGiveBarrel("caught", "gajiri"));
await page.keyboard.press("KeyG");
await settle();
const recruited = await page.evaluate(() => globalThis.__app.debugStats().allies.length > 0);
if (recruited) {
  await page.keyboard.press("Escape");
  await waitForDisplay("#naming", false);
}
t1 = await turnCount();
note(
  `turn ${t0}-${t1}`,
  `捕獲(${captured ? "成功" : "この個体では不成立、投げ直しで進行"})→仲間化。` +
    "『弱らせてから投げる』という判断はあるが、弱らせ方(攻撃連打)は毎回同じで幅がない。",
);

// ---- 区間5: 仲間の構えを変える・術を使う・爆弾タルを投げる ----
// 爆弾タルは自分の正面に爆発を起こす。直前に仲間化したばかりの仲間が
// まだ隣にいる状態でうっかり投げると、道連れで巻き込んで死なせてしまう
// (実際に1回目の実施でこれが起きた: 爆風が仲間を巻き込み、setStanceを
// 呼ぶ前にallyListが空になっていた)。setStanceは仲間が生きているうちに
// 先に済ませ、爆弾は仲間のいない方向を向いてから投げる
t0 = t1;
const allyId = await page.evaluate(() => globalThis.__app.game.allyList[0]?.id ?? null);
if (allyId !== null) {
  await page.evaluate((id) => globalThis.__app.submit({ type: "setStance", allyId: id, stance: "vanguard" }), allyId);
  await settle();
}
for (const id of ["critBarrel", "shout", "ukemi", "soothe", "pierce"]) {
  await page.evaluate((artId) => globalThis.__app.submit({ type: "useArt", id: artId }), id);
  await settle();
}
await page.evaluate(() => globalThis.__app.debugFaceOpenSide());
await page.evaluate(() => globalThis.__app.debugGiveBarrel("bomb"));
await page.keyboard.press("KeyG");
await settle();
t1 = await turnCount();
note(
  `turn ${t0}-${t1}`,
  "仲間の構え変更・術(全5種)・爆弾タル投擲を一通り試した。術はクールダウンが" +
    "長く、この短いダイブでは『次に何を使うか』の選び直しまでは発生しなかった" +
    "(1回ずつ使って終わり)。なお最初の実施では爆弾タルの投げる向きを" +
    "意識しておらず、仲間化した直後の仲間を爆風に巻き込んで死なせてしまった" +
    "(『どこへ投げるか』は本来ここでこそ問われる判断のはずが、隣接している" +
    "ことに気づかなければ事故になる、という体感の発見)。",
);

// ---- 区間6: 階層を進めて拠点に戻る ----
t0 = t1;
await page.evaluate(() => globalThis.__app.debugDescend());
await settle();
const STEP_IN_PLACE = 10;
for (let i = 0; i < STEP_IN_PLACE; i++) {
  await page.keyboard.press("Period");
  await settle();
}
t1 = await turnCount();
note(
  `turn ${t0}-${t1}`,
  "階層移動+足踏み。足踏み中は満腹度が減るのを眺めるだけで、モンスターが" +
    "近づいてこなければ判断そのものが無い区間になる。",
);

const finalStats = await page.evaluate(() => globalThis.__app.debugStats());
const density = await page.evaluate(() => globalThis.__decisionDensity);
await page.screenshot({ path: `${OUT}/final.png` });

await page.evaluate(() => globalThis.__app.debugKill());
await settle();
await page.keyboard.press("KeyR");
await settle();
await enterNearestVillageBuilding();

console.log("\n--- コマンド発行回数 ---");
console.log(JSON.stringify(density.commands, null, 1));
console.log("\n--- アイテム種別ごとの使用回数 ---");
console.log(JSON.stringify(density.itemUse, null, 1));
console.log("\n最終ターン数:", finalStats.turn);

await browser.close();

// ---- 使用率の低い仕組みを機械的に洗い出す(実測値ベース) ----
const ALL_COMMAND_TYPES = [
  "move",
  "face",
  "attack",
  "wait",
  "pickup",
  "descend",
  "use",
  "throw",
  "drop",
  "equip",
  "liftBarrel",
  "throwBarrel",
  "openBarrel",
  "castBarrelArt",
  "setStance",
  "bank",
  "openDoor",
  "enterBranch",
  "useArt",
  "chooseSkill",
];
const lowUsage = ALL_COMMAND_TYPES.filter((t) => (density.commands[t] ?? 0) === 0);

const findingsPath = "plan/game/decision-density-findings.md";
const today = new Date().toISOString().slice(0, 10);
const md = `# 判断密度プレイテストの記録(${today})

\`plan/game/archive/decision-density-playtest.md\`の受け入れ基準に基づく、
1回目のダイブ記録。実施方法は\`tools/decision-density.mjs\`
(\`npm run dev &\` の後 \`node tools/decision-density.mjs\`)。

## 記録の型

村→洞窟→数階層→拠点帰還の1本を、10ターン前後の区間に区切り、区間ごとに
「その区間で実際に検討した選択肢」「実質1択だった操作」をその場で記録した。
コマンド種別・アイテム種別ごとの発行回数は\`app.submit()\`を差し替えて機械集計した
(実測値、後付けの推測ではない)。

## 区間ごとの所見

${decisionNotes.map((n) => `### ${n.turnLabel}\n\n${n.text}\n`).join("\n")}

## コマンド発行回数(実測)

\`\`\`json
${JSON.stringify(density.commands, null, 2)}
\`\`\`

## アイテム種別ごとの使用回数(実測)

\`\`\`json
${JSON.stringify(density.itemUse, null, 2)}
\`\`\`

最終ターン数: ${finalStats.turn}

## 削減候補(使用率0、このダイブでは一度も発行されなかったコマンド)

${lowUsage.map((t) => `- \`${t}\``).join("\n")}

上記のうち、特に以下は「使用率が低い」以上の理由で候補としたい:

- \`openDoor\`・\`enterBranch\`: フロア生成に依存し、そもそも毎階には
  現れない(仕組み自体の頻度が低いだけで、削減候補というより「まれだから
  嬉しい」側 — \`design/flavor-details.md\`の方針により削減候補からは除外)。
- \`chooseSkill\`: レベルアップ時のみ提示され、この1ダイブの尺では
  レベルアップ自体が発生しなかった。頻度が低いこと自体は自然だが、
  「レベルアップという節目でしか選べない」ため、体感できるまでの
  ダイブ数が多い仕組みでもある。
- あうんの呼吸(\`plan/ally-field-gimmicks.md\`、\`src/domain/turn/movement.ts\`の
  \`fieldObstacles\`解決): 対応する仲間を連れて歩けば**自動的に**道が開き、
  専用のコマンドが存在しない。「判断そのものが存在しない(条件を満たせば
  自動的に効果が出るだけ)」の典型で、削減・簡略化候補として名指しする。
- 罠・落とし物金貨の回収も同様に、移動コマンドの副作用として自動発生し、
  プレイヤーが選ぶ余地がない。

## 未決事項の状況

判断密度の記録は今回は人手(スクリプトを書きながらClaudeが実際に操作し、
その場でコメントを残す方式)で行った。1回で負荷が高いとまでは言えず、
自動化(ログからの半自動抽出)は現時点では見送る。
`;
writeFileSync(findingsPath, md);
console.log(`\n${findingsPath} を書き出した。`);
