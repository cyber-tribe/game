# こだまぐも(kodamagumo)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/model-kodamagumo.md`で別途扱う)。

## 位置づけ

第6地方(こだまの尾根)・通常出現。出現階31〜(swarmSize 3-4)。

## 由来

響きに寄ってくる、雲のような群れ。こだまうさぎと同じく、音に惹かれて群がる。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `swarm` |
| maxHp / atk / def | 16 / 15 / 6 |
| exp | 20 |
| 出現weight | 4 |
| 備考 | 出現階31〜(swarmSize 3-4) |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
