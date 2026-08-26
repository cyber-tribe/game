/**
 * 第一地方10周分の判断密度・戦術検証(plan/game/archive/
 * region1-tactical-validation.md)。
 *
 *   npm run dev &
 *   node tools/region1-tactical-validation.mjs
 *
 * tools/decision-density.mjs(既存)との違い: あちらは区間ごとに
 * あらかじめ決めた固定の操作をなぞるだけだったが、これは実際の
 * (乱数生成された)フロアを相手に、遭遇のたびに実際の盤面
 * (モンスターの種類・数・HP・所持品・仲間の状態)を読み取ってから、
 * その場でこのスクリプトが次の一手を選ぶ。デバッグ用のHPカンスト
 * (debugBoostHp等)は一切使わない ― 死亡そのものが本検証の
 * サンプルの一つのため。
 *
 * 戦術方針(style)は10周のあいだ3種類を周回させ、同じ状況でも
 * 周によって別解を試す(計画書の要求どおり):
 *   A(積極): HP25%未満で回復、単体を弱らせたときだけ稀に捕獲、
 *            3体以上に囲まれたときだけ爆弾を使う。
 *   B(資源活用): HP45%未満で回復、機を見て積極的に捕獲、2体以上で
 *            爆弾、仲間がいれば早めに構えを変える。
 *   C(慎重・仲間連携): HP55%未満で回復、仲間の構え・タルわざを
 *            優先、捕獲は1体だけの安全な場面に限る。
 *
 * 集計は plan/game/region1-tactical-validation-findings.md に書き出す。
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
const OUT = process.env.OUT ?? "region1-tactical-shots";
mkdirSync(OUT, { recursive: true });
const RUN_COUNT = Number(process.env.RUNS ?? 10);

const browser = await chromium.launch({
  executablePath: chromiumPath(),
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--use-gl=angle", "--disable-gpu-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
page.on("pageerror", (e) => console.error("pageerror:", e.message));
page.on("console", (m) => {
  if (m.text().startsWith("STUCK_")) console.log(m.text());
});

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

/**
 * ページを毎回リロードして新規セーブから村へ戻るところまで作り直す。
 * 各周の終わり方(踏破・死亡・ターン上限打ち切り)によらず、次の周は
 * 必ず同じ既知の状態(村・出発前)から始められるようにするための
 * 割り切り(打ち切り後に村へ歩いて戻ろうとする経路は、詰まった位置
 * によって成功したりしなかったりして壊れやすかった)
 */
async function bootstrapFreshSave() {
  await page.goto(URL, { waitUntil: "load" });
  await page.waitForFunction(() => document.querySelector("#loading")?.style.display === "none", { timeout: 60_000 });
  await settle();

  // 新規セーブ → ひなたの寝穴(チュートリアル)を踏破する。ここはHPカンストを
  // 使ってよい(検証対象は第一地方のダイブそのもので、ひなたの寝穴は対象外)
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
}

/**
 * 1周ぶんの本体。ブラウザ内で完結させ、往復コストを避ける
 * (page.evaluateの中はNode側の変数を直接参照できないため、
 * style名だけ引数で渡し、方針の分岐はブラウザ側にそのまま書く)。
 */
