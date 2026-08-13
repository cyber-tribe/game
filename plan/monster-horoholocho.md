# ホロホロチョウ(horoholocho)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/model-horoholocho.md`で別途扱う)。

## 位置づけ

第3地方(まどろみの茸林)・通常出現。出現階13〜(swarmSize 3-4)。

## 由来

ちぎれた微睡みの欠片。1羽ずつは非力だが、微睡みが積み重なるように群れで現れる。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `swarm` |
| maxHp / atk / def | 14 / 12 / 4 |
| exp | 14 |
| 出現weight | 4 |
| 備考 | 出現階13〜(swarmSize 3-4) |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
