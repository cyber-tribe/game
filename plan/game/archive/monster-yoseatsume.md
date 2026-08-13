> **実装済み(コード変更なし)。** `src/entities/species.ts`の`id:
> "yoseatsume"`エントリを確認し、本文書のデータ表(AI/maxHp/atk/def/exp/
> weight/出現階/swarmSize)がすべて一致することを検証した。差分なし。
> 本文書はコードを伴わない記録用の文書のため、追加の実装は行わない。

# よせあつめ(yoseatsume)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/models/model-yoseatsume.md`で別途扱う)。

## 位置づけ

第8地方(めざめの前庭)・通常出現。出現階43〜(swarmSize 3-4)。

## 由来

様々な地方の残響が寄り集まった群れ。1体1体の由来がバラバラなまま、なんとなく群れをなしている。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `swarm` |
| maxHp / atk / def | 24 / 20 / 8 |
| exp | 40 |
| 出現weight | 3 |
| 備考 | 出現階43〜(swarmSize 3-4) |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
