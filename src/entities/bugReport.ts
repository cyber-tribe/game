/**
 * バグ報告ボタン(plan/bug-report-button.md)。GitHubのIssue作成画面へ、
 * タイトル・本文・ラベルを事前入力したURLを組み立てるだけの純粋関数。
 * ゲームはURLを開くところまでしか行わない(design/server-architecture.mdの
 * 「秘密情報を埋め込まない」「プレイヤー操作を起点にする」原則どおり、
 * 実際の起票=SubmitはプレイヤーがGitHub画面上で行う)。
 */

const REPO = "cyber-tribe/game";
/** plan/archive/auto-tester.mdのauto-reportとは別ラベルにする(重複検知に巻き込まれないため) */
const LABELS = ["player-report", "needs-triage"];

export interface BugReportContext {
  depth: number;
  hp: number;
  maxHp: number;
  satiety: number;
  /** Hud.recentLog。直近のログを新しい順・古い順どちらでも渡してよい(そのまま列挙する) */
  recentLog: readonly string[];
  userAgent: string;
}

export function buildBugReportUrl(ctx: BugReportContext): string {
  const title = `[プレイヤー報告] 地下${ctx.depth}階で不具合`;
  const body = [
    "## 状況",
    "",
    "",
    "## 自動添付情報",
    `- 発生階: ${ctx.depth}`,
    `- HUD: HP ${ctx.hp}/${ctx.maxHp}, 満腹度 ${ctx.satiety}`,
    `- 直近ログ: ${ctx.recentLog.length > 0 ? ctx.recentLog.join(" / ") : "(なし)"}`,
    `- ブラウザ: ${ctx.userAgent}`,
  ].join("\n");
  const params = new URLSearchParams({ title, body, labels: LABELS.join(",") });
  return `https://github.com/${REPO}/issues/new?${params.toString()}`;
}