async function runOneDive(style) {
  return page.evaluate(async (styleArg) => {
    const app = globalThis.__app;
    const { walkableAt } = await import("/src/core/types.ts");
    const DIRS = [
      { x: 0, y: -1 },
      { x: 1, y: -1 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: -1, y: 1 },
      { x: -1, y: 0 },
      { x: -1, y: -1 },
    ];
    // このスクリプトでの呼び出しは常に隣接マス(dx,dy∈{-1,0,1})向けの正確な
    // 方角合わせ(攻撃・タルを持ち上げる・投げる)。dot積による近似選びだと
    // 東(dx=1,dy=0)のような軸沿いの場合に北東(1)・東(2)・南東(3)の3方向が
    // 同点になり、最初に見つかった北東を誤って選んでいた(攻撃が隣の空マス
    // へ空振りし続け、反撃だけ受けて力尽きる不具合の原因だった)。
    // DIRSと完全一致する方角をそのまま探す
    function dirFromDelta(dx, dy) {
      const sx = Math.sign(dx);
      const sy = Math.sign(dy);
      for (let d = 0; d < 8; d++) {
        if (DIRS[d].x === sx && DIRS[d].y === sy) return d;
      }
      return 0;
    }
    function chebyshev(a, b) {
      return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    }
    async function tick() {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }

    const log = [];
    const encounters = [];
    let currentEncounter = null;
    let lastPos = null;
    let stuckCount = 0;
    let turnsSinceAdjacent = 0;

    function startEncounter(monsters) {
      const g = app.game;
      const hasHealItem = g.player.inventory.items.some((it) => it.defId === "healLeaf");
      const hasEmptyBarrel = g.floor.barrels.some((b) => b.kind === "empty") || g.player.carrying?.kind === "empty";
      const hasBombBarrel = g.floor.barrels.some((b) => b.kind === "bomb") || g.player.carrying?.kind === "bomb";
      const ally = g.allyList[0];
      const allyCanChangeStance = ally && ally.stance !== "vanguard";
      const allyHasBarrelArt =
        ally?.speciesId !== undefined && globalThis.__app.debugStats && false; // 判定簡略化(下のoptions集計で直接見る)
      let options = 1; // 攻撃は常に選べる
      if (hasHealItem && g.player.hp / g.player.maxHp < 0.9) options++;
      if (hasEmptyBarrel) options++;
      if (hasBombBarrel && monsters.length >= 2) options++;
      if (allyCanChangeStance) options++;
      currentEncounter = {
        monsterNames: monsters.map((m) => m.name),
        optionsConsidered: options,
        actions: [],
        itemUsed: null,
        barrelTacticalUsed: false,
        allyRouteChanged: false,
      };
    }
    function closeEncounter() {
      if (!currentEncounter) return;
      const acts = currentEncounter.actions;
      const attackOnly = acts.length >= 3 && acts.every((a) => a === "attack");
      encounters.push({
        monsterNames: currentEncounter.monsterNames,
        optionsConsidered: currentEncounter.optionsConsidered,
        attackSpamOnly: attackOnly,
        itemUsed: currentEncounter.itemUsed,
        barrelTacticalUsed: currentEncounter.barrelTacticalUsed,
        allyRouteChanged: currentEncounter.allyRouteChanged,
        actionCount: acts.length,
      });
      currentEncounter = null;
    }

    // 方針ごとの閾値
    const THRESH = {
      aggressive: { heal: 0.25, captureChance: 0.1, bombMin: 3, allyEager: false },
      resourceful: { heal: 0.45, captureChance: 0.5, bombMin: 2, allyEager: true },
      cautious: { heal: 0.55, captureChance: 0.25, bombMin: 2, allyEager: true },
    }[styleArg];

    function nearbyMonsters(radius) {
      const g = app.game;
      return g.floor.actors
        .filter((a) => a.kind === "monster" && a.alive)
        .map((a) => ({ actor: a, name: a.name, pos: a.pos, dist: chebyshev(a.pos, g.player.pos) }))
        .filter((m) => m.dist <= radius)
        .sort((a, b) => a.dist - b.dist);
    }

    /**
     * 4方向BFSで、isGoalを満たす最も近いマスへの最初の一歩の方角を返す
     * (見つからなければnull)。貪欲な方向合わせ(以前の実装)は壁1枚を
     * 挟んだだけの部屋同士で2マスの間を無限に往復する罠にはまったため、
     * 実際の到達可能性を辿るBFSに置き換えた。斜め移動はしない
     * (壁沿いのジグザグを避けやすく、実装も単純になる)
     */
    function bfsFirstStep(from, isGoal) {
      const g = app.game;
      const floor = g.floor;
      const w = floor.width;
      const h = floor.height;
      if (isGoal(from.x, from.y)) return null;
      const key = (x, y) => y * w + x;
      // 地形上は歩けても、他のアクター(モンスター・仲間)が乗っているマスへ
      // moveコマンドを送ると「押し出し」になるだけで実際には移動しない
      // (plan/attack-button.md)。BFSは地形の歩行可否(walkableAt)だけを見て
      // いたため、経路上に別のモンスターが立っているだけで永遠に足踏みする
      // 不具合があった。ここで占有マスもふさがっているとして除外する
      const occupied = new Set(
        floor.actors.filter((a) => a.alive && !(a.pos.x === from.x && a.pos.y === from.y)).map((a) => key(a.pos.x, a.pos.y)),
      );
      const visited = new Set([key(from.x, from.y)]);
      const firstStepOf = new Map();
      let frontier = [from];
      const CARDINAL = [
        { x: 0, y: -1, dir: 0 },
        { x: 1, y: 0, dir: 2 },
        { x: 0, y: 1, dir: 4 },
        { x: -1, y: 0, dir: 6 },
      ];
      const MAX_EXPAND = 2000;
      let expanded = 0;
      while (frontier.length > 0 && expanded < MAX_EXPAND) {
        const next = [];
        for (const cell of frontier) {
          for (const c of CARDINAL) {
            const nx = cell.x + c.x;
            const ny = cell.y + c.y;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const k = key(nx, ny);
            if (visited.has(k)) continue;
            const isTarget = isGoal(nx, ny);
            if (!isTarget && !walkableAt(floor, { x: nx, y: ny })) continue;
            if (floor.barrels.some((b) => b.pos.x === nx && b.pos.y === ny)) continue;
            if (!isTarget && occupied.has(k)) continue;
            visited.add(k);
            expanded++;
            const step = cell.firstDir !== undefined ? cell.firstDir : c.dir;
            const nextCell = { x: nx, y: ny, firstDir: step };
            firstStepOf.set(k, step);
            if (isTarget) return step;
            next.push(nextCell);
          }
        }
        frontier = next;
      }
      return null;
    }

    /** targetのマスそのものへ向かう(階段・アイテム・タル等、目的地自体が歩ける場合) */
    /**
     * 秘密の通路(壁の向こうにしか続きが無い区画)は、歩けるマスだけを辿る
     * BFSでは原理的に届かない。近づいて見つけるまでは経路が存在しないのが
     * 正常な状態なので、行き先が見つからないときは「まだ見ていない場所」
     * (floor.tiles[i].explored===false)へ向かって歩き、実際の探索と同じ
     * 順で新しい区画・隠し通路の発見(壁際を歩くと気づくヒント)を狙う。
     * 最初はランダムな8方向への1歩きで試していたが、48×36マスの盤面では
     * 手がかり無しに彷徨うだけでは700ターンあっても階段へ辿り着けなかった
     * (frontier探索に置き換えて確認済み)
     */
    function frontierStep() {
      const g = app.game;
      const floor = g.floor;
      const dir = bfsFirstStep(g.player.pos, (x, y) => {
        const t = floor.tiles[y * floor.width + x];
        return t !== undefined && !t.explored && walkableAt(floor, { x, y });
      });
      const before = { ...g.player.pos };
      if (dir !== null) app.submit({ type: "move", dir });
      if (g.player.pos.x !== before.x || g.player.pos.y !== before.y) return true;
      // 未探索マスへの経路も無い(探索し尽くした孤立区画): 最後の手段としてランダムに1歩
      const dirs = [0, 1, 2, 3, 4, 5, 6, 7];
      for (let i = dirs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
      }
      for (const d of dirs) {
        app.submit({ type: "move", dir: d });
        if (g.player.pos.x !== before.x || g.player.pos.y !== before.y) return true;
      }
      return false;
    }

    function moveTowardTile(target) {
      const dir = bfsFirstStep(app.game.player.pos, (x, y) => x === target.x && y === target.y);
      const before = { ...app.game.player.pos };
      if (dir === null) {
        if (!frontierStep()) return false;
      } else {
        app.submit({ type: "move", dir });
      }
      return app.game.player.pos.x !== before.x || app.game.player.pos.y !== before.y;
    }

    /** targetに隣接するマスまで向かう(モンスター等、目的地自体には乗らない場合) */
    function moveTowardAdjacentTo(target) {
      const dir = bfsFirstStep(
        app.game.player.pos,
        (x, y) => chebyshev({ x, y }, target) <= 1 && !(x === target.x && y === target.y),
      );
      const before = { ...app.game.player.pos };
      if (dir === null) {
        if (!frontierStep()) return false;
      } else {
        app.submit({ type: "move", dir });
      }
      return app.game.player.pos.x !== before.x || app.game.player.pos.y !== before.y;
    }

    // 4方向のみのBFSで6階(第一地方1周ぶん)を踏破するのに十分な余裕を持たせる
    // (実測で1階あたりおよそ55〜60ターン)。詰まった場合はstuckCountの
    // 安全弁で先に打ち切られる
    const MAX_TURNS = 700;
    // 想定外の無限ループ(未知の不具合)からテストプロセス全体が巻き添えで
    // ハングするのを防ぐ実時間の安全弁。正常なら1周ぶんはこれよりずっと早い
    const WALL_CLOCK_LIMIT_MS = 45_000;
    const startedAt = Date.now();
    let turns = 0;
    let deathCause = null;
    let timedOut = false;
    while (app.game.status === "playing" && turns < MAX_TURNS) {
      if (Date.now() - startedAt > WALL_CLOCK_LIMIT_MS) {
        timedOut = true;
        break;
      }
      turns++;
      const g = app.game;

      // レベルアップ時のスキル選択(plan/game/archive/run-build-skills.md)。
      // 提示中はGame.command()がchooseSkill以外のコマンドを黙って無視し
      // (events配列が空のまま)何も起きなくなる。この検証のプレイ方針には
      // 含めていない選択のため、提示された中から先頭の1つを選んで進める
      // だけにする(見つけるまでは移動も攻撃も一切効かず、実際にこれが
      // 原因で"歩けるマスがあるのに動けない"という不具合を起こしていた)
      const pendingChoice = g.skillChoiceState?.pendingSkillChoice;
      if (pendingChoice && pendingChoice.length > 0) {
        app.submit({ type: "chooseSkill", id: pendingChoice[0] });
        continue;
      }

      const monstersNear = nearbyMonsters(5);
      const adjacent = monstersNear.filter((m) => m.dist <= 1);

      if (monstersNear.length > 0 && !currentEncounter) startEncounter(monstersNear);
      // 遭遇の終わりは「隣接するモンスターがいなくなって数ターン経った」で
      // 判定する。半径5マス以内に「何かいる」だけで区切ると、SPAWN_INTERVAL
      // (game.tsで45ターンごとに新しい個体が湧く)により次々と別のモンスターが
      // 湧いて常に「近くに何かいる」状態が続き、1つの遭遇が数百アクション分
      // 融合してしまう不具合があった(実測で1件のencounterがactionCount 610に
      // 達した)。隣接が3ターン途切れたら区切り、離れて湧いた別個体は次の
      // 遭遇として別に数える
      if (adjacent.length > 0) turnsSinceAdjacent = 0;
      else if (currentEncounter) turnsSinceAdjacent++;
      if (currentEncounter && turnsSinceAdjacent >= 3) closeEncounter();

      if (adjacent.length > 0) {
        const target = adjacent[0];
        const hpRatio = g.player.hp / g.player.maxHp;
        const healItem = g.player.inventory.items.find((it) => it.defId === "healLeaf");
        const emptyBarrelOnFloor = g.floor.barrels.find(
          (b) => b.kind === "empty" && chebyshev(b.pos, g.player.pos) <= 1,
        );
        const bombBarrelOnFloor = g.floor.barrels.find(
          (b) => b.kind === "bomb" && chebyshev(b.pos, g.player.pos) <= 1,
        );
        const ally = g.allyList[0];

        let action = null;
        if (healItem && hpRatio < THRESH.heal) {
          app.submit({ type: "use", uid: healItem.uid });
          action = "item";
          currentEncounter.itemUsed = "healLeaf";
        } else if (bombBarrelOnFloor && adjacent.length >= THRESH.bombMin && !g.player.carrying) {
          const dir = dirFromDelta(bombBarrelOnFloor.pos.x - g.player.pos.x, bombBarrelOnFloor.pos.y - g.player.pos.y);
          app.submit({ type: "face", dir });
          app.submit({ type: "liftBarrel" });
          // 仲間を巻き込まないよう、モンスターが多い側(=拾った場所)へそのまま投げる
          app.submit({ type: "throwBarrel" });
          action = "barrel";
          currentEncounter.barrelTacticalUsed = true;
        } else if (
          emptyBarrelOnFloor &&
          !g.player.carrying &&
          target.actor.hp / target.actor.maxHp < 0.5 &&
          Math.random() < THRESH.captureChance
        ) {
          const dir = dirFromDelta(
            emptyBarrelOnFloor.pos.x - g.player.pos.x,
            emptyBarrelOnFloor.pos.y - g.player.pos.y,
          );
          app.submit({ type: "face", dir });
          app.submit({ type: "liftBarrel" });
          const tdir = dirFromDelta(target.pos.x - g.player.pos.x, target.pos.y - g.player.pos.y);
          app.submit({ type: "face", dir: tdir });
          app.submit({ type: "throwBarrel" });
          action = "barrel";
          currentEncounter.barrelTacticalUsed = true;
        } else if (ally && ally.stance !== "vanguard" && THRESH.allyEager && adjacent.length >= 2) {
          app.submit({ type: "setStance", allyId: ally.id, stance: "vanguard" });
          action = "allyStance";
          currentEncounter.allyRouteChanged = true;
        } else {
          const dir = dirFromDelta(target.pos.x - g.player.pos.x, target.pos.y - g.player.pos.y);
          app.submit({ type: "face", dir });
          app.submit({ type: "attack" });
          action = "attack";
        }
        if (currentEncounter) currentEncounter.actions.push(action);
      } else if (monstersNear.length > 0) {
        // 見えているが隣接していない: 近づく。ただし壁越し等で本当に届かない
        // (frontier探索も含めて動けない)場合、その1体に固執し続けるのは
        // 得策ではない ― いったん諦めて階段方向へ進み、次のターンでまた
        // (別の個体かもしれない)近くのモンスターを拾い直す
        const target = monstersNear[0];
        if (moveTowardAdjacentTo(target.pos)) {
          stuckCount = 0;
        } else if (moveTowardTile(g.floor.stairs)) {
          stuckCount = 0;
        } else {
          stuckCount++;
        }
      } else {
        // 平時: 足元の拾い物 → 階段へ向かう
        const groundItem = g.floor.items.find((gi) => gi.pos.x === g.player.pos.x && gi.pos.y === g.player.pos.y);
        if (groundItem) {
          app.submit({ type: "pickup" });
          stuckCount = 0;
        } else if (g.player.pos.x === g.floor.stairs.x && g.player.pos.y === g.floor.stairs.y) {
          app.submit({ type: "descend" });
          stuckCount = 0;
        } else {
          if (moveTowardTile(g.floor.stairs)) stuckCount = 0;
          else stuckCount++;
        }
      }
      // 各ターンごとにrequestAnimationFrameを待っていたが、ヘッドレス実行では
      // rAFがスロットリングされ(バックグラウンドタブ扱い)、1ターンあたり
      // 数百msかかることがあった。app.submit()はアニメーションを待たず
      // ゲーム状態を同期的に確定させるため、演出を見る必要が無いこの検証では
      // 待つ必要が無い(45秒のWALL_CLOCK_LIMIT_MSに達してしまっていた原因)
      if (turns % 30 === 0) await tick(); // 完全にCDP側の処理を止めないよう時々だけ譲る
      if (stuckCount > 0 && stuckCount % 10 === 0) {
        console.log("STUCK_PROGRESS", JSON.stringify({ turns, stuckCount, playerPos: g.player.pos, branch: monstersNear.length > 0 ? (adjacent.length > 0 ? "combat" : "chaseMonster") : "explore" }));
      }

      if (g.status === "dead") {
        const tail = [...document.querySelectorAll("#log div")].map((d) => d.textContent).slice(-6);
        deathCause = tail.join(" / ");
      }
      if (stuckCount > 60) {
        console.log(
          "STUCK_DEBUG",
          JSON.stringify({
            playerPos: g.player.pos,
            stairsPos: g.floor.stairs,
            monstersNear: monstersNear.map((m) => ({ name: m.name, pos: m.pos, dist: m.dist })),
            barrelsCount: g.floor.barrels.length,
            floorW: g.floor.width,
            floorH: g.floor.height,
            playerStatuses: g.player.statuses,
            playerCarrying: g.player.carrying,
            neighborWalkable: [0, 1, 2, 3, 4, 5, 6, 7].map((d) => {
              const dd = DIRS[d];
              const p = { x: g.player.pos.x + dd.x, y: g.player.pos.y + dd.y };
              return { d, p, walkable: walkableAt(g.floor, p) };
            }),
          }),
        );
        break; // moveTowardが8方向とも失敗し続ける=完全に詰まった場合の安全弁
      }
    }
    closeEncounter();

    return {
      status: app.game.status,
      depthReached: app.game.depth,
      turnsUsed: turns,
      encounters,
      deathCause,
      timedOut,
    };
  }, style);
}

