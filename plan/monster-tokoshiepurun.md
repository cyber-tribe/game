# とこしえのぷるん(tokoshiepurun)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/model-tokoshiepurun.md`で別途扱う)。

## 位置づけ

第1地方(うたたねの参道)・配合限定。ぷるん同士の成熟。

## 由来

まどろみの余韻を重ねすぎた結果、被弾を和らげる性質が常に発動するようになった姿。姿はぷるんのままだが、揺るぎなさだけが増している。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `melee` |
| maxHp / atk / def | 22 / 9 / 6 |
| exp | 18 |
| 出現weight | 0 |
| 備考 | ぷるん同士の成熟 |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
