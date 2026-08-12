/**
 * 自動テストプレイ(plan/archive/auto-tester.md)の重複投稿対策。
 * 発生場所・正規化したエラーメッセージ・スタック最上位フレーム(行番号を除く)を
 * 連結してSHA-256でハッシュ化する。tools/auto-tester.mjs と
 * .github/workflows/auto-tester.yml の両方から使う、純粋関数だけのモジュール。
 */

/** メッセージ中の可変値を正規化する。UUID・16進数を先に潰してから、最後に素朴な数値をまとめて置き換える */
export function normalizeMessage(message) {
  return message
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<UUID>")
    .replace(/\b0x[0-9a-f]+\b/gi, "<HEX>")
    .replace(/\b\d+(\.\d+)?\b/g, "<N>");
}

/** スタックトレースの最上位フレームを「関数名@ファイル名」の形にする。行番号は含めない */
export function topStackFrame(stack) {
  if (typeof stack !== "string") return "";
  const line = stack
    .split("\n")
    .slice(1)
    .find((l) => l.trim().startsWith("at "));
  if (!line) return "";
  const match = line.match(/at\s+(?:([^\s(]+)\s+)?\(?([^():]+):\d+:\d+\)?/);
  if (!match) return line.trim();
  const [, fn, file] = match;
  return `${fn ?? "<anonymous>"}@${file}`;
}

/** 発生場所・正規化済みメッセージ・スタック最上位フレームからフィンガープリントを作る */
export async function fingerprint({ screen, message, topFrame }) {
  const parts = [screen ?? "", normalizeMessage(message ?? ""), topFrame ?? ""].join("|");
  const data = new TextEncoder().encode(parts);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
