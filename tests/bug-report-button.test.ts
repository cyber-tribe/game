import { describe, expect, it } from "vitest";
import { buildBugReportUrl } from "../src/entities/bugReport";

describe("entities/bugReport.ts: buildBugReportUrl(plan/bug-report-button.md)", () => {
  it("cyber-tribe/gameのissues/newを指すURLを組み立てる", () => {
    const url = buildBugReportUrl({
      depth: 5,
      hp: 10,
      maxHp: 25,
      satiety: 80,
      recentLog: ["ガジリねずみのこうげき!", "ガルドに3のダメージ!"],
      userAgent: "test-agent",
    });
    expect(url.startsWith("https://github.com/cyber-tribe/game/issues/new?")).toBe(true);
  });

  it("player-report・needs-triageの両ラベルを含む", () => {
    const url = buildBugReportUrl({
      depth: 1,
      hp: 25,
      maxHp: 25,
      satiety: 100,
      recentLog: [],
      userAgent: "test-agent",
    });
    const params = new URL(url).searchParams;
    expect(params.get("labels")).toBe("player-report,needs-triage");
  });

  it("タイトルに発生階を含む", () => {
    const url = buildBugReportUrl({
      depth: 12,
      hp: 25,
      maxHp: 25,
      satiety: 100,
      recentLog: [],
      userAgent: "test-agent",
    });
    const params = new URL(url).searchParams;
    expect(params.get("title")).toBe("[プレイヤー報告] 地下12階で不具合");
  });

  it("本文にHUD情報・直近ログ・ブラウザ情報を含む", () => {
    const url = buildBugReportUrl({
      depth: 7,
      hp: 3,
      maxHp: 25,
      satiety: 42,
      recentLog: ["Aのメッセージ", "Bのメッセージ"],
      userAgent: "MyBrowser/1.0",
    });
    const params = new URL(url).searchParams;
    const body = params.get("body")!;
    expect(body).toContain("発生階: 7");
    expect(body).toContain("HP 3/25");
    expect(body).toContain("満腹度 42");
    expect(body).toContain("Aのメッセージ / Bのメッセージ");
    expect(body).toContain("MyBrowser/1.0");
  });

  it("直近ログが空でも「(なし)」で埋めて壊れない", () => {
    const url = buildBugReportUrl({
      depth: 1,
      hp: 25,
      maxHp: 25,
      satiety: 100,
      recentLog: [],
      userAgent: "test-agent",
    });
    const params = new URL(url).searchParams;
    expect(params.get("body")).toContain("直近ログ: (なし)");
  });

  it("秘密情報(トークン等)を一切含まない(ゲーム状態の文字列だけで構成される)", () => {
    const url = buildBugReportUrl({
      depth: 1,
      hp: 25,
      maxHp: 25,
      satiety: 100,
      recentLog: ["ログ"],
      userAgent: "ua",
    });
    expect(url).not.toMatch(/token|secret|password/i);
  });
});
