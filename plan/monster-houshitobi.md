# ほうしとび(houshitobi)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/model-houshitobi.md`で別途扱う)。

## 位置づけ

第3地方(まどろみの茸林)・通常出現。出現階14〜、range4(sleep15% 3turn)。

## 由来

舞い散る胞子の化身。遠くから胞子を飛ばして眠りを誘う、マドロミダケの遠隔版というべき存在。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `ranged` |
| maxHp / atk / def | 20 / 14 / 5 |
| exp | 20 |
| 出現weight | 4 |
| 備考 | 出現階14〜、range4(sleep15% 3turn) |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
