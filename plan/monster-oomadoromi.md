# オオマドロミ(oomadoromi)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/model-oomadoromi.md`で別途扱う)。

## 位置づけ

第3地方(まどろみの茸林)・地方ボス。第三地方ボス。

## 由来

マドロミダケが煮詰まりにまで煮詰まった、眠気そのものの化身。ヨリシロという存在の核にとりわけ近い夢で、この地方の主として茸林の奥深くに根を張る。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `melee` |
| maxHp / atk / def | 82 / 22 / 12 |
| exp | 65 |
| 出現weight | 0 |
| 備考 | 第三地方ボス |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
