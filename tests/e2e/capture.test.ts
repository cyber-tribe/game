import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { launchMobileBrowser } from "../harness/browser";
import { startInjectedRun, tapActionButton, waitForLoaded } from "../harness/gamePage";
import { startTestServer, type TestServer } from "../harness/server";
import { buildTestFloor } from "../harness/floor";

/**
 * 箱庭ダンジョン(plan/game/test-dungeon-harness.md)の基盤テスト3本目: 捕獲。
 * HPを削ったモンスターに空タルを当てて捕獲し、仲間に入ったことを
 * 状態(game.allies・floor.actors)とUI(捕獲成功メッセージ)の両方で確認する。
 *
 * 捕獲確率(src/domain/barrel/barrelCapture.tsのcaptureChance)は
 * HPが低いほど上がるが上限0.85の確率判定であって確定ではない。列挙Rngに
 * 低い値(0.01)を繰り返し返させることで、命中判定・ダメージ変動・捕獲判定の
 * どのrng.chance/rng.floatも「確率を満たす」側に倒し、決定的に成功させる。
 *
 * 空タルが命中して捕獲に成功しても、その時点ではモンスター入りのタルに
 * 変わるだけ(barrel.kind: "empty" -> "caught")。仲間になるのは、その
 * タルをもう一度持ち上げて投げたとき(src/domain/barrel/barrelDrop.ts
 * releaseFromBarrel)なので、タル投げは2回行う
 */
describe("箱庭E2E: 捕獲", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it("弱らせたモンスターに空タルを当てて捕獲し、仲間になる", async () => {
    const { browser, context } = await launchMobileBrowser();
    try {
      const page = await context.newPage();
      await page.goto(server.url, { waitUntil: "load" });
      await waitForLoaded(page);

      const { floor, at } = buildTestFloor(
        `
        #####
        #@..#
        #b..#
        #p..#
        #..>#
        #####
      `,
        { legend: { b: { barrel: "empty" }, p: { actor: "purun", hp: 3 } } },
      );

      await startInjectedRun(page, {
        floor,
        player: { pos: at("@") },
        rng: { kind: "enumerated", values: [0.01] },
      });

      // タルを持ち上げる(プレイヤーは既定で南向き、タルは真南)
      await tapActionButton(page, "KeyF");
      const carrying = await page.evaluate(() => (globalThis as any).__app.game.player.carrying?.kind);
      expect(carrying).toBe("empty");

      // 投げる。飛んでいった先(南側2マス)のモンスターに当たるはず
      await tapActionButton(page, "KeyG");

      const afterHit = await page.evaluate(() => {
        const app = (globalThis as any).__app;
        return {
          monstersLeft: app.game.floor.actors.filter((a: any) => a.kind === "monster" && a.alive).length,
          barrel: app.game.floor.barrels[0],
        };
      });
      expect(afterHit.monstersLeft).toBe(0);
      expect(afterHit.barrel).toMatchObject({ kind: "caught", speciesId: "purun" });

      // モンスター入りのタルをもう一度持ち上げて投げ、仲間にする
      await tapActionButton(page, "KeyF");
      await tapActionButton(page, "KeyG");

      const after = await page.evaluate(() => {
        const app = (globalThis as any).__app;
        return {
          monstersLeft: app.game.floor.actors.filter((a: any) => a.kind === "monster" && a.alive).length,
          allies: app.game.allies.map((a: any) => a.speciesId),
          log: [...document.querySelectorAll("#log div")].map((d) => d.textContent ?? ""),
        };
      });

      // 状態: モンスターが盤面から消え、仲間にぷるんが加わっている
      expect(after.monstersLeft).toBe(0);
      expect(after.allies).toContain("purun");

      // 画面: 捕獲成功メッセージ(ja.ts msg.captureSuccess)がログに出ている
      expect(after.log.some((l: string) => l.includes("タルに吸い込んだ"))).toBe(true);
    } finally {
      await browser.close();
    }
  });
});
