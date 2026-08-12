# プレイ中バグ報告

プレイヤーが不具合に気づいた瞬間、その場で報告できる仕組みを追加する。
**ユーザー自身が使う**前提なので、技術的な知識が無くても押すだけで
必要な情報が揃うようにする。実装は既に進んでいる `plan/mid-dive-
autosave.md`(`RunSnapshot`, `src/game.ts` / `src/save.ts`)と
`plan/gallery-mode.md`(フォトモードのスクリーンショット、`src/main.ts`
の `takePhoto`)の技術をそのまま転用でき、新しい仕組みをほぼ増やさずに
実装できる。

## 起動方法

新規キー **B**(バグ)。README操作表・`src/view/input.ts` の
`KeyMap`(現状 I/R/Q/E/F/G/T/C/P が使用済み)に空きがあるキーで、
フォトモード(Pキー)と同じ「いつでも呼び出せる軽い割り込み」として
実装する。

- タイトル・拠点・ダンジョン、どの画面からでも呼び出せる。
- 呼び出してもターンは進まない(ターン制ゆえ、入力しない限り時間が
  進まないフォトモードと同じ性質。`src/main.ts` の `togglePhotoMode`
  と同じガード条件をそのまま流用できる)。
- 画面はそのまま(隠さない)。今起きている状況が見えたままの方が、
  プレイヤーが状況を思い出しやすい。

## 収集する情報(プレイヤーは何も入力しなくてよい)

| 項目 | 取得元 |
|---|---|
| ダイブの状態一式(階・HP・持ち物・仲間・乱数状態など) | `RunSnapshot`(`src/game.ts`)をそのまま使う。ダイブ中でなければ省略 |
| スクリーンショット | `src/main.ts` の `takePhoto` と同じ `canvas.toDataURL("image/png")` |
| 直近の出来事 | 既存の戦闘ログ・メッセージ表示に使っている直近の `GameEvent` 列を、そのまま最大数十件分添付する |
| 設定情報 | `plan/difficulty-modes.md` の難易度、`design/yorishiro-moods.md` の今日の気分など |
| 端末情報 | `navigator.userAgent`、画面サイズ |
| ゲームのバージョン | ビルド時に埋め込むコミットハッシュ or `package.json` のバージョン |

プレイヤーが書くのは**一言コメント欄(任意)**だけにする。「何が起きたか」
の技術的な裏付けはすべてゲーム側が自動で揃える。

## 送信ではなく、常にプレイヤーの操作で完結させる

このゲームはサーバーを持たず `localStorage` で完結する設計
(`design/localization.md` 等)なので、**自動送信は行わない**。
バグ報告ボタンを押すと、次の2つの選択肢を出す。

- **ファイルを保存する**: 収集した情報をまとめて1つのファイル
  (JSON。スクリーンショットは `dataURL` のまま埋め込み、画像単体の
  添付操作を挟まず1ファイルで完結させる)としてダウンロードする。
  ユーザーはこれをDiscord・メール・GitHub Issueなど好きな経路で送れる。
  **オフラインでも必ずここまでは完了する。**
- **GitHubで報告する**: `https://github.com/cyber-tribe/game/issues/new`
  に、概要(コメント・階層・端末情報などテキストで表現できる範囲)を
  あらかじめ入力した状態で新しいタブを開く(GitHubの `?body=` などの
  クエリパラメータを使う、既存のIssue用テンプレートがあればそれに
  合わせる)。スクリーンショット・詳細JSONはURLに乗せられないため、
  「保存したファイルをこの画面にドラッグ&ドロップしてください」と
  一言添える。

いずれもプレイヤーが最後の一手を選ぶ操作であり、ゲームが勝手に外部へ
何かを送ることはない。

## プライバシーへの配慮

- 収集する情報はすべてゲーム内の状態(階層・持ち物・端末のブラウザ情報)
  であり、アカウント登録やログインを持たないこの作品では個人を特定する
  情報を扱わない。
- ファイル保存・GitHub遷移のどちらも、プレイヤーが明示的にボタンを
  押すまでは何も外へ出ない。

## データ構造

```ts
export interface BugReport {
  createdAt: string;
  gameVersion: string;
  userComment?: string;
  screen: "title" | "town" | "dungeon";
  runSnapshot?: RunSnapshot; // 既存の型(src/game.ts)をそのまま使う
  recentEvents: GameEvent[];
  settings: { difficulty?: string; moodId?: string };
  device: { userAgent: string; screenWidth: number; screenHeight: number };
  screenshotDataUrl: string;
}
```

## 未決事項

- GitHub Issueのテンプレート整備(ラベル自動付与等)は実装側・リポジトリ
  運用側の判断に委ねる
- 直近イベント何件分を添付するか(戦闘ログの保持件数と揃えるのが自然)
- バグ報告のファイル名・保存先ダイアログの具体的な文言
