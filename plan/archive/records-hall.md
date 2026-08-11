# 記録の間

> **実装済み。** `src/save.ts`(`SaveData.records`(`DiveRecords`)、
> `recordRun`のdefeats/captures引数)・`src/core/events.ts`(`die`
> イベントへの`kind`追加)・`src/game.ts`(`killActor`が`kind`を乗せる)・
> `src/main.ts`(ダイブ中の`diveDefeats`/`diveCaptures`集計、`finish()`で
> `recordRun`へ渡す)・`src/ui/town.ts`(`TownScreen`の7列目「記録の間」、
> カーソル移動の無い一覧表示)。テストは `tests/records-hall.test.ts`。
>
> 実装したのは以下の6項目。
> - 最深到達(表の寝穴)・累計ダイブ回数・踏破回数・全滅回数は、
>   既存の`SaveData.deepest`/`runs`/`clears`をそのまま流用した
>   (`全滅回数 = runs - clears`)。新規フィールドは追加していない。
> - 累計撃破数・のべ捕獲数だけが真に新しい集計で、`SaveData.records`
>   (`totalDefeats`/`totalCaptures`)に持たせた。全滅した回でも
>   失わずに積み上がる(`design/balance-philosophy.md`の「記録は
>   ロストしない」原則どおり)。
>
> 以下の項目は、対応する機能自体が未実装のため見送った。実装時にそれぞれの
> 機能側のSaveDataフィールドから`renderRecords`に1行足すだけで拡張できる。
> - 最速本編クリア(`design/story.md`)
> - 夜ごとの夢・自己ベスト(`plan/multiple-dungeons.md`)
> - 腕試しの間・自己ベスト、樽比べ・自己ベスト(`plan/hidden-dungeon.md`
>   `design/village-festivals.md`)
> - もっとも連れ添った仲間(`plan/companion-naming.md` — 同伴ダイブ数の
>   個体別カウントが必要で、現状は仲間の当該情報を持たない)
>
> UIは独立画面ではなく、`TownScreen`の既存6列(倉庫〜ゲンドの工房)に
> 7列目として追加した(`plan/equipment-forging.md`と同じ増築パターン)。

`plan/achievements.md` の実績は「達成したか・していないか」の二値だった。
ここでは対になる要素として、**遊ぶほど伸びていく数値記録**を一覧できる
「記録の間」を拠点に追加する。実績が「節目」を示すのに対し、記録の間は
「積み重ね」を見せる場所として役割を分ける。

## 実績との違い

| | 実績(`plan/achievements.md`) | 記録の間(本文書) |
|---|---|---|
| 性質 | 達成/未達成の二値 | 継続的に更新される数値 |
| 見せ方 | 一覧+称号 | ランキング風の自己ベスト表示 |
| 目的 | 「これをやった」という節目 | 「ここまで積み上げた」という実感 |

## 記録項目(初期案)

| 記録 | 内容 |
|---|---|
| 最速本編クリア | 序章〜終章(`design/story.md`)にかかった実時間の自己ベスト |
| 最深到達(表の寝穴) | 到達した最も深い階(既存の `SaveData.deepest` を流用) |
| 夜ごとの夢・自己ベスト | `plan/multiple-dungeons.md` の④の到達階・撃破数 |
| 腕試しの間・自己ベスト | `plan/hidden-dungeon.md` のクリアタイム・被弾数 |
| 樽比べ・自己ベスト | `design/village-festivals.md` のスコア |
| 累計ダイブ回数 | 拠点から出発した回数の総計 |
| 累計撃破数 | 倒したモンスターの総数 |
| のべ捕獲数 | タルで捕まえた回数の総計(夢に還した分も含む) |
| もっとも連れ添った仲間 | `plan/companion-naming.md` で名付けた仲間のうち、同伴ダイブ数が最も多い個体 |
| 全滅回数 | あえて隠さず表示する。「ここまで頑張ってきた証」というポジティブな見せ方にする(`design/balance-philosophy.md` の素朴で温かいトーンに合わせ、失敗を恥として扱わない) |

## 表示方針

- 数値は伸びていく一方で、下がることはない(全滅回数のような「増える
  ことが悪いわけではない」記録も含めて、すべて前向きな蓄積として扱う)。
- ランキングは**自分の過去記録との比較のみ**とする。オンライン要素を
  持たないゲーム(README・`design/localization.md` 参照)であるため、
  他プレイヤーとの比較機能は作らない。
- `plan/gallery-mode.md` の隣に置き、「見て楽しむ」系のコンテンツ群
  としてまとめる。

## データ構造

```ts
export interface SaveData {
  // ...既存フィールド
  records: {
    fastestClearSeconds?: number;
    totalDives: number;
    totalDefeats: number;
    totalCaptures: number;
    totalFaints: number;
    // 夜ごとの夢・腕試しの間・樽比べの自己ベストは、それぞれの機能側の
    // SaveDataフィールド(既存 or 別途定義)をそのまま参照する
  };
}
```

新規に集計処理を増やすのではなく、既存のイベント発生箇所(撃破・捕獲・
出発・全滅の各 `GameEvent`)のたびに該当カウンタを1つ増やすだけで
実装できる。

## バランス上の注意

- 記録の間は完全な閲覧機能であり、**攻略・数値強化には一切関与しない**
  (`design/balance-philosophy.md` のパワーバジェット対象外)。
- 「もっとも連れ添った仲間」のような記録が、`plan/release-companion.md`
  で夢に還した個体を消してよいかの判断材料になる(愛着の可視化)。

## 未決事項

- 記録項目の最終的な絞り込み(増やしすぎて一覧が読みにくくならないか)
- 「最速本編クリア」の計測開始・終了のタイミング(セーブ枠作成時から
  終章到達まで、等の厳密な定義)
