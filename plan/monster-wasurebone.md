# わすれぼね(wasurebone)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/model-wasurebone.md`で別途扱う)。

## 位置づけ

第4地方(骨積みの回廊)・通常出現。出現階19〜。

## 由来

誰のものかも忘れられた骨。1体では非力だが、倒されると周りの骨系のモンスターを奮い立たせる。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `coward` |
| maxHp / atk / def | 24 / 14 / 8 |
| exp | 26 |
| 出現weight | 4 |
| 備考 | 出現階19〜 |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
