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
- `plan/bug-report.md` と同じ「プレイヤー自身のブラウザがGitHub Issueを
  作る → ワークフローが処理する」という流れをそのまま流用する。

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
   ボタンを押すかはプレイヤー次第(`plan/bug-report.md` と同じ、
   ゲームは開くところまで)。
3. `leaderboard-ingest.yml`(新規ワークフロー)が起動し、Issue本文の
   JSONを読み取って `leaderboard/*.json`(記録種別ごとのファイル)に
   追記コミットし、Issueには結果(何位相当か等)をコメントして自動で
   閉じる。
4. 一覧は `leaderboard/*.json` を GitHub Pages 等で静的に読める形にする
   (閲覧側もサーバーを新設せず、リポジトリの中身をそのまま見せるだけ)。

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
  投稿すれば公開されることは、`plan/bug-report.md` と同じくボタンの
  文言・遷移先で隠さず示す。

## データ構造

```ts
export interface LeaderboardEntry {
  category: "clearTime" | "arenaTime" | "tarukurabeScore";
  value: number;
  displayName?: string;
  submittedAt: string;
}
```

`leaderboard/*.json` はカテゴリごとに配列を持ち、ワークフローが
上位N件だけを残す(際限なく増え続けないようにする)形にしてもよい。

## 未決事項

- 一覧の閲覧手段(GitHub Pagesを新設するか、リポジトリの
  `leaderboard/*.json` を直接見てもらうだけに留めるか)
- 上位何件を残すか、同点の扱い
- なりすまし対策をどこまでやるか(現時点では「参考記録」という位置づけ
  で割り切り、厳密な対策は行わない方針)
