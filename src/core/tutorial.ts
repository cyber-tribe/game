/**
 * 「その場方式」のチュートリアルヒント(plan/tutorial.md、アーカイブ済み)。
 * 1つのIDにつき、セーブデータを通して初回のみ表示する。表示可否・既読管理は
 * main.ts が `SaveData.seenTutorialTips` を見て行う(Game 自身はセーブデータを
 * 知らないので、`GameEvent`「tutorialTip」は毎回無条件に発行し、
 * 「初めてかどうか」の判定は呼び出し側に委ねる — checkpoint イベントと同じ形)。
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

export const TUTORIAL_TIPS: Record<TutorialTipId, string> = {
  moveAndAttack: "矢印かWASDで歩けるよ。モンスターのいる方へ進むと、そのまま殴りかかる。",
  pickup: "足元に落ちているものは Space で拾えるよ。",
  barrel: "F でタルを持ち上げ、G で投げられる。抱えている間は拾いものができないよ。",
  weakenThenThrow: "からのタルは、モンスターを弱らせてからぶつけると吸い込みやすくなるよ。",
  capture: "仲間になった! 一緒に歩いて、敵がいれば力を貸してくれる。",
  hunger: "おなかが減ってきたみたい。食べものを探しておこう。",
  status: "様子がおかしい……しばらくすれば、もとに戻るよ。",
  levelUp: "レベルが上がった! 少しずつ強くなっている。",
  checkpoint: "めざめの階段を見つけた。ここまでは、もう迷わず来られる。",
  death: "力つきても、ここまで知ったことは消えないよ。また潜ればいい。",
  allyOrders: "仲間が2体そろった。T キーで『構え』を指示できるよ。",
};

export const TUTORIAL_TIP_IDS: readonly TutorialTipId[] = Object.keys(
  TUTORIAL_TIPS,
) as TutorialTipId[];
