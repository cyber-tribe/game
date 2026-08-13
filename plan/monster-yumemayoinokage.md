# ゆめまよいの影(yumemayoinokage)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/model-yumemayoinokage.md`で別途扱う)。

## 位置づけ

第8地方(めざめの前庭)・通常出現。出現階43〜、タルに擬態。

## 由来

主を見失った夢。タルに擬態しており、持ち上げる、または投げるまで見分けがつかない。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `mimic` |
| maxHp / atk / def | 46 / 28 / 14 |
| exp | 60 |
| 出現weight | 4 |
| 備考 | 出現階43〜、タルに擬態 |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
