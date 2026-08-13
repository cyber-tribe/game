> **実装済み(コード変更なし)。** `src/entities/species.ts`の`id:
> "honedatami"`エントリを確認し、本文書のデータ表(AI/maxHp/atk/def/exp/
> weight/出現階)がすべて一致することを検証した。差分なし。本文書は
> コードを伴わない記録用の文書のため、追加の実装は行わない。

# ホネダタミ(honedatami)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/model-honedatami.md`で別途扱う)。

## 位置づけ

第4地方(骨積みの回廊)・通常出現。出現階19〜。

## 由来

積み重なった記憶の重みそのもの。通路の真ん中に居座り、道をふさいでどかない。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `guard` |
| maxHp / atk / def | 56 / 22 / 20 |
| exp | 42 |
| 出現weight | 4 |
| 備考 | 出現階19〜 |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
