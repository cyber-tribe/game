/**
 * 設定画面(plan/settings-screen.md)。メッセージ速度・操作説明・
 * キー配置確認の3項目ぶんのデータをここに集約する。
 */

export type MessageSpeed = "slow" | "normal" | "fast";

export const MESSAGE_SPEEDS: readonly MessageSpeed[] = ["slow", "normal", "fast"];

export const MESSAGE_DELAY_MS: Record<MessageSpeed, number> = {
  slow: 60,
  normal: 30,
  fast: 10,
};

/**
 * `src/view/stage.ts`のGameEvent再生ループが持つ、既存のアニメーション
 * 再生速度(`hurry`と同じ`scale`)への倍率に変換する。normalを基準の
 * 1倍とし、slowは間延びさせ、fastは詰める
 */
export function messageSpeedScale(speed: MessageSpeed): number {
  return MESSAGE_DELAY_MS[speed] / MESSAGE_DELAY_MS.normal;
}

/**
 * 操作の一括確認(plan/difficulty-modes.md アクセシビリティ節で導入、
 * plan/settings-screen.mdで拠点の設定画面からも見られるようにする)。
 * README操作表と揃える。ダイブ中のHキー(`src/main.ts`)・拠点の設定画面
 * (`src/ui/town.ts`)の両方から参照する、単一の出典
 */
export const KEY_REFERENCE: readonly string[] = [
  "矢印/WASD/テンキー: 8方向に移動。モンスターがいる方向へ進むと1マス押し出す",
  "X: 向いている方向へ攻撃する(その場から動かない)。何もいなければ空振り",
  "Shift+方向: その場で向きだけ変える(ターンを消費しない)",
  "Space: 足元のものを拾う。階段の上なら次の階へ降りる",
  ". / テンキー5: 足踏み(1ターンやり過ごす)",
  "F: 正面か足元のタルを持ち上げる。抱えていれば下ろす",
  "G: 抱えているタルを向いている方向へ投げる",
  "I: もちものを開く",
  "T: 仲間への指示(構え)を開く",
  "C: 樽守りの技を繰り出す",
  "Q / E: 視点を90度回す",
  "+ / -: ズーム",
  "R: めざめの階段の上で区切って持ち帰る。倒れたあとは拠点に戻る",
  "P: フォトモードの切り替え",
  "M: 設定(アクセシビリティ・音・設定)を開く。村でもダイブ中でも開ける",
];

/**
 * plan/game/mobile-layout-redesign.md: 操作説明一覧のタッチ版。
 * `src/ui/touch-controls.ts`が実際に並べているパッド・ボタンの名前と揃える。
 * タッチ端末の「≡」メニュー・拠点の設定画面ではKEY_REFERENCEの代わりにこちらを表示する
 */
export const KEY_REFERENCE_TOUCH: readonly string[] = [
  "パッド: 8方向に移動。モンスターがいる方向へ進むと1マス押し出す。中央から動かさず離すと足踏み",
  "攻撃ボタン: 向いている方向へ攻撃する(その場から動かない)。何もいなければ空振り",
  "決定ボタン: 足元のものを拾う。階段の上なら次の階へ降りる",
  "タルボタン: 正面か足元のタルを持ち上げる。抱えていれば下ろす",
  "投げるボタン: 抱えているタルを向いている方向へ投げる",
  "道具ボタン: もちものを開く",
  "「≡」メニュー →仲間へ指示: 仲間への指示(構え)を開く",
  "「≡」メニュー →樽守りの技: 樽守りの技を繰り出す",
  "「≡」メニュー →区切り/再挑戦: めざめの階段の上で区切って持ち帰る。倒れたあとは拠点に戻る",
  "「≡」メニュー →フォトモード: フォトモードの切り替え",
  "「≡」メニュー →操作説明: この一覧をいつでも呼び出す",
  "「≡」メニュー →ログ: メッセージの全文履歴を確認する",
  "「≡」メニュー →設定: アクセシビリティ・音・設定を開く。村でもダイブ中でも開ける",
  "盤面を1本指でドラッグ: 視点を回転",
  "盤面を2本指でつまむ: ズーム",
];
