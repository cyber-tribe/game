> **実装済み(コード変更なし)。** `src/entities/species.ts`の`id:
> "mabutamushi"`エントリを確認し、本文書のデータ表(AI/maxHp/atk/def/exp/
> weight/出現階/swarmSize)がすべて一致することを検証した。差分なし。
> 本文書はコードを伴わない記録用の文書のため、追加の実装は行わない。

# まぶたむし(mabutamushi)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/models/archive/model-mabutamushi.md`で別途扱う)。

## 位置づけ

第1地方(うたたねの参道)・通常出現。出現階2〜(swarmSize 2-3)。

## 由来

閉じかけた瞼の隙間に湧く小さな夢。1匹1匹はか弱いが、まばたきのたびに湧いて出るように群れる。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `swarm` |
| maxHp / atk / def | 5 / 3 / 0 |
| exp | 3 |
| 出現weight | 6 |
| 備考 | 出現階2〜(swarmSize 2-3) |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
