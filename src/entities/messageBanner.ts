/**
 * plan/game/mobile-layout-redesign.md: メッセージ帯(タッチ専用の
 * フローティングバナー)の状態遷移。「新しいメッセージが来たら直近数行を
 * 表示してフェードを取り消す」「無操作が一定時間続いたらフェードアウトする」
 * という2つの遷移だけを、setTimeout等のDOM/タイマー配線を持たない純粋な
 * 関数として切り出す(`src/entities/orientation.ts`と同じ、ロジックとDOM
 * 配線を分ける形)。実際のタイマー配線は`src/view/hud.ts`側が持つ。
 */

/** バナーに表示する直近行数(3〜5秒案のうち、行数は3行を採用。実装ノート参照) */
export const BANNER_LINE_COUNT = 3;

/** 無操作でフェードアウトするまでの時間(ms)。3〜5秒のレンジから4秒を採用(実装ノート参照) */
export const BANNER_FADE_MS = 4000;

export interface BannerState {
  /** 表示中の行(古い→新しいの順、最大BANNER_LINE_COUNT件) */
  readonly lines: readonly string[];
  /** フェードアウト済みかどうか */
  readonly faded: boolean;
}

export const INITIAL_BANNER_STATE: BannerState = { lines: [], faded: true };

/** 全文履歴(古い→新しいの順)から、バナーに出す直近行だけを切り出す */
export function bannerLinesFor(
  history: readonly string[],
  count: number = BANNER_LINE_COUNT,
): readonly string[] {
  return count <= 0 ? [] : history.slice(-count);
}

/** 新しいメッセージが届いたときの次状態。表示に戻し、フェードを取り消す */
export function showBanner(history: readonly string[]): BannerState {
  return { lines: bannerLinesFor(history), faded: false };
}

/** フェードアウトタイマーが満了したときの次状態。行の中身はそのまま、表示だけ落とす */
export function fadeBanner(state: BannerState): BannerState {
  return state.faded ? state : { ...state, faded: true };
}
