> **実装済み(コード変更なし)。** `src/entities/species.ts`の`id:
> "kaerukodama"`エントリを確認し、本文書のデータ表(AI/maxHp/atk/def/exp/
> weight/備考)がすべて一致することを検証した(反撃20%は
> `counterDamageRatio: 0.2`に対応)。差分なし。本文書はコードを伴わない
> 記録用の文書のため、追加の実装は行わない。

# かえるこだま(kaerukodama)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/model-kaerukodama.md`で別途扱う)。

## 位置づけ

第6地方(こだまの尾根)・通常出現。出現階31〜、反撃20%。

## 由来

跳ね返る声を追いかける小さな生き物。気配に敏感ですぐ逃げるが、追い詰められると跳ねて反撃する。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `coward` |
| maxHp / atk / def | 30 / 17 / 8 |
| exp | 28 |
| 出現weight | 4 |
| 備考 | 出現階31〜、反撃20% |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
