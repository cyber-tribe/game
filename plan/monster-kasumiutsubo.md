# かすみウツボ(kasumiutsubo)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/model-kasumiutsubo.md`で別途扱う)。

## 位置づけ

第2地方(忘れ潮の湿地)・配合限定。モヤウツボ+ワスレガニの成熟(回避15%)。

## 由来

忘れるというテーマをさらに煮詰めた結果、存在感そのものが薄れ、相手の攻撃をかすめて避けやすくなった姿。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `ambush` |
| maxHp / atk / def | 42 / 19 / 9 |
| exp | 32 |
| 出現weight | 0 |
| 備考 | モヤウツボ+ワスレガニの成熟(回避15%) |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