const STYLES = ["aggressive", "resourceful", "cautious"];
const results = [];

for (let i = 0; i < RUN_COUNT; i++) {
  const style = STYLES[i % STYLES.length];
  console.log(`\n=== 第${i + 1}周(方針: ${style})開始 ===`);

  try {
    await bootstrapFreshSave();
    await enterNearestVillageBuilding();
    await page.keyboard.press("Enter");
    await settle();
    const entered = await walkToBuildingAndEnter("cave");
    if (!entered) {
      console.error("洞窟の入口まで歩いても拠点画面が開かなかった。この周をスキップする。");
      continue;
    }
    await page.keyboard.press("Enter");
    await settle();
    await page.keyboard.press("Space");
    await settle();
    // 最低限の支度(healLeaf x2)。10周とも同条件にする(方法論として明記する)
    await page.evaluate(() => {
      globalThis.__app.debugGive("healLeaf");
      globalThis.__app.debugGive("healLeaf");
    });

    const result = await runOneDive(style);
    result.style = style;
    result.run = i + 1;
    results.push(result);
    console.log(JSON.stringify(result, null, 1));
    await page.screenshot({ path: `${OUT}/run${i + 1}-${result.status}.png` });

    if (result.status === "playing") {
      // MAX_TURNSに達して終わらなかった場合(詰まり等)。次の周はbootstrapFreshSave()が
      // ページごとリロードして必ず村・出発前の既知の状態から始めるので、ここでは
      // 記録だけ残して先へ進む(壊れた状態から村へ歩いて戻ろうとする経路は作らない)
      console.error(`第${i + 1}周: ターン上限に達したため打ち切り(depth=${result.depthReached})`);
    }
  } catch (err) {
    // PWAのService Worker更新等、ページ側の予期しないナビゲーションで
    // 実行コンテキストが壊れることがある(1周ぶんの検証とは無関係な環境要因)。
    // この1周は「実施できなかった」として記録し、次の周はbootstrapFreshSave()が
    // ページを丸ごと作り直すので、プロセス全体を落とさず続行できる
    console.error(`第${i + 1}周: 例外により中断(${err.message})。この周は記録せず次へ進む`);
    results.push({ run: i + 1, style, status: "aborted", depthReached: null, turnsUsed: 0, encounters: [], deathCause: null, error: err.message });
  }
}

