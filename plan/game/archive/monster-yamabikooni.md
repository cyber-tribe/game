> **実装済み(コード変更なし)。** `src/entities/species.ts`の`id:
> "yamabikooni"`エントリを確認し、本文書のデータ表(AI/maxHp/atk/def/exp/
> weight/出現階)がすべて一致することを検証した。差分なし。本文書はコード
> を伴わない記録用の文書のため、追加の実装は行わない。

# やまびこおに(yamabikooni)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/models/model-yamabikooni.md`で別途扱う)。

## 位置づけ

第6地方(こだまの尾根)・通常出現。出現階32〜。

## 由来

声そのものが実体化した鬼。やまびこぎつねの呼び声に応じて現れる、尾根の奥にひそむ力の強い個体。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `melee` |
| maxHp / atk / def | 52 / 28 / 14 |
| exp | 50 |
| 出現weight | 3 |
| 備考 | 出現階32〜 |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
