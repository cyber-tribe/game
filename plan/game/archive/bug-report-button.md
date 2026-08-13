> **実装済み。**
> `src/entities/bugReport.ts`(新規、`buildBugReportUrl`。純粋関数として
> URL組み立てだけを行う)、`src/view/hud.ts`(`Hud.recentLog`ゲッターを
> 追加し、直近ログを外部から読めるようにした)、`src/ui/town.ts`
> (アクセシビリティ列(column 14)に`B`キーで`onReportBug`コールバックを
> 呼ぶハンドラとヒント表示を追加。`show()`の最後の引数として追加した)、
> `src/main.ts`(`showTown()`の`onReportBug`コールバックで`Game`/`Hud`
> から状態を集めて`window.open(url, "_blank")`する)、
> `.github/workflows/player-report-ack.yml`(新規。`player-report`
> ラベルのIssueが開かれたら定型コメントを1件投稿するだけ)に実装した。
> テストは `tests/bug-report-button.test.ts`(6件、`buildBugReportUrl`の
> 純粋ロジック)。加えて、実機(Chromium)で拠点→アクセシビリティ列→
> `B`キーの操作から`window.open`に渡るURLの中身(タイトル・本文・
> ラベル)まで実際に確認した。
>
> 実装時の判断:
> - プランの本文タイトル案「[プレイヤー報告] <直近のGameEvent種別>で
>   不具合」は、直近のGameEventが必ずしも有益な情報(例:
>   "message"・"move"等)とは限らず未決事項でもあったため、より
>   分かりやすい「[プレイヤー報告] 地下{depth}階で不具合」に変更した。
> - 「直近ログ(直近10件)」は、既存の`Hud`が保持するログ行数の上限
>   (`MAX_LOG_LINES = 6`、画面表示用)をそのまま流用したため、実際には
>   最大6件になる(UI表示用の上限を変更する理由が無いため、専用の
>   バッファは新設しなかった)。
> - ボタンの設置場所は、プランの「拠点画面の設定まわり」という指示を、
>   `plan/settings-screen.md`(本文書とは別の、未実装の専用設定画面)
>   ではなく、既存のアクセシビリティ列(実質的な設定コーナー)と解釈
>   して実装した。
> - `.github/workflows/player-report-ack.yml`は、既存の
>   `auto-tester.yml`と同じく`actions/github-script@v7`を使い、
>   `GITHUB_TOKEN`のデフォルト権限(`issues: write`)だけで完結させた。

# バグ報告ボタン

`design/server-architecture.md` が「検討した機能」として挙げつつ本文書
側で個別仕様化を持ち越していた「バグ報告」を、同文書の原則(秘密情報を
埋め込まない・プレイヤー自身の操作を起点にする・`GITHUB_TOKEN`だけで
完結させる)に沿って実装可能な形にする。`plan/archive/auto-tester.md`
(自動テストプレイエージェント)が使っている `auto-report` ラベルの仕組みと
並走させる、プレイヤー起点の報告経路を追加する。

## 概要

- 拠点画面(`src/ui/town.ts`)の設定まわりに、**「不具合を報告する」**
  ボタンを1つ追加する。
- 押すと、`https://github.com/<owner>/<repo>/issues/new` に
  `title`・`body`・`labels` をクエリパラメータで事前入力したURLを
  新しいタブで開く(`window.open`)。**ゲームはここで完全に手を引く**
  (`design/server-architecture.md`原則2)。実際にIssueを起票するか・
  内容を編集するかはプレイヤー自身の判断とGitHub操作に委ねる。
- 事前入力する本文には、`plan/archive/auto-tester.md`の
  `tools/fingerprint.mjs`が使っているのと同じ形の**直近ログ・HUD
  スナップショット**(座標・階数・所持品程度の軽量な情報)を含める。
  プレイヤーが手打ちで再現状況を書く手間を減らす。
- 個人情報・秘密情報は一切含めない(`GITHUB_TOKEN`等はそもそも
  クライアントに存在しない。含めるのはゲーム内の状態のみ)。

## 事前入力する内容

```
title: [プレイヤー報告] <直近のGameEvent種別>で不具合
labels: player-report,needs-triage
body:
  ## 状況
  (ここにプレイヤーが自由記述で追記できるよう、空行を用意しておく)

  ## 自動添付情報
  - 発生階: {depth}
  - HUD: HP {hp}/{maxHp}, 満腹度 {satiety}
  - 直近ログ(直近10件): {recentLog}
  - ブラウザ: {navigator.userAgent}
```

`tools/fingerprint.mjs`の`normalizeMessage`(UUID→`<UUID>`等の正規化)は
**流用しない**(自動テスト側のログ解析用の正規化であり、プレイヤー報告は
人間が読む前提のため、生のログをそのまま載せる方が有用)。

## ラベルの使い分け

`plan/archive/auto-tester.md`が`auto-report`ラベルを使っているのに対し、
プレイヤー起点の報告には別ラベル**`player-report`**を付与する
(`needs-triage`は共通)。既存の自動集約ワークフロー
(`.github/workflows/auto-tester.yml`)がフィンガープリント突合に
`label:auto-report`で絞り込んでいるため、ラベルを分けておけば
**プレイヤー報告が自動テストの重複検知ロジックに巻き込まれず、常に
個別Issueとして起票される**(意図的な設計。プレイヤーの生の言葉を
機械的な重複判定で握りつぶさないため)。

## GitHub Actions側の処理

`on: issues: opened`(`design/server-architecture.md`の「イベント駆動」
の原則には厳密には反する――起点はプレイヤーのIssue作成というプレイヤー
操作だが、それはGitHub上で完結しており、ワークフロー自体はGitHubの
イベントだけで起動する)で、`player-report`ラベルを検知したら:

- `GITHUB_TOKEN`だけで、起票直後に短い定型コメント(「報告ありがとう
  ございます。確認まで少しお時間をいただきます」等)を1件だけ自動投稿
  する(原則3・4に沿う。追加のシークレットは不要)。
- それ以上の自動処理(自動クローズ・自動アサイン等)は行わない。
  トリアージは人間が行う前提。

## `design/server-architecture.md` の原則との整合確認

1. 秘密情報を埋め込まない: 事前入力URLの構築は、すべてクライアント側の
   静的な文字列組み立てだけで完結する。トークン類は一切扱わない。
2. プレイヤー操作を起点にする: ボタンを押す→新しいタブが開く→Issueの
   実際の起票(Submitボタン)はプレイヤー自身がGitHub画面上で行う。
   ゲームは事前入力までしか行わない。
3. `GITHUB_TOKEN`だけで完結: ワークフローはコメント投稿のみ(追加権限
   不要)。
4. 結果はリポジトリの中に残る: Issue自体がリポジトリ内の記録になる。

## 実装への影響の見積もり

- `src/ui/town.ts`: 「不具合を報告する」ボタン、事前入力URL構築処理を
  追加。
- `.github/workflows/`: 新規ワークフロー
  (`player-report-ack.yml`程度の名前)を追加。`on: issues: opened`、
  ラベル判定、定型コメント投稿の数行。
- 新規のセーブフィールドは不要(ゲーム状態の読み取りのみ)。

## 未決事項

- 事前入力するHUDスナップショットの具体的な項目の絞り込み
  (`tools/auto-tester.mjs`のsnapshot形式をどこまで流用するか)。
- 定型コメント文言の最終的な言い回し。
- Issueテンプレート(`.github/ISSUE_TEMPLATE/`)を別途整備するかどうか
  (クエリパラメータでの事前入力と両立できるため、必須ではない)。
