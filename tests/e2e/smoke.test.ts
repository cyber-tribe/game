import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { launchMobileBrowser } from "../harness/browser";
import { startTestServer, type TestServer } from "../harness/server";

/**
 * 箱庭ダンジョン(plan/game/test-dungeon-harness.md)のE2E基盤そのものの疎通確認。
 * ASCIIマップを注入して実際に遊ぶ3本(移動・戦闘・捕獲)は後続PRで追加する
 */
describe("箱庭E2E基盤の疎通", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it("mode: testのdevサーバーで、注入フックがwindowに生え、スマホ相当のプリセットで開く", async () => {
    const { browser, context } = await launchMobileBrowser();
    try {
      const page = await context.newPage();
      await page.goto(server.url, { waitUntil: "load" });
      await page.waitForFunction(
        () => (document.querySelector("#loading") as HTMLElement | null)?.style.display === "none",
        undefined,
        { timeout: 60_000 },
      );

      const hasHarness = await page.evaluate(
        () =>
          typeof (globalThis as { __testHarness?: { startInjectedRun?: unknown } }).__testHarness
            ?.startInjectedRun === "function",
      );
      expect(hasHarness).toBe(true);

      // Pixel 5プリセット(タッチ有効)が既定になっていることの確認。ゲームは
      // 横持ち固定(plan/game/archive/orientation-rotate-prompt.md)なので、
      // viewportはtests/harness/browser.tsが横向きに入れ替えたものになる
      const viewport = await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
        hasTouch: "ontouchstart" in window,
      }));
      expect(viewport.width).toBeGreaterThan(viewport.height);
      expect(viewport.hasTouch).toBe(true);
    } finally {
      await browser.close();
    }
  });

  it("本番ビルドと違い、window.__testHarnessが実際に注入を反映する", async () => {
    const { browser, context } = await launchMobileBrowser();
    try {
      const page = await context.newPage();
      await page.goto(server.url, { waitUntil: "load" });
      await page.waitForFunction(
        () => (document.querySelector("#loading") as HTMLElement | null)?.style.display === "none",
        undefined,
        { timeout: 60_000 },
      );

      const injectedDepth = await page.evaluate(async () => {
        const floor = {
          depth: 7,
          width: 3,
          height: 3,
          tiles: Array.from({ length: 9 }, () => ({ kind: 1, roomId: 0, explored: true, visible: true })),
          rooms: [{ id: 0, x: 0, y: 0, w: 3, h: 3 }],
          stairs: { x: 2, y: 2 },
          actors: [],
          items: [],
          traps: [],
          barrels: [],
          goldPiles: [],
          fieldObstacles: [],
          secretPassages: [],
        };
        await (globalThis as any).__testHarness.startInjectedRun({ floor, player: { pos: { x: 1, y: 1 } } });
        return (globalThis as any).__app.game.depth;
      });
      expect(injectedDepth).toBe(7);
    } finally {
      await browser.close();
    }
  });
});
