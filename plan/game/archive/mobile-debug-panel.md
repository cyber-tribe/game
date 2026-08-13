> **実装済み。**
>
> **ロジック(`src/entities/debugPanel.ts`、純粋関数)**: `isDebugEnabled(search)`
> (`URLSearchParams(search).get("debug") === "1"`)、`appendLogEntry`
> (直近ログのリングバッファ、上限50件)、`buildDebugIssueUrl`
> (`plan/archive/bug-report-button.md`の`buildBugReportUrl`と同じ形の
> GitHub issues/new URL組み立て)を実装した。
>
> **UI(`src/ui/debug-panel.ts`、新規)**: `DebugPanel`クラス。
> `console.error`/`console.warn`を上書き+委譲でフックしつつ、
> `window.addEventListener("error"/"unhandledrejection")`も併用した
> (未決事項3。前者は能動的にログされたもの、後者は捕まえ損ねた例外を
> 拾う。片方だけでは足りないと判断し両方採用)。ボタンは
> 「スナップショット」(`debugStats()`相当を画面表示+
> `navigator.clipboard.writeText`)・「Issueを開く」
> (`buildDebugIssueUrl`の結果を`window.open`)・「ログ消去」の3つ。
>
> **`src/main.ts`との結線**: `App`のコンストラクタで
> `isDebugEnabled(location.search)`が真のときだけ`new DebugPanel(...)`する。
> 偽のときは`DebugPanel`を一切newしないため、`console.error`の上書き・
> `window`へのリスナー登録を含め本当に何も起きない
> (`tools/playtest.mjs`は`?debug=1`を付けないURLを開くため無関係)。
> `getStats`コールバックには既存の`App#debugStats()`をそのまま渡しており、
> 中身には手を入れていない。
>
> **`index.html`**: `#ui`配下に空の`<div id="debugPanel" class="panel">`を
> 追加。CSSは`#debugPanel { display: none; }` +
> `#debugPanel:not(:empty) { display: block; }`とし、`DebugPanel`が
> `innerHTML`を書き込んだとき(=生成されたとき)だけCSS側でも表示される
> 二重の安全策にした(JS側の分岐だけに頼らない)。配置は画面左上
> (`left: 8px; top: 8px`)、幅は`min(300px, 84vw)`でスマホの狭い画面でも
> 収まるようにした。
>
> **未決事項1(トリガー)**: 単純な`?debug=1`のままにした。プランが
> 明言しているとおり「凝る必要は無い」ため、タップ回数等の発見されにくい
> トリガーは採用しなかった。開発者本人しか使わない前提であり、
> `plan/archive/bug-report-button.md`と違って一般プレイヤーの目に
> 触れる経路がそもそも無いため、隠す動機が薄い。
>
> **未決事項2(UI・表示項目)**: 画面左上の小さな固定パネル1枚に、
> 直近ログ(画面表示は直近10件。Issue本文側は
> `MAX_ERRORS_IN_ISSUE`件=10件に別途絞っている)・スナップショット表示欄
> (`<pre>`)・ボタン3つを縦に並べただけの簡素なレイアウトにした。
> 開発者用ツールであり装飾は不要と判断した。
>
> **未決事項3(consoleフックの実装方法)**: 本文に記載のとおり両方採用
> (`console.error`/`console.warn`の上書きと、`window`の
> `error`/`unhandledrejection`の併用)。
>
> **サイズ対策(`plan/archive/bug-report-button.md`のfloor.tiles除外と同じ
> 懸念への対応)**: 既存の`debugStats()`はもともと`floor.tiles`のような
> 生の配列を含まず、タイル数などの集計値しか返さないため、あちらの
> ような個別フィールド除外は不要だった。代わりに、スナップショットJSON
> (`MAX_STATS_JSON_LENGTH`=4000文字)・ログ1行(`MAX_ERROR_LINE_LENGTH`=
> 300文字)・Issueに載せるログ件数(`MAX_ERRORS_IN_ISSUE`=10件)をそれぞれ
> 上限で切り詰めたうえで、最終防波堤として全体URL長にも上限
> (`MAX_ISSUE_URL_LENGTH`=6000文字)を設けた。日本語はURLエンコード後に
> 1文字あたり9文字前後へ膨らむため、生文字数ベースの一発計算では
> 収まる保証が無いと判断し、実際にエンコードして測っては削るのを
> 収まるまで繰り返す実装にした。
>
> **Issueのラベル**: 付けていない。`plan/archive/bug-report-button.md`の
> `player-report`ラベルは、専用のIssueテンプレート的な取り扱いや
> `.github/workflows/player-report-ack.yml`の自動コメントの起点として
> 使われているが、本機能は開発者自身が使うメモ用途であり、そうした
> 自動処理と結び付ける理由が無いため見送った。
>
> **検証**: `npx tsc --noEmit`・`npx vitest run`(93ファイル/1094件、
> 全green。新規`tests/mobile-debug-panel.test.ts`15件を含む)・
> `npm run build`をいずれも確認。DOM操作を伴う`DebugPanel`クラス本体は
> (プランの指示どおり)実機/ブラウザでの確認に留め、専用のunit testは
> 追加していない(純粋関数側の`src/entities/debugPanel.ts`のみテスト)。
>
> **対象外(変更していないもの)**: `globalThis.__app`の既存デバッグ
> メソッド群(`debugStats()`含む)の中身、`tools/playtest.mjs`。

