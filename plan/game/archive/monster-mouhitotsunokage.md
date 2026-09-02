> **実装済み(コード変更なし)。** `src/entities/species.ts`の`id:
> "mouhitotsunokage"`エントリを確認し、本文書のデータ表(AI/maxHp/atk/def/exp/
> weight/備考)がすべて一致することを検証した。差分なし。本文書はコード
> を伴わない記録用の文書のため、追加の実装は行わない。

# もうひとつのかげ(mouhitotsunokage)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/models/archive/model-mouhitotsunokage.md`で別途扱う)。

## 位置づけ

第8地方(めざめの前庭)・通常出現。出現階45〜、アイテムに擬態。

## 由来

ゆめまよいの影のもう一つの姿。タルではなく、落ちている道具に擬態する。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `mimic` |
| maxHp / atk / def | 48 / 29 / 15 |
| exp | 62 |
| 出現weight | 3 |
| 備考 | 出現階45〜、アイテムに擬態 |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
