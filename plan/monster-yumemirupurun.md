# ゆめみるぷるん(yumemirupurun)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/model-yumemirupurun.md`で別途扱う)。

## 位置づけ

第1地方(うたたねの参道)・配合限定。ぷるん+マドロミダケの成熟(sleep25% 3turn)。

## 由来

まどろみの余韻に眠気そのものが混ざり込み、攻撃に眠りを乗せるようになった姿。同じぷるんから出発しても、寄り添う相手しだいで別の夢に育つ。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `melee` |
| maxHp / atk / def | 20 / 9 / 4 |
| exp | 18 |
| 出現weight | 0 |
| 備考 | ぷるん+マドロミダケの成熟(sleep25% 3turn) |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
