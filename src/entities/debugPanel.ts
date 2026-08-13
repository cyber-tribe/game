/**
 * 出先デバッグパネル(plan/mobile-debug-panel.md)。DOM・consoleフックを
 * 持たない純粋関数だけをここに集め、`src/ui/debug-panel.ts`から呼び出す。
 * `plan/archive/bug-report-button.md`の`buildBugReportUrl`(GitHubの
 * issues/new URLを組み立てる箇所)と同じ形を踏襲しているが、こちらは
 * 開発者自身が`?debug=1`で能動的に開いたときにしか呼ばれないため、
 * ラベルは付けない(`player-report`のような一般プレイヤー向けの区別が
 * 不要なため)。
 */

const REPO = "cyber-tribe/game";
const TITLE = "[開発メモ] デバッグパネルからの不具合メモ";

/** 直近ログ(consoleエラー・警告)の保持件数上限。古いものから捨てるリングバッファ */
export const MAX_LOG_ENTRIES = 50;

/**
 * Issue本文に含めるログ行数の上限。`MAX_LOG_ENTRIES`件すべてを載せると
 * URLが際限なく伸びるため、直近だけに絞る
 */
export const MAX_ERRORS_IN_ISSUE = 10;

/** ログ1行あたりの文字数上限(スタックトレース等で1行が異常に長くなるのを防ぐ) */
export const MAX_ERROR_LINE_LENGTH = 300;

/** スナップショットJSONの文字数上限 */
export const MAX_STATS_JSON_LENGTH = 4000;

/**
 * GitHubのissues/new URLには実質的な長さの上限があるため
 * (`plan/archive/bug-report-button.md`が組み立てていたURLと同じ懸念。
 * あちらは`RunSnapshot`から`floor.tiles`のような大きすぎるフィールドを
 * 元々含めないことで対処していた)、個々のフィールドを絞ったうえで、
 * 最終的な全体長にもハードな上限を設ける
 */
export const MAX_ISSUE_URL_LENGTH = 6000;

/** `location.search`(例: `"?debug=1"`)からデバッグパネルを有効にするかどうかを判定する */
export function isDebugEnabled(search: string): boolean {
  return new URLSearchParams(search).get("debug") === "1";
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…(省略)` : s;
}

/** `debugStats()`相当のスナップショットを、表示・Issue本文の両方で使うJSON文字列に整形する */
export function formatStatsJson(stats: Record<string, unknown>): string {
  return truncate(JSON.stringify(stats, null, 2), MAX_STATS_JSON_LENGTH);
}

/** 直近ログへ1行追加する。上限を超えたら古いものから捨てる(純粋関数) */
export function appendLogEntry(entries: readonly string[], entry: string): string[] {
  const next = [...entries, entry];
  return next.length > MAX_LOG_ENTRIES ? next.slice(next.length - MAX_LOG_ENTRIES) : next;
}

export interface DebugSnapshotContext {
  /** `debugStats()`相当の状態スナップショット */
  stats: Record<string, unknown>;
  /** 直近のconsoleエラー・警告(古い順)。末尾(=新しいもの)から採用する */
  errors: readonly string[];
  userAgent: string;
}

function buildUrl(title: string, body: string): string {
  const params = new URLSearchParams({ title, body });
  return `https://github.com/${REPO}/issues/new?${params.toString()}`;
}

/**
 * GitHubの新規Issue作成URL(スナップショット・直近エラーを事前入力)を組み立てる。
 * `window.open`はこの関数の外(`src/ui/debug-panel.ts`)で行う純粋関数
 */
export function buildDebugIssueUrl(ctx: DebugSnapshotContext): string {
  const recentErrors = ctx.errors
    .slice(-MAX_ERRORS_IN_ISSUE)
    .map((e) => truncate(e, MAX_ERROR_LINE_LENGTH));
  const body = [
    "## 状況",
    "",
    "",
    "## スナップショット (debugStats)",
    "```json",
    formatStatsJson(ctx.stats),
    "```",
    "",
    "## 直近のエラー・警告",
    recentErrors.length > 0 ? recentErrors.map((e) => `- ${e}`).join("\n") : "(なし)",
    "",
    `- ブラウザ: ${ctx.userAgent}`,
  ].join("\n");

  let url = buildUrl(TITLE, body);
  if (url.length <= MAX_ISSUE_URL_LENGTH) return url;

  // 個々のフィールドを絞ってもなお溢れる場合の最終防波堤: 本文全体をさらに切り詰める。
  // 日本語はURLエンコード後1文字あたり9文字前後に膨らむため、生文字数ベースの単純な
  // 一発計算では収まりきる保証が無い(削った量とエンコード後の減少量が比例しない)。
  // ここでは実際にエンコードしては測るのを繰り返し、収まるまで少しずつ削っていく
  const NOTE = "\n\n…(URL長制限のため以降省略)";
  let shrunkBody = body;
  while (url.length > MAX_ISSUE_URL_LENGTH && shrunkBody.length > NOTE.length) {
    const cut = Math.max(50, Math.floor(shrunkBody.length * 0.1));
    shrunkBody = shrunkBody.slice(0, Math.max(0, shrunkBody.length - cut - NOTE.length)) + NOTE;
    url = buildUrl(TITLE, shrunkBody);
  }
  return url;
}
