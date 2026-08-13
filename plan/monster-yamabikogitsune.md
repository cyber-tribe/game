# やまびこぎつね(yamabikogitsune)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/model-yamabikogitsune.md`で別途扱う)。

## 位置づけ

第6地方(こだまの尾根)・通常出現。出現階31〜、range5、視認で全体に警戒。

## 由来

響いて返ってくる声そのもの。プレイヤーを見つけた瞬間、その声が尾根中に響き渡り、他のモンスターにまで気づかせてしまう。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `ranged` |
| maxHp / atk / def | 40 / 24 / 10 |
| exp | 46 |
| 出現weight | 4 |
| 備考 | 出現階31〜、range5、視認で全体に警戒 |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
