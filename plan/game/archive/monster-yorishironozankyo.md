> **実装済み(コード変更なし)。** `src/entities/species.ts`の`id:
> "yorishironozankyo"`エントリを確認し、本文書のデータ表(AI/maxHp/atk/
> def/exp/weight/出現階)がすべて一致することを検証した。差分なし。本文書
> はコードを伴わない記録用の文書のため、追加の実装は行わない。

# ヨリシロの残響(yorishironozankyo)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/models/model-yorishironozankyo.md`で別途扱う)。

## 位置づけ

第8地方(めざめの前庭)・通常出現。出現階43〜、出現weight1(激レア)。

## 由来

ヨリシロ自身の記憶そのもの。出現率は極めて低いが、他のどの種族よりHP・攻撃・防御が高く、物語終盤にふさわしい存在感を放つ。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `melee` |
| maxHp / atk / def | 160 / 45 / 32 |
| exp | 150 |
| 出現weight | 1 |
| 備考 | 出現階43〜、出現weight1(激レア) |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
