import type { Page } from "playwright";
import type { TestFloorInjection } from "../../src/application/dungeonRun/game";

/**
 * 箱庭ダンジョン(plan/game/test-dungeon-harness.md)のE2Eテストが共通で使う、
 * 「本物のUIを本物の入力で操作する」ための小さな道具。
 *
 * ステップの1コマ ≒ 1フレームぶんの猶予を置きながら進める点は
 * tools/playtest.mjs の settle() と同じ考え方(遅い環境でも取りこぼさない)。
 * ここでは箱庭注入直後の1シーンだけを相手にするぶん、待ち時間は短めにしてある
 */

/**
 * window.__testHarness.startInjectedRun が実際に受け取る形
 * (src/main.tsのInjectedRunPayloadと同じ)。`rng`だけTestFloorInjection
 * そのもの(Rngインスタンス)ではなくこの簡易仕様にしてある: Playwrightの
 * page.evaluateはNode↔ブラウザの境界を挟むため、渡すRngインスタンスは
 * プロトタイプ(メソッド)を失ってしまう。ブラウザ側(main.ts)がこの仕様から
 * Rngを組み立て直す。同じ形をsrc/main.tsからimportできない(tests/はimport
 * してよいがsrc/はtests/をimportしない、tests/architecture.test.tsの
 * 受け入れ基準4)ため、ここに同じ形を独立して持つ
 */
export interface SerializableRngSpec {
  kind: "seeded" | "enumerated";
  seed?: number;
  values?: number[];
}
export type InjectedRunPayload = Omit<TestFloorInjection, "rng"> & { rng?: SerializableRngSpec };

export async function waitForLoaded(page: Page): Promise<void> {
  await page.waitForFunction(
    () => (document.querySelector("#loading") as HTMLElement | null)?.style.display === "none",
    undefined,
    { timeout: 60_000 },
  );
}

/** 直前の操作が処理され、アニメーションが落ち着くまで待つ(tools/playtest.mjsのsettle()と同じ考え方) */
export async function settle(page: Page, timeout = 10_000): Promise<void> {
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  await page
    .waitForFunction(() => (globalThis as { __app?: { debugIdle?: () => boolean } }).__app?.debugIdle?.() !== false, {
      timeout,
    })
    .catch(() => {});
}

/**
 * ASCIIマップから組んだフロアを注入してダイブを開始する。テストモードの
 * devサーバー(tests/harness/server.ts)でだけ生えるwindow.__testHarnessを使う
 */
export async function startInjectedRun(page: Page, payload: InjectedRunPayload): Promise<void> {
  await page.evaluate((p: InjectedRunPayload) => {
    (
      globalThis as unknown as { __testHarness: { startInjectedRun: (payload: InjectedRunPayload) => void } }
    ).__testHarness.startInjectedRun(p);
  }, payload);
  await settle(page);
}

/**
 * 仮想パッド(#touchPad)を実際にドラッグする(plan/touch-controls.md)。
 * `dx`/`dy`は見た目どおり(画面上で右に倒したいなら`dx>0`)で指定する。
 * DASH_HOLD_THRESHOLD(0.25秒)未満で離せば、押した瞬間の1回ぶんだけ
 * 移動コマンドが発行される(src/view/input.ts の consumeTapMove())ので、
 * holdMsは既定で短くしてタップ相当(1マスだけ進む)にしてある
 */
export async function dragTouchPad(page: Page, dx: number, dy: number, holdMs = 60): Promise<void> {
  const pad = page.locator("#touchPad");
  const box = await pad.boundingBox();
  if (!box) throw new Error("dragTouchPad: #touchPad が見つからない");
  const originX = box.x + box.width / 2;
  const originY = box.y + box.height / 2;

  // 強制横向き(plan/game/archive/forced-landscape.md、src/entities/orientation.ts):
  // タッチ端末の縦持ちでは画面をCSSで90度回転させて表示し、アプリ側が
  // 生のポインタ座標を(dx,dy)->(dy,-dx)で補正してから方向判定する。
  // ここで送る座標は「回転前の生の画面座標」なので、狙った見た目どおりの
  // 方向になるよう先に逆変換((dx,dy)->(-dy,dx))しておく
  const forcedLandscape = await page.evaluate(() => document.body.classList.contains("forced-landscape"));
  const [rawDx, rawDy] = forcedLandscape ? [-dy, dx] : [dx, dy];

  await pad.dispatchEvent("pointerdown", {
    pointerId: 1,
    pointerType: "touch",
    clientX: originX,
    clientY: originY,
    button: 0,
  });
  await pad.dispatchEvent("pointermove", {
    pointerId: 1,
    pointerType: "touch",
    clientX: originX + rawDx,
    clientY: originY + rawDy,
    button: 0,
  });
  // consumeTapMove()が拾えるよう、押している間に最低1フレームは進める
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  await page.waitForTimeout(holdMs);
  await pad.dispatchEvent("pointerup", {
    pointerId: 1,
    pointerType: "touch",
    clientX: originX + rawDx,
    clientY: originY + rawDy,
    button: 0,
  });
  await settle(page);
}

/** アクションボタン(攻撃・タル・投げる 等、src/ui/touch-controls.tsの.touch-btn)を実際にタップする */
export async function tapActionButton(page: Page, dataCode: string): Promise<void> {
  await page.locator(`.touch-btn[data-code="${dataCode}"]`).click();
  await settle(page);
}
