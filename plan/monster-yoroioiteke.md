# ヨロイオイテケ(yoroioiteke)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/model-yoroioiteke.md`で別途扱う)。

## 位置づけ

第4地方(骨積みの回廊)・配合限定。ヨロイムカデ+オイテケボシの成熟(反撃25%)。

## 由来

防御が上がり、被弾のたびに相手の満腹度を削り返すようになった姿。置いていかれる恐れそのものを鎧に変えた。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `guard` |
| maxHp / atk / def | 72 / 24 / 22 |
| exp | 54 |
| 出現weight | 0 |
| 備考 | ヨロイムカデ+オイテケボシの成熟(反撃25%) |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
