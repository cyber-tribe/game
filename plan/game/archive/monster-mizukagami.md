> **実装済み(コード変更なし)。** `src/entities/species.ts`の`id:
> "mizukagami"`エントリを確認し、本文書のデータ表(AI/maxHp/atk/def/exp/
> weight/出現階/mimicAs)がすべて一致することを検証した。差分なし。本文書
> はコードを伴わない記録用の文書のため、追加の実装は行わない。

# みずかがみ(mizukagami)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/models/model-mizukagami.md`で別途扱う)。

## 位置づけ

第5地方(なみだの滝つぼ)・通常出現。出現階27〜、アイテムに擬態。

## 由来

滝つぼの水面に映る古い姿。道具に化けて息をひそめる、この地方ならではの水辺の擬態。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `mimic` |
| maxHp / atk / def | 34 / 20 / 9 |
| exp | 30 |
| 出現weight | 3 |
| 備考 | 出現階27〜、アイテムに擬態 |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
