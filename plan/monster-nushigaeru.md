# ヌシガエル(nushigaeru)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/model-nushigaeru.md`で別途扱う)。

## 位置づけ

第2地方(忘れ潮の湿地)・地方ボス。第二地方ボス、range4。

## 由来

ツブテガエルがこの霧深い湿地でたどり着いた、最も濃く重たい遠い記憶の姿。並より一回り大きな図体から石つぶてを飛ばし、この地方の主として湿地の奥に居座る。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `ranged` |
| maxHp / atk / def | 68 / 20 / 8 |
| exp | 55 |
| 出現weight | 0 |
| 備考 | 第二地方ボス、range4 |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
