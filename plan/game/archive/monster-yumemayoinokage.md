> **実装済み(コード変更なし)。** `src/entities/species.ts`の`id:
> "yumemayoinokage"`エントリを確認し、本文書のデータ表(AI/maxHp/atk/def/
> exp/weight/出現階/タルへの擬態)がすべて一致することを検証した
> (`ai: "mimic"`、`mimicAs: "barrel"`)。差分なし。なお同エントリのコード
> コメントには、タルへの擬態は`mimicAs: "barrel"`というデータ上の設定に
> 留め、専用の見た目までは再現していない(既存モデルの流用)旨の注記が
> あるが、これは3Dモデル面の実装範囲の話であり、本文書のデータ表(AI/
> maxHp/atk/def/exp/weight/出現階)そのものに食い違いはない。本文書は
> コードを伴わない記録用の文書のため、追加の実装は行わない。

# ゆめまよいの影(yumemayoinokage)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/models/model-yumemayoinokage.md`で別途扱う)。

## 位置づけ

第8地方(めざめの前庭)・通常出現。出現階43〜、タルに擬態。

## 由来

主を見失った夢。タルに擬態しており、持ち上げる、または投げるまで見分けがつかない。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `mimic` |
| maxHp / atk / def | 46 / 28 / 14 |
| exp | 60 |
| 出現weight | 4 |
| 備考 | 出現階43〜、タルに擬態 |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
