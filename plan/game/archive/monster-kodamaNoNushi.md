> **実装済み(コード変更なし)。** `src/entities/species.ts`の`id:
> "kodamaNoNushi"`エントリを確認し、本文書のデータ表(AI/maxHp/atk/def/exp/
> weight/備考)がすべて一致することを検証した。差分なし。本文書はコード
> を伴わない記録用の文書のため、追加の実装は行わない。

# こだまの主(kodamaNoNushi)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/models/archive/model-kodamaNoNushi.md`で別途扱う)。

## 位置づけ

第6地方(こだまの尾根)・地方ボス。第六地方ボス。

## 由来

尾根じゅうに響いてきた無数のこだまが、ひとつに重なり合って生まれた姿。地方の主として、絶えず響き続ける尾根の中心に立つ。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `melee` |
| maxHp / atk / def | 76 / 31 / 13 |
| exp | 95 |
| 出現weight | 0 |
| 備考 | 第六地方ボス |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