# 出先でのモバイルデバッグ用パネル

開発者から「出かけ先でデバッグできないと辛い」との声があった。
`plan/playtest-deployment.md` により最新ビルドはスマホからでも
URLを開くだけで遊べるが、**不具合に気づいてもdevtoolsを開けないため、
その場で何が起きたかを確認する手段が無い**。

## `plan/archive/bug-report.md`(廃止済み)との違い

あの機能は「一般プレイヤーに見せる可能性のあるボタン」だったため、
GitHubのUIが一瞬見えてしまうというUX上のトレードオフを理由に廃止した。
今回のニーズは性質が異なる。**開発者自身が、自分のゲームを外出先の
スマホで触っていて不具合に気づいたとき、その場で状態を確認・記録
したい**という開発者向けの用途であり、一般プレイヤーの目に触れる
経路ではない。以前の「行き先を隠さない/隠す」という論点はそもそも
発生しない。

## 現状

`src/main.ts` は既に `globalThis.__app` にデバッグ用メソッド
(`debugStats()` 等、`tools/playtest.mjs` が使うもの)を無条件で公開
している。ただし**画面上のUIは無く、devtoolsコンソールからJSを直接
呼ぶ前提**になっており、スマホ単体では実質使えない。

## 変更内容

- URLに **`?debug=1`** を付けてアクセスしたときだけ、画面の隅に小さな
  **デバッグパネル**を表示する。通常URL(`?debug=1`無し)では一切見えず、
  既存のプレイ体験に影響しない。
- パネルの内容:
  - **直近のconsoleエラー・警告を画面上に一覧表示**(`window.onerror`・
    `console.error`のフック)。devtoolsが無くても「何が起きたか」が
    その場で見える。
  - 既存の `debugStats()` 相当の**状態スナップショットを、ボタン1つで
    画面表示・クリップボードへコピー**できるようにする。
  - 上記をまとめて**GitHub Issueの新規作成URLを組み立てて開く**ボタンも
    用意する。`plan/archive/bug-report.md` が組み立てていた本文の考え方
    (`RunSnapshot`からの`floor.tiles`除外等のサイズ対策)をそのまま
    流用できるが、今回は開発者自身が能動的に`?debug=1`を付けてアクセス
    した場合に限られるため、一般プレイヤー向けの透明性の論点は生じない。

## 対象範囲

- あくまで開発者(このプロジェクトの作者)自身が使う想定。一般プレイヤー
  向けの導線(ボタン等)は用意しない。
- `plan/playtest-deployment.md` で公開されているビルドURLの末尾に
  `?debug=1` を付けるだけで、出先のスマホからすぐ使える。

## 対象外

- 一般プレイヤー向けバグ報告経路の復活(`plan/archive/bug-report.md`の
  廃止判断は変えない)
- リモートログ収集・外部サービスへの自動送信(`design/server-
  architecture.md` の原則1・3の範囲に収め、新しいサーバー機構は増やさない。
  Issue作成はこれまで通りプレイヤー(この場合は開発者自身)のブラウザ
  操作が起点)

## 未決事項

- `?debug=1` の代わりに、より発見されにくい別のトリガー(タップの回数
  等)にするか
- パネルの具体的なUI・表示項目
- consoleフックの実装方法(`console.error`を上書きするか、
  `window.addEventListener("error")`だけで足りるか)
