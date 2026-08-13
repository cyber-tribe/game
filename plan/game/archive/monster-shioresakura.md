> **実装済み(コード変更なし)。** `src/entities/species.ts`の`id:
> "shioresakura"`エントリを確認し、本文書のデータ表(AI/maxHp/atk/def/exp/
> weight/備考)がすべて一致することを検証した。差分なし。本文書はコード
> を伴わない記録用の文書のため、追加の実装は行わない。

# しおれざくら(shioresakura)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/models/model-shioresakura.md`で別途扱う)。

## 位置づけ

第5地方(なみだの滝つぼ)・通常出現。出現階26〜、瀕死で攻撃力+最大30%。

## 由来

涙で色あせた花。打たれるたびに力を失っていくが、散り際にだけ最後の力を振り絞る。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `melee` |
| maxHp / atk / def | 30 / 18 / 6 |
| exp | 28 |
| 出現weight | 4 |
| 備考 | 出現階26〜、瀕死で攻撃力+最大30% |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
