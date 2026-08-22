import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ATTACK_KEY_CODE } from "../../src/view/input";
import { launchMobileBrowser } from "../harness/browser";
import { startInjectedRun, tapActionButton, waitForLoaded } from "../harness/gamePage";
import { startTestServer, type TestServer } from "../harness/server";
import { buildTestFloor } from "../harness/floor";

/**
 * 箱庭ダンジョン(plan/game/test-dungeon-harness.md)の基盤テスト2本目:
 * 戦闘の決定性。列挙Rngで乱数を固定し、隣接攻撃のダメージが期待値
 * どおりで、ダメージ表示・ログがUIに出ることを確認する。
 *
 * まだ気づいていない(aware: false)モンスターへの初手は不意打ちで
 * 必ず会心になる(会心は防御力を無視する、src/domain/combat/criticalHit.ts)。
 * そのためrollCriticalは乱数を消費せず、computeDamageが消費するのは
 * ダメージの変動(0.9〜1.1倍)ぶんのnext()1回だけになる。列挙Rngへ
 * 0.5を渡すと変動倍率はちょうど1.0になり、期待ダメージ = プレイヤーの
 * 攻撃力そのもの(素手・装備なしのtotalAttack = atk = 8)になる
 */
describe("箱庭E2E: 戦闘の決定性", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it("列挙Rngで固定したダメージが状態とUIログの両方に一致する", async () => {
    const { browser, context } = await launchMobileBrowser();
    try {
      const page = await context.newPage();
      await page.goto(server.url, { waitUntil: "load" });
      await waitForLoaded(page);

      const { floor, at } = buildTestFloor(
        `
        #####
        #@..#
        #p..#
        #..>#
        #####
      `,
        { legend: { p: { actor: "purun" } } },
      );

      await startInjectedRun(page, {
        floor,
        player: { pos: at("@") },
        rng: { kind: "enumerated", values: [0.5] },
      });

      const before = await page.evaluate(() => {
        const target = (globalThis as any).__app.game.floor.actors.find((a: any) => a.kind === "monster");
        return { hp: target.hp, maxHp: target.maxHp };
      });
      expect(before.maxHp).toBe(12); // ぷるんの種族値(src/entities/species.ts)

      await tapActionButton(page, ATTACK_KEY_CODE);

      const after = await page.evaluate(() => {
        const target = (globalThis as any).__app.game.floor.actors.find((a: any) => a.kind === "monster");
        return {
          hp: target.hp,
          alive: target.alive,
          log: [...document.querySelectorAll("#log div")].map((d) => d.textContent ?? ""),
        };
      });

      // 状態: 8ダメージ(プレイヤーの素の攻撃力そのもの、会心は防御力2を無視する)
      expect(after.hp).toBe(before.hp - 8);
      expect(after.alive).toBe(true);

      // 画面: ダメージ表示・会心のメッセージがログに出ている
      expect(after.log.some((l: string) => l.includes("会心の一撃"))).toBe(true);
      expect(after.log.some((l: string) => l.includes("8のダメージ"))).toBe(true);
    } finally {
      await browser.close();
    }
  });
});