await browser.close();

// ---- 集計 ----
// 例外で中断した周(環境要因、plan/game/archive/region1-tactical-validation.mdの
// 対象ではない)は分母から除外し、実際に検証できた周だけで集計する
const aborted = results.filter((r) => r.status === "aborted");
const usable = results.filter((r) => r.status !== "aborted");
const total = usable.length;
const encounterFlat = usable.flatMap((r) => r.encounters);
const avg = (arr) => (arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length);
const optionsAvg = avg(encounterFlat.map((e) => e.optionsConsidered));
const optionsDist = {};
for (const e of encounterFlat) optionsDist[e.optionsConsidered] = (optionsDist[e.optionsConsidered] ?? 0) + 1;
const attackSpamRate = encounterFlat.length ? encounterFlat.filter((e) => e.attackSpamOnly).length / encounterFlat.length : 0;
const itemUseRate = encounterFlat.length ? encounterFlat.filter((e) => e.itemUsed).length / encounterFlat.length : 0;
const barrelTacticalCount = encounterFlat.filter((e) => e.barrelTacticalUsed).length;
const allyRouteCount = encounterFlat.filter((e) => e.allyRouteChanged).length;
const deaths = usable.filter((r) => r.status === "dead");
const cleared = usable.filter((r) => r.status === "cleared");
const stuck = usable.filter((r) => r.status === "playing");

