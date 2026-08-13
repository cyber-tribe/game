import { describe, expect, it } from "vitest";
import {
  appendLogEntry,
  buildDebugIssueUrl,
  formatStatsJson,
  isDebugEnabled,
  MAX_ERROR_LINE_LENGTH,
  MAX_ERRORS_IN_ISSUE,
  MAX_ISSUE_URL_LENGTH,
  MAX_LOG_ENTRIES,
  MAX_STATS_JSON_LENGTH,
} from "../src/entities/debugPanel";

describe("entities/debugPanel.ts: isDebugEnabled(plan/mobile-debug-panel.md)", () => {
  it("?debug=1のときだけ有効", () => {
    expect(isDebugEnabled("?debug=1")).toBe(true);
  });

  it("クエリパラメータが無ければ無効", () => {
    expect(isDebugEnabled("")).toBe(false);
  });

  it("debug=0など、1以外の値では無効", () => {
    expect(isDebugEnabled("?debug=0")).toBe(false);
    expect(isDebugEnabled("?debug=true")).toBe(false);
  });

  it("他のクエリパラメータと同居していても検出する", () => {
    expect(isDebugEnabled("?foo=bar&debug=1&baz=1")).toBe(true);
  });
});

describe("entities/debugPanel.ts: appendLogEntry(plan/mobile-debug-panel.md)", () => {
  it("末尾に追加する", () => {
    expect(appendLogEntry(["a", "b"], "c")).toEqual(["a", "b", "c"]);
  });

  it("空配列から始めても壊れない", () => {
    expect(appendLogEntry([], "a")).toEqual(["a"]);
  });

  it(`上限(${MAX_LOG_ENTRIES}件)を超えたら古いものから捨てる`, () => {
    const full = Array.from({ length: MAX_LOG_ENTRIES }, (_, i) => `entry-${i}`);
    const next = appendLogEntry(full, "new-entry");
    expect(next.length).toBe(MAX_LOG_ENTRIES);
    expect(next[0]).toBe("entry-1"); // 一番古い entry-0 が捨てられている
    expect(next[next.length - 1]).toBe("new-entry");
  });

  it("元の配列を書き換えない(純粋関数)", () => {
    const original = ["a", "b"];
    appendLogEntry(original, "c");
    expect(original).toEqual(["a", "b"]);
  });
});

describe("entities/debugPanel.ts: formatStatsJson(plan/mobile-debug-panel.md)", () => {
  it("debugStats()相当のオブジェクトをJSON文字列にする", () => {
    const json = formatStatsJson({ depth: 3, hp: "10/25" });
    expect(json).toContain('"depth": 3');
    expect(json).toContain('"hp": "10/25"');
  });

  it(`巨大なスナップショットは${MAX_STATS_JSON_LENGTH}文字で切り詰める`, () => {
    const huge = { log: Array.from({ length: 5000 }, (_, i) => `line-${i}`) };
    const json = formatStatsJson(huge);
    expect(json.length).toBeLessThanOrEqual(MAX_STATS_JSON_LENGTH + "…(省略)".length);
    expect(json.endsWith("…(省略)")).toBe(true);
  });
});

describe("entities/debugPanel.ts: buildDebugIssueUrl(plan/mobile-debug-panel.md)", () => {
  it("cyber-tribe/gameのissues/newを指すURLを組み立てる", () => {
    const url = buildDebugIssueUrl({ stats: { depth: 1 }, errors: [], userAgent: "test-agent" });
    expect(url.startsWith("https://github.com/cyber-tribe/game/issues/new?")).toBe(true);
  });

  it("秘密情報(トークン等)を一切含まない", () => {
    const url = buildDebugIssueUrl({
      stats: { depth: 1 },
      errors: ["何かのエラー"],
      userAgent: "ua",
    });
    expect(url).not.toMatch(/token|secret|password/i);
  });

  it("本文にスナップショットのJSON・ブラウザ情報を含む", () => {
    const url = buildDebugIssueUrl({
      stats: { depth: 7, hp: "3/25" },
      errors: [],
      userAgent: "MyBrowser/1.0",
    });
    const body = new URL(url).searchParams.get("body")!;
    expect(body).toContain('"depth": 7');
    expect(body).toContain('"hp": "3/25"');
    expect(body).toContain("MyBrowser/1.0");
  });

  it("エラーが空でも「(なし)」で埋めて壊れない", () => {
    const url = buildDebugIssueUrl({ stats: {}, errors: [], userAgent: "ua" });
    const body = new URL(url).searchParams.get("body")!;
    expect(body).toContain("(なし)");
  });

  it("直近のエラーを本文に列挙する", () => {
    const url = buildDebugIssueUrl({
      stats: {},
      errors: ["[error] 1件目", "[warn] 2件目"],
      userAgent: "ua",
    });
    const body = new URL(url).searchParams.get("body")!;
    expect(body).toContain("[error] 1件目");
    expect(body).toContain("[warn] 2件目");
  });

  it(`エラーは直近${MAX_ERRORS_IN_ISSUE}件だけに絞る`, () => {
    const errors = Array.from({ length: MAX_ERRORS_IN_ISSUE + 20 }, (_, i) => `err-${i}`);
    const url = buildDebugIssueUrl({ stats: {}, errors, userAgent: "ua" });
    const body = new URL(url).searchParams.get("body")!;
    // 古いものは含まれない
    expect(body).not.toContain("err-0\n");
    expect(body).not.toContain("- err-0");
    // 直近のものは含まれる
    expect(body).toContain(`err-${errors.length - 1}`);
  });

  it(`エラー1行が長すぎる場合は${MAX_ERROR_LINE_LENGTH}文字あたりで切り詰める`, () => {
    const longLine = "x".repeat(MAX_ERROR_LINE_LENGTH * 3);
    const url = buildDebugIssueUrl({ stats: {}, errors: [longLine], userAgent: "ua" });
    const body = new URL(url).searchParams.get("body")!;
    // 元の長さそのままでは含まれていない(切り詰められている)
    expect(body).not.toContain(longLine);
    expect(body).toContain("x".repeat(MAX_ERROR_LINE_LENGTH));
  });

  it(`全体が${MAX_ISSUE_URL_LENGTH}文字を超えないよう最終防波堤で切り詰める`, () => {
    // スナップショット・エラーとも個別の上限に収まる範囲で、それでも合計が
    // 上限を超えるケース(エラーMAX_ERRORS_IN_ISSUE件 × 各MAX_ERROR_LINE_LENGTH文字 で
    // 既に数千文字になる)
    const errors = Array.from({ length: MAX_ERRORS_IN_ISSUE }, (_, i) =>
      `err-${i}-` + "y".repeat(MAX_ERROR_LINE_LENGTH),
    );
    const stats = { log: Array.from({ length: 500 }, (_, i) => `stat-line-${i}`) };
    const url = buildDebugIssueUrl({ stats, errors, userAgent: "ua".repeat(200) });
    expect(url.length).toBeLessThanOrEqual(MAX_ISSUE_URL_LENGTH);
  });

  it("通常サイズの入力ではURLが不必要に切り詰められない", () => {
    const url = buildDebugIssueUrl({
      stats: { depth: 3, hp: "20/25" },
      errors: ["ちいさなエラー"],
      userAgent: "ua",
    });
    const body = new URL(url).searchParams.get("body")!;
    expect(body).not.toContain("省略");
  });
});
