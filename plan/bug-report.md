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
- **ボタンの表示・遷移先は隠さない。** 押せば `github.com` へ画面が
  切り替わることがそのまま見える(隠しようがない、という技術的な
  事実でもある)。行き先を偽ったり、確認なく別の場所へ送ったりしない。

### 本文の組み立て方(URLの長さ制限への対応)

新規Issue画面の事前入力は `?body=...` というURLのクエリ文字列で行う。
`RunSnapshot` はフロア全体のタイル配列を含むため、ダイブ中の報告では
簡単に数十KBを超え、**URLに直接載せるには大きすぎる**(ブラウザ・
GitHub側どちらの制限に照らしても安全とは言えない)。そのため、
URLに乗せる情報とクリップボードに乗せる情報を分ける。

- **URLの `body` に直接載せるもの(数百文字程度で収まる範囲)**:
  プレイヤーのコメント、`screen`、(ダイブ中なら)地方名・階・HP・
  満腹度、`gameVersion`。**貼り付け待ちのプレースホルダー**
  (`<!-- bug-report:paste-here -->` という目印のコメント行)も
  本文の中にあらかじめ用意しておく。
- **クリップボードにコピーするもの**: `BugReport` から
  `floor.tiles`(フロア全体のタイル配列、最も大きい部分)を除いた
  トリミング版を、ボタンを押した時点で `navigator.clipboard.
  writeText()` によりコピーする。ボタン確認時に「貼り付け用のデータを
  コピーしました。GitHubの画面で貼り付けてください」と一言添える。
- **スクリーンショット**: 従来通り `dataURL` は載せず、画像として
  ダウンロードさせ「この画面にドラッグ&ドロップしてください」と促す。
- プレイヤーは、開いたGitHub画面でプレースホルダー行を選び、貼り付け
  (Ctrl+V / Cmd+V)してから投稿する。**ひと手間増えるが、確実に動く
  方法を優先する。**タイトル・拠点画面からの報告(ダイブ中の状態を
  含まない)は元々小さいため、この手順が要らない場合が多い。

## サーバー側の処理(GitHub Actions)

### 起動条件

```yaml
# .github/workflows/bug-report-triage.yml (新規)
on:
  issues:
    types: [opened]
permissions:
  issues: write
jobs:
  triage:
    if: contains(github.event.issue.labels.*.name, 'bug-report')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/github-script@v7
        with:
          script: |
            # 下記の処理をここに書く
```

`labels=bug-report,needs-triage` を新規Issue作成URLに含めておき
(`plan/bug-report.md` の本文組み立て箇所で付与)、`bug-report` ラベルの
無いIssue(通常の手動報告・要望等)には**このワークフローは一切反応
しない**ようにする(`if:` によるジョブレベルの絞り込みで、無関係な
Issueにまで処理が走らないようにする)。

### 処理の流れ

1. Issue本文から、プレースホルダー行(`<!-- bug-report:paste-here -->`)
   の位置に貼り付けられた ```` ```json ... ``` ```` ブロックを正規表現で
   取り出す。
2. `JSON.parse` を試みる。**失敗した場合、または必須項目
   (`createdAt` `gameVersion` `screen`)が欠けている場合**は、
   - `needs-triage` ラベルを外し、`needs-info` ラベルを付ける
   - 「データの貼り付けが見当たりませんでした。ボタンでコピーした
     内容をIssue本文に貼り付けてから投稿し直してください」という
     コメントを付けて、以降の処理を打ち切る。
3. 解析に成功したら、値に応じてラベルを機械的に付ける
   (`screen:${screen}`、`settings.difficulty` があれば
   `difficulty:${difficulty}`)。`needs-triage` は外す。
4. 読みやすい要約コメントを1件追記する(生のJSONを毎回読まずに
   把握できるようにする)。書式の例:

   ```
   ## 自動要約
   - バージョン: v0.x.x (commit abcdef)
   - 発生画面: ダンジョン(なみだの滝つぼ 27階)
   - HP: 18/40, 満腹度: 32
   - 直近の出来事:
     - ホネガラミの攻撃を受けた(-8)
     - 眠りの状態異常を受けた
   - 端末: Chrome, 1920x1080
   ```

5. Issueは**自動で閉じない**(`plan/community-leaderboard.md` の
   リーダーボード投稿とは違い、開発側が調査・返信するためのIssueなので、
   通常の手動Issueと同じくオープンのまま運用者の対応に委ねる)。

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

/**
 * Issue本文に貼り付ける版。BugReport から、フロア全体のタイル配列
 * (floor.tiles)という最も大きい部分を除いたもの。クリップボードに
 * コピーする対象はこちら。
 */
export type PastableBugReport = Omit<BugReport, "runSnapshot" | "screenshotDataUrl"> & {
  runSnapshot?: Omit<RunSnapshot, "floor"> & {
    floor: Omit<RunSnapshot["floor"], "tiles">;
  };
};
```

## 未決事項

- `bug-report-triage.yml` のラベル体系の最終確定(`screen:*` `difficulty:*`
  以外に何を機械的に付けるか)
- 直近イベント何件分を添付するか(戦闘ログの保持件数と揃えるのが自然)
- スクリーンショットのドラッグ&ドロップを促す文言・UIの具体的な見せ方
- JSONブロックの目印(`<!-- bug-report:paste-here -->`)のバージョニング
  方針(今後 `BugReport` の形が変わったときに `v2` を作るか、後方互換を
  保つか)
- `navigator.clipboard.writeText()` が使えない環境(権限拒否・非対応
  ブラウザ)への代替手段(画面上にテキストエリアで表示し手動選択・
  コピーしてもらう、といった保険を用意するか)
- `PastableBugReport` でもなお大きすぎるケース(仲間の数・持ち物が多い
  終盤の状態等)への追加の切り詰め方針
