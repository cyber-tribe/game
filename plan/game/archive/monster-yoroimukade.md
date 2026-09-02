> **実装済み(コード変更なし)。** `src/entities/species.ts`の`id:
> "yoroimukade"`エントリを確認し、本文書のデータ表(AI/maxHp/atk/def/
> exp/weight/出現階/seal付与)がすべて一致することを確認した。本文書
> 自体は追加のコード変更を要求していないため、記録としてそのまま
> アーカイブする。

# ヨロイムカデ(yoroimukade)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/models/archive/model-yoroimukade.md`で別途扱う)。

## 位置づけ

第4地方(骨積みの回廊)・通常出現。出現階19〜(seal20% 3turn)。

## 由来

積み重なって固まった記憶。通路をふさぐように居座り、噛みつかれると道具が封じられる。思い出に囚われて身動きが取れなくなる感覚を表している。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `guard` |
| maxHp / atk / def | 48 / 20 / 16 |
| exp | 38 |
| 出現weight | 4 |
| 備考 | 出現階19〜(seal20% 3turn) |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
