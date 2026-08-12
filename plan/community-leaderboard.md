# みんなの記録(非公式リーダーボード)

`design/server-architecture.md` のパターンの2つ目の適用例。
`plan/records-hall.md`(記録の間)・`plan/hidden-dungeon.md`(腕試しの間)・
`design/village-festivals.md`(樽比べ)は、いずれも「オンライン要素を
持たないため自分の過去記録との比較のみ」としていた。サーバーを用意した
ことで、この制限を**任意のオプトイン機能**として緩和する。

## 位置づけ

- 既存の自己ベスト表示(記録の間 等)は**そのまま変えない**。サーバーが
  無くても今まで通り遊べることを崩さない。
- 「みんなの記録に載せる」は、各画面に**追加のボタンを1つ足すだけ**の
  任意機能にする。押さなければ何も送信されない
  (`design/server-architecture.md` の原則2を踏襲)。
- `design/server-architecture.md` の基本パターン(プレイヤー自身の
  ブラウザがGitHub Issueを作る → ワークフローが処理する)をそのまま
  流用する。

## 対象にする記録

| 記録 | 出典 |
|---|---|
| 最速本編クリア・最深到達(表の寝穴/夜ごとの夢) | `plan/records-hall.md` |
| 腕試しの間のクリアタイム・被弾数 | `plan/hidden-dungeon.md` |
| 樽比べのスコア | `design/village-festivals.md` |

## 投稿の流れ

1. 記録の間などの画面で「みんなの記録に投稿する」を選ぶ。
2. `https://github.com/cyber-tribe/game/issues/new` に、記録の種類・
   数値・(任意で)名乗りたい名前を事前入力した状態で新しいタブを開く
   (`labels=leaderboard-submission` を付与)。プレイヤーが実際に投稿
   ボタンを押すかはプレイヤー次第(ゲームは開くところまでで完結する)。
3. `leaderboard-ingest.yml`(新規ワークフロー)が起動し、Issue本文の
   JSONを読み取って `leaderboard/*.json`(記録種別ごとのファイル)に
   追記コミットし、Issueには結果(何位相当か等)をコメントして自動で
   閉じる。詳細は次節。
4. 一覧は `leaderboard/*.json` を GitHub Pages 等で静的に読める形にする
   (閲覧側もサーバーを新設せず、リポジトリの中身をそのまま見せるだけ)。

## サーバー側の処理(GitHub Actions)

### 起動条件

```yaml
# .github/workflows/leaderboard-ingest.yml (新規)
on:
  issues:
    types: [opened]
permissions:
  issues: write
  contents: write   # leaderboard/*.json への追記コミットに使う
jobs:
  ingest:
    if: contains(github.event.issue.labels.*.name, 'leaderboard-submission')
    runs-on: ubuntu-latest
```

`leaderboard-submission` ラベルの無いIssueには反応しない。バグ報告
(`bug-report` ラベル)とは別ラベルにすることで、2つのワークフローが
互いに干渉しないようにする。

### 検証(自己申告制であることを踏まえた最低限のもの)

- `category` が `clearTime` `arenaTime` `tarukurabeScore` のいずれかで
  あること。
- `value` が数値で、カテゴリごとの現実的な範囲に収まっていること
  (例: `clearTime` は 0 〜 100時間相当の秒数、`tarukurabeScore` は
  `design/village-festivals.md` で定める理論上の満点以下)。範囲外なら
  弾く。
- `displayName` は最大20文字程度に切り詰め、制御文字・HTMLタグの類は
  取り除く(表示時の事故を防ぐだけの最低限の無害化。厳密な不正対策は
  行わない方針は変えない)。
- いずれかを満たさない場合は `needs-info` ラベルを付け、理由をコメント
  して打ち切る(コミット・クローズはしない)。

### 記録の更新

- `category` ごとに `leaderboard/<category>.json` を読み、新しい
  `LeaderboardEntry` を追加する。
- 並び順はカテゴリごとに決める: `clearTime` `arenaTime` は**小さいほど
  良い**(昇順)、`tarukurabeScore` は**大きいほど良い**(降順)。
- 上位50件だけを残し、それ以外は切り捨てる(ファイルが際限なく
  増え続けないようにする)。
- `git commit` して push する(`GITHUB_TOKEN` の `contents: write` で
  足りる。コミット者は `github-actions[bot]` を使う)。
- Issueには「暫定であなたの記録は第◯位です」(上位50件に入らなければ
  「今回は掲載圏外でした」)とコメントし、**Issueを閉じる**(バグ報告とは
  違い、投稿1回で完結する性質のため)。

### 他のワークフローとの関係

`leaderboard/*.json` への変更は `main` ブランチへのコミットになるため、
`plan/playtest-deployment.md` の `deploy-pages.yml`(`on: push: branches:
[main]`)を毎回追加で起動させることになる。ビルド自体は軽いため実害は
小さいと見て、当面は許容する(頻度が問題になれば、リーダーボード
専用のブランチに分離する等の対処を後から検討する)。

## 「非公式・参考記録」という位置づけ(重要)

自己申告制であり、`design/server-architecture.md` の限界(即時性が無い、
大量アクセスに向かない)もあるため、**この記録を実績・報酬・進行条件
などのゲームプレイに一切連動させない**。あくまで「参考に載せる」だけの
掲示板であり、改ざん・不正な値を弾き切れない前提で設計する
(`design/balance-philosophy.md` のパワーバジェット方針にも、
検証できない外部入力を紐づけない、という一致した理由がある)。

- ワークフロー側で明らかにあり得ない値(例: 負のクリアタイム、
  存在しない地方名)は弾いて `needs-info` ラベルを付ける程度の
  簡易検証に留める。
- 名乗る名前は任意の自由入力とし、実名・連絡先の入力は求めない。
  投稿すれば公開されることは、ボタンの文言・遷移先で隠さず示す。

## データ構造

```ts
export interface LeaderboardEntry {
  category: "clearTime" | "arenaTime" | "tarukurabeScore";
  value: number;
  displayName?: string;
  submittedAt: string;
}
```

`leaderboard/*.json` はカテゴリごとに配列を持ち、上位50件だけを残す
(前節「記録の更新」で確定済み)。

## 未決事項

- 一覧の閲覧手段(GitHub Pagesを新設するか、リポジトリの
  `leaderboard/*.json` を直接見てもらうだけに留めるか)
- 同点の扱い(先着順に並べる、程度の単純な規則で足りるか)
- カテゴリごとの妥当な値の範囲(`clearTime`の上限時間、
  `tarukurabeScore`の理論上の満点)の具体値
- なりすまし対策をどこまでやるか(現時点では「参考記録」という位置づけ
  で割り切り、厳密な対策は行わない方針)
