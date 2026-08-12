# プレイ中バグ報告

プレイヤーが不具合に気づいた瞬間、その場で報告できる仕組みを追加する。
**ユーザー自身が使う**前提なので、技術的な知識が無くても押すだけで
必要な情報が揃うようにする。実装は既に進んでいる `plan/mid-dive-
autosave.md`(`RunSnapshot`, `src/game.ts` / `src/save.ts`)と
`plan/gallery-mode.md`(フォトモードのスクリーンショット、`src/main.ts`
の `takePhoto`)の技術をそのまま転用でき、新しい仕組みをほぼ増やさずに
実装できる。`design/server-architecture.md` の「GitHub Actions を
サーバーとして使う」方針の、最初の適用例に位置づける。

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

## GitHub Issueに一本化する

`design/server-architecture.md` の基本パターンに従い、**GitHub Issueの
作成を唯一の経路**にする(ローカルファイル保存の選択肢は設けない)。

- バグ報告ボタン(Bキー)を押すと、`https://github.com/cyber-tribe/
  game/issues/new` に、収集した情報を事前入力した状態で新しいタブを
  開く。**この操作はプレイヤー自身のブラウザが行う**――プレイヤーが
  自分のGitHubアカウントでログインしていれば、そのままIssueを作成
  できる状態になる(`design/server-architecture.md` の原則2)。
- ゲーム側はこの画面を開くところまでで完結し、Issueを実際に作成する
  (投稿ボタンを押す)かどうかはプレイヤーの判断に委ねる。
- スクリーンショットは `dataURL` のままだと長すぎてURLの上限を超えるため、
  本文には**技術情報(JSON、`BugReport` から `screenshotDataUrl` を
  除いたもの)をそのまま埋め込み**、画像だけは別途ダウンロードさせて
  「この画面に貼り付け(ドラッグ&ドロップ)してください」と一言添える。
- **ボタンの表示・遷移先は隠さない。** 押せば `github.com` へ画面が
  切り替わることがそのまま見える(隠しようがない、という技術的な
  事実でもある)。行き先を偽ったり、確認なく別の場所へ送ったりしない。

## サーバー側の処理(GitHub Actions)

Issue作成をきっかけに、`.github/workflows/bug-report-triage.yml`
(新規)が起動し、以下を自動で行う。

- Issue本文からバグ報告用のJSONブロック(目印として
  `<!-- bug-report:v1 -->` を前置する等)を取り出す。
- 形式が正しければ、内容から自動でラベルを付ける(例:
  `screen:dungeon` `difficulty:hard` など、`BugReport` の値をそのまま
  ラベル化する)。
- 読みやすい要約(階層・HP・直前の出来事)をコメントとして追記し、
  開発側が生のJSONを読まずに把握できるようにする。
- JSONが見つからない・壊れている場合は、その旨をコメントし
  `needs-info` ラベルを付ける(通常の手動Issueとの区別のため)。

権限は `GITHUB_TOKEN`(ワークフロー実行のたびに自動発行される、この
リポジトリだけに効く一時トークン)に `issues: write` を与えるだけで
足り、追加のシークレットは必要ない(`design/server-architecture.md`
の原則3)。

## プライバシーへの配慮

- 収集する情報はすべてゲーム内の状態(階層・持ち物・端末のブラウザ情報)
  であり、アカウント登録やログインを持たないこの作品では個人を特定する
  情報を扱わない。
- ただし**Issueは公開リポジトリに残る**。スクリーンショット・端末情報を
  含めて誰でも閲覧できる状態になることは、ボタンの文言(「GitHubで
  報告」)と遷移先が見えることで、プレイヤー自身が確認できるようにする。
- GitHubアカウントを持たないプレイヤーはこの機能を使えない
  (`design/server-architecture.md` の限界を参照)。当面はそれを許容する。

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

- `bug-report-triage.yml` のラベル体系の最終確定(`screen:*` `difficulty:*`
  以外に何を機械的に付けるか)
- 直近イベント何件分を添付するか(戦闘ログの保持件数と揃えるのが自然)
- スクリーンショットのドラッグ&ドロップを促す文言・UIの具体的な見せ方
- JSONブロックの目印(`<!-- bug-report:v1 -->`)のバージョニング方針
  (今後 `BugReport` の形が変わったときに `v2` を作るか、後方互換を
  保つか)
