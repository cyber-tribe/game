> **実装済み(コード変更なし)。** `src/entities/species.ts`の`id:
> "namidaguma"`エントリを確認し、本文書のデータ表(AI/maxHp/atk/def/exp/
> weight/備考)がすべて一致することを検証した。差分なし。本文書はコード
> を伴わない記録用の文書のため、追加の実装は行わない。

# なみだぐま(namidaguma)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/models/archive/model-namidaguma.md`で別途扱う)。

## 位置づけ

第5地方(なみだの滝つぼ)・配合限定。しずくうお+うるみぐまの成熟、瀕死で攻撃力+最大50%。

## 由来

HPが減るほど攻撃力が上がる姿。こらえきれずにこぼれた涙が、そのまま底力に変わる。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `melee` |
| maxHp / atk / def | 36 / 21 / 9 |
| exp | 32 |
| 出現weight | 0 |
| 備考 | しずくうお+うるみぐまの成熟、瀕死で攻撃力+最大50% |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
