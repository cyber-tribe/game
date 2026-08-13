# こだまうさぎ(kodamausagi)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/model-kodamausagi.md`で別途扱う)。

## 位置づけ

第6地方(こだまの尾根)・通常出現。出現階31〜(swarmSize 3-4)。

## 由来

繰り返す木霊。1匹の声が響きあってこだまするように、群れで現れる。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `swarm` |
| maxHp / atk / def | 22 / 18 / 8 |
| exp | 24 |
| 出現weight | 4 |
| 備考 | 出現階31〜(swarmSize 3-4) |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
