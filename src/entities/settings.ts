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
  "矢印/WASD/テンキー: 8方向に移動。モンスターがいる方向へ進むと攻撃",
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
];
