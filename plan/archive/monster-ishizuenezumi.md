> **実装済み(コード変更なし)。** `src/entities/species.ts`の`id:
> "ishizuenezumi"`エントリを確認し、本文書のデータ表(AI/maxHp/atk/def/
> exp/weight/配合元)がすべて一致することを検証した。差分なし(`weight:
> 0`・`minFloor: Number.POSITIVE_INFINITY`は配合限定で野生出現しないため
> の値で、本文書の「配合限定」という位置づけと整合している)。本文書は
> コードを伴わない記録用の文書のため、追加の実装は行わない。

# いしずえねずみ(ishizuenezumi)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/model-ishizuenezumi.md`で別途扱う)。

## 位置づけ

第1地方(うたたねの参道)・配合限定。ガジリねずみ+ホネガラミの成熟。

## 由来

小さな不安が、古い記憶の頑固さと何度も寄り添ううちに、不安を乗り越えて動じない性格に育った姿。すぐ逃げていた性格から、その場を固める性格へと変わっている。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `guard` |
| maxHp / atk / def | 24 / 11 / 9 |
| exp | 20 |
| 出現weight | 0 |
| 備考 | ガジリねずみ+ホネガラミの成熟 |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
