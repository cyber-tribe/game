import {
  appendLogEntry,
  buildDebugIssueUrl,
  formatStatsJson,
} from "../entities/debugPanel";

/**
 * 出先デバッグパネル(plan/mobile-debug-panel.md)。`main.ts`が
 * `?debug=1`のときにだけこのクラスを生成する。生成しなければ
 * consoleフック・エラーリスナーを含め一切何も起きないため、
 * 「無効化」はこのクラスをnewしないこと、それだけで完結する。
 *
 * 内容:
 * - `console.error`/`console.warn`のフック(能動的にログされたもの)と
 *   `window`の`error`/`unhandledrejection`(捕まえ損ねた例外)の両方から
 *   直近ログを集める。devtoolsを開けない出先のスマホでも「何が起きたか」
 *   が画面上に見える
 * - 既存の`debugStats()`相当のスナップショットを、ボタン1つで画面表示・
 *   クリップボードへコピー
 * - スナップショット+直近ログを事前入力したGitHub Issue作成URLを開く
 *   (`src/entities/debugPanel.ts`の`buildDebugIssueUrl`。組み立てそのものは
 *   純粋関数で、実際にURLを開くのはこのクラスの役目)
 */
export class DebugPanel {
  private logEntries: string[] = [];
  private readonly logEl: HTMLElement;
  private readonly snapshotEl: HTMLElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly getStats: () => Record<string, unknown>,
  ) {
    this.root.innerHTML = `
      <p class="debug-panel-title">DEBUG (?debug=1)</p>
      <div class="debug-panel-row">
        <button type="button" data-action="snapshot">スナップショット</button>
        <button type="button" data-action="issue">Issueを開く</button>
        <button type="button" data-action="clear">ログ消去</button>
      </div>
      <ul class="debug-panel-log"></ul>
      <pre class="debug-panel-snapshot"></pre>
    `;
    this.logEl = this.root.querySelector<HTMLElement>(".debug-panel-log")!;
    this.snapshotEl = this.root.querySelector<HTMLElement>(".debug-panel-snapshot")!;

    this.root.querySelector<HTMLElement>('[data-action="snapshot"]')!.addEventListener("click", () => {
      this.snapshot();
    });
    this.root.querySelector<HTMLElement>('[data-action="issue"]')!.addEventListener("click", () => {
      this.openIssue();
    });
    this.root.querySelector<HTMLElement>('[data-action="clear"]')!.addEventListener("click", () => {
      this.logEntries = [];
      this.renderLog();
    });

    this.hookConsole();
    this.hookWindowErrors();
  }

  /** 能動的にログされたエラー・警告を捕まえる。ゲーム側のコードは変更しない(上書き+委譲のみ) */
  private hookConsole(): void {
    const origError = console.error.bind(console);
    const origWarn = console.warn.bind(console);
    console.error = (...args: unknown[]) => {
      this.pushLog("error", args.map((a) => stringifyArg(a)).join(" "));
      origError(...args);
    };
    console.warn = (...args: unknown[]) => {
      this.pushLog("warn", args.map((a) => stringifyArg(a)).join(" "));
      origWarn(...args);
    };
  }

  /** console.error/warnを経由しない、捕まえ損ねた例外(uncaught error / unhandled rejection)を捕まえる */
  private hookWindowErrors(): void {
    window.addEventListener("error", (e) => {
      this.pushLog("error", e.message || String(e.error ?? e));
    });
    window.addEventListener("unhandledrejection", (e) => {
      this.pushLog("error", `unhandledrejection: ${stringifyArg(e.reason)}`);
    });
  }

  private pushLog(level: "error" | "warn", message: string): void {
    this.logEntries = appendLogEntry(this.logEntries, `[${level}] ${message}`);
    this.renderLog();
  }

  private renderLog(): void {
    // 画面上は直近10件だけ表示する(Issue本文側の上限はentities/debugPanel.tsのMAX_ERRORS_IN_ISSUE)
    this.logEl.innerHTML = this.logEntries
      .slice(-10)
      .map((line) => `<li class="${line.startsWith("[warn]") ? "warn" : ""}">${escapeHtml(line)}</li>`)
      .join("");
  }

  private snapshot(): void {
    const json = formatStatsJson(this.getStats());
    this.snapshotEl.textContent = json;
    navigator.clipboard?.writeText(json).catch(() => {
      // クリップボード権限が無い環境でも、画面表示(上のtextContent)だけは残るので黙って諦める
    });
  }

  private openIssue(): void {
    const url = buildDebugIssueUrl({
      stats: this.getStats(),
      errors: this.logEntries,
      userAgent: navigator.userAgent,
    });
    window.open(url, "_blank");
  }
}

function stringifyArg(a: unknown): string {
  if (a instanceof Error) return a.stack ?? a.message;
  if (typeof a === "string") return a;
  try {
    return JSON.stringify(a);
  } catch {
    return String(a);
  }
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
