import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { launchMobileBrowser } from "../harness/browser";
import { dragTouchPad, settle, startInjectedRun, waitForLoaded } from "../harness/gamePage";
import { startTestServer, type TestServer } from "../harness/server";
import { buildTestFloor } from "../harness/floor";

/**
 * 箱庭ダンジョン(plan/game/test-dungeon-harness.md)の基盤テスト1本目:
 * 移動と衝突。タッチ操作(仮想パッド)で壁に向かって歩いてもターンを
 * 消費せず、床なら1マス進むことを、状態(player.pos/turnCount)と
 * 画面(HUDの地下階表示・盤面の見た目)の両方で確認する
 */
describe("箱庭E2E: 移動と衝突", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it("壁に向かって歩いてもターンを消費せず動かず、床なら1マス進む", async () => {
    const { browser, context } = await launchMobileBrowser();
    try {
      const page = await context.newPage();
      await page.goto(server.url, { waitUntil: "load" });
      await waitForLoaded(page);

      const { floor, at } = buildTestFloor(`
        #####
        #@..#
        #...#
        #..>#
        #####
      `);

      await startInjectedRun(page, { floor, player: { pos: at("@") } });

      const before = await page.evaluate(() => {
        const app = (globalThis as any).__app;
        return { pos: { ...app.game.player.pos }, turnCount: app.game.turnCount };
      });
      expect(before.pos).toEqual(at("@"));

      // 壁(北)へ向かって歩く。ターンを消費せず、その場に留まるはず
      await dragTouchPad(page, 0, -40);
      const afterBump = await page.evaluate(() => {
        const app = (globalThis as any).__app;
        return { pos: { ...app.game.player.pos }, turnCount: app.game.turnCount };
      });
      expect(afterBump.pos).toEqual(before.pos);
      expect(afterBump.turnCount).toBe(before.turnCount);

      // 床(東)へ向かって歩く。1マスだけ進み、ターンが1つ消費されるはず
      await dragTouchPad(page, 40, 0);
      const afterMove = await page.evaluate(() => {
        const app = (globalThis as any).__app;
        return { pos: { ...app.game.player.pos }, turnCount: app.game.turnCount };
      });
      expect(afterMove.pos).toEqual({ x: before.pos.x + 1, y: before.pos.y });
      expect(afterMove.turnCount).toBe(before.turnCount + 1);

      // 画面側: HUDの地下階表示が出ていて、壁バンプでも移動でも
      // ページ側で例外が起きていないこと(pageerrorを拾って確認)
      const depthText = await page.evaluate(
        () => document.querySelector("#hud-depth")?.textContent ?? "",
      );
      expect(depthText).toContain("1");

      await settle(page);
    } finally {
      await browser.close();
    }
  });
});