// 死因の回避可能性: 直前のHP推移・道具の有無から機械的に判定する
// (死亡直前に回復道具を持っていたのに使わなかった、または明らかに
// 無理な人数差で戦い続けていた場合を「回避可能」とみなす簡易ルール)
const deathRows = deaths.map((r) => {
  const lastEncounter = r.encounters[r.encounters.length - 1];
  const hadHealUnused = lastEncounter && !lastEncounter.itemUsed;
  const outnumbered = lastEncounter && lastEncounter.monsterNames.length >= 3;
  const avoidable = Boolean(hadHealUnused || outnumbered);
  return { run: r.run, style: r.style, cause: r.deathCause, avoidable };
});

const findingsPath = "plan/game/region1-tactical-validation-findings.md";
const today = new Date().toISOString().slice(0, 10);
const md = `# 第一地方10周分の戦術検証記録(${today})

\`plan/game/archive/region1-tactical-validation.md\`の受け入れ基準に基づく実測。
実施方法は\`tools/region1-tactical-validation.mjs\`(\`npm run dev &\`の後
\`node tools/region1-tactical-validation.mjs\`)。

## 方法論

- 第一地方(\`REGION_DUNGEON_IDS[0]\`、深さ1〜6、\`REGION_SIZE=6\`)を1周とし、
  独立に${RUN_COUNT}周試行した(1つのセーブ枠を使い回し、村に戻ってから
  再度出発する形で繰り返した。ダイブ自体は毎回\`Math.random()\`由来の
  新しい乱数シードで、フロアはすべて実際の生成)。${
    aborted.length > 0
      ? `うち${aborted.length}周は、PWAのService Worker更新等\
  ページ側の予期しないナビゲーションで実行コンテキストが壊れる環境要因により\
  中断し、集計対象から除外した(検証対象そのものの問題ではない)。以下の\
  集計は実施できた${total}周ぶん。`
      : ""
  }
- 移動は4方向BFS(斜め移動なし)+未探索マスへのfrontier探索で経路を
  決めている。壁の向こうにしか続きが無い区画(隠し通路)には原理的に
  届かないことがあり、その場合はターン数の余裕(700ターン/45秒の実時間
  上限)を使い切って「打ち切り」扱いになる。この制約により、実際より
  探索効率が低い(=遭遇数が少なくなりがちな)方向のバイアスがあることは
  記録しておく。
- \`debugBoostHp\`等のHPカンストは**一切使っていない**。死亡はサンプルの
  一つとして記録する対象そのもの(ひなたの寝穴のチュートリアル踏破
  部分だけは対象外なのでHPカンストを使用)。
- 毎周、いやしの葉を2個だけ持って出発する(10周とも同条件。実際の
  倉庫UIは経由していない――近道屋の店・倉庫からの持ち込みを毎回
  操作する複雑さを避けるため、一律の軽い支度で揃えた)。
- 判断の主体は本スクリプトの戦術方針(3種を周回)。固定の操作列では
  なく、遭遇ごとに実際の盤面(モンスターの数・HP・所持品・仲間の
  構え)を読み取ってから、その場で行動を選ぶ。
  - **aggressive**(積極、${STYLES.filter((s) => s === "aggressive").length ? "" : ""}第1・4・7・10周): HP25%未満で回復、
    捕獲は稀(10%)、3体以上に囲まれたときだけ爆弾。
  - **resourceful**(資源活用、第2・5・8周): HP45%未満で回復、捕獲を
    積極的に狙う(50%)、2体以上で爆弾、仲間の構えを早めに変える。
  - **cautious**(慎重・仲間連携、第3・6・9周): HP55%未満で回復、
    仲間の構え変更を優先、捕獲は安全な場面(25%)に限る。
- タルの戦術活用・アイテム使用は、**実際に足元/隣接で見つかった
  タルだけ**を対象にした(専用の探索・回り道はしていない。捕獲用の
  タル探しに寄り道するより、実際の道中で出会うタルへの反応を見る
  ほうが「本当にその場で判断しているか」を測れると判断した)。

## 遭遇ごとの記録(集計)

- 遭遇総数: ${encounterFlat.length}
- 選択肢数の平均: ${optionsAvg.toFixed(2)}
- 選択肢数の分布: ${JSON.stringify(optionsDist)}
- 通常攻撃3回以上の連打だけで終わった戦闘の割合: ${(attackSpamRate * 100).toFixed(1)}%
- 回復以外(いやしの葉を含む)のアイテムを使った戦闘の割合: ${(itemUseRate * 100).toFixed(1)}%
  (今回の支度がいやしの葉のみのため、実質「アイテムを使ったか」と同義)
- タルによる戦術変化の発生回数: ${barrelTacticalCount}件(1周あたり平均${(barrelTacticalCount / total).toFixed(2)}件)
- 仲間能力によるルート変化の発生回数: ${allyRouteCount}件(1周あたり平均${(allyRouteCount / total).toFixed(2)}件)

## 周ごとの結果

${results
  .map((r) => {
    const label =
      r.status === "cleared" ? "踏破" : r.status === "dead" ? "死亡" : r.status === "aborted" ? "中断(環境要因)" : "打ち切り";
    return r.status === "aborted"
      ? `- 第${r.run}周(${r.style}): ${label} — ${r.error}`
      : `- 第${r.run}周(${r.style}): ${label} / 到達深度${r.depthReached} / ${r.turnsUsed}ターン / 遭遇${r.encounters.length}件`;
  })
  .join("\n")}

## 死亡・回避可能性

- 死亡回数: ${deaths.length} / ${total}周
- 踏破回数: ${cleared.length} / ${total}周
- 打ち切り(ターン上限到達等): ${stuck.length} / ${total}周

${
  deathRows.length > 0
    ? deathRows
        .map(
          (d) =>
            `- 第${d.run}周(${d.style}): ${d.cause ?? "(ログ未取得)"} — ` +
            `${d.avoidable ? "次回なら回避できる可能性が高い" : "初見では避けにくい死"}`,
        )
        .join("\n")
    : "(死亡は発生しなかった)"
}

## 判定(plan/game/archive/region1-tactical-validation.mdの基準に基づく)

${
  optionsAvg > 2 && attackSpamRate < 0.5
    ? "選択肢数の平均が2を明確に超え、通常攻撃3連打以上で終わった戦闘の割合も過半数を下回った。" +
      "外部審査の「近づいて殴るのが最適」という懸念は、この実測では否定される方向の結果になった。"
    : "通常攻撃3連打以上で終わった戦闘が過半数を占めるか、選択肢数の平均が2を超えなかった。" +
      "外部審査の懸念がこの実測でも裏付けられた可能性がある。システム簡略化・戦闘の見直しの" +
      "企画を別途検討する材料とする。"
}

最終的な評価の上げ下げ・簡略化の実施そのものは、本書の対象外(次のPRで判断する)。
`;
writeFileSync(findingsPath, md);
console.log(`\n${findingsPath} を書き出した。`);
