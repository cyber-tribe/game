# よせあつめ(yoseatsume)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/model-yoseatsume.md`で別途扱う)。

## 位置づけ

第8地方(めざめの前庭)・通常出現。出現階43〜(swarmSize 3-4)。

## 由来

様々な地方の残響が寄り集まった群れ。1体1体の由来がバラバラなまま、なんとなく群れをなしている。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `swarm` |
| maxHp / atk / def | 24 / 20 / 8 |
| exp | 40 |
| 出現weight | 3 |
| 備考 | 出現階43〜(swarmSize 3-4) |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
