> **実装済み(コード変更なし)。** `src/entities/species.ts`の`id:
> "madoromigumo"`エントリを確認し、本文書のデータ表(AI/maxHp/atk/def/exp/
> weight/出現階)がすべて一致することを検証した。差分なし。本文書はコード
> を伴わない記録用の文書のため、追加の実装は行わない。

# まどろみぐも(madoromigumo)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/models/model-madoromigumo.md`で別途扱う)。

## 位置づけ

第3地方(まどろみの茸林)・通常出現。出現階14〜。

## 由来

まどろみの隙間に糸を張る蜘蛛。隣接するまで気配を消し、油断したところに噛みつく。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `ambush` |
| maxHp / atk / def | 26 / 17 / 7 |
| exp | 26 |
| 出現weight | 4 |
| 備考 | 出現階14〜 |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
