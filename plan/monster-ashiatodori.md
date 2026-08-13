# あしあとどり(ashiatodori)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/model-ashiatodori.md`で別途扱う)。

## 位置づけ

第2地方(忘れ潮の湿地)・通常出現。出現階7〜(swarmSize 3-4)。

## 由来

消えていく足跡を追いかける鳥。1羽では頼りないが、いくつもの足跡につられて群れで現れる。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `swarm` |
| maxHp / atk / def | 10 / 8 / 2 |
| exp | 8 |
| 出現weight | 5 |
| 備考 | 出現階7〜(swarmSize 3-4) |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
