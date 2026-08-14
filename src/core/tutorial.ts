import { resolveText, type InputMode, type TextVariant } from "../entities/inputText";

/**
 * 「その場方式」のチュートリアルヒント(plan/tutorial.md、アーカイブ済み)。
 * 1つのIDにつき、セーブデータを通して初回のみ表示する。表示可否・既読管理は
 * main.ts が `SaveData.seenTutorialTips` を見て行う(Game 自身はセーブデータを
 * 知らないので、`GameEvent`「tutorialTip」は毎回無条件に発行し、
 * 「初めてかどうか」の判定は呼び出し側に委ねる — checkpoint イベントと同じ形)。
 *
 * plan/game/mobile-layout-redesign.md: 「矢印/WASD」「Xキー」等キー名を含む
 * tipは、タッチ端末向けの言い換え(パッド・攻撃ボタン等)を`touch`側に持つ。
 * キー名を含まないtipは両方に同じ文面を置く。
 */
export type TutorialTipId =
  | "moveAndAttack"
  | "pickup"
  | "barrel"
  | "weakenThenThrow"
  | "capture"
  | "hunger"
  | "status"
  | "levelUp"
  | "checkpoint"
  | "death"
  | "allyOrders";

export const TUTORIAL_TIPS: Record<TutorialTipId, TextVariant> = {
  moveAndAttack: {
    keyboard:
      "矢印かWASDで歩けるよ。モンスターのいる方へ進むと1マス押し出せる。Xキーで、向いている方向へ攻撃できる。",
    touch:
      "パッドで歩けるよ。モンスターのいる方へ進むと1マス押し出せる。攻撃ボタンで、向いている方向へ攻撃できる。",
  },
  pickup: {
    keyboard: "足元に落ちているものは Space で拾えるよ。",
    touch: "足元に落ちているものは決定ボタンで拾えるよ。",
  },
  barrel: {
    keyboard: "F でタルを持ち上げ、G で投げられる。抱えている間は拾いものができないよ。",
    touch: "「タル」ボタンで持ち上げ、「投げる」ボタンで投げられる。抱えている間は拾いものができないよ。",
  },
  weakenThenThrow: {
    keyboard: "からのタルは、モンスターを弱らせてからぶつけると吸い込みやすくなるよ。",
    touch: "からのタルは、モンスターを弱らせてからぶつけると吸い込みやすくなるよ。",
  },
  capture: {
    keyboard: "仲間になった! 一緒に歩いて、敵がいれば力を貸してくれる。",
    touch: "仲間になった! 一緒に歩いて、敵がいれば力を貸してくれる。",
  },
  hunger: {
    keyboard: "おなかが減ってきたみたい。食べものを探しておこう。",
    touch: "おなかが減ってきたみたい。食べものを探しておこう。",
  },
  status: {
    keyboard: "様子がおかしい……しばらくすれば、もとに戻るよ。",
    touch: "様子がおかしい……しばらくすれば、もとに戻るよ。",
  },
  levelUp: {
    keyboard: "レベルが上がった! 少しずつ強くなっている。",
    touch: "レベルが上がった! 少しずつ強くなっている。",
  },
  checkpoint: {
    keyboard: "めざめの階段を見つけた。ここまでは、もう迷わず来られる。",
    touch: "めざめの階段を見つけた。ここまでは、もう迷わず来られる。",
  },
  death: {
    keyboard: "力つきても、ここまで知ったことは消えないよ。また潜ればいい。",
    touch: "力つきても、ここまで知ったことは消えないよ。また潜ればいい。",
  },
  allyOrders: {
    keyboard: "仲間が2体そろった。T キーで『構え』を指示できるよ。",
    touch: "仲間が2体そろった。「≡」メニューの『仲間へ指示』で『構え』を指示できるよ。",
  },
};

export const TUTORIAL_TIP_IDS: readonly TutorialTipId[] = Object.keys(
  TUTORIAL_TIPS,
) as TutorialTipId[];

/** 指定した入力方式向けの文面を返す */
export function tutorialTipText(id: TutorialTipId, mode: InputMode): string {
  return resolveText(TUTORIAL_TIPS[id], mode);
}
