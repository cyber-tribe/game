# やぐらもり(yaguramori)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/model-yaguramori.md`で別途扱う)。

## 位置づけ

第7地方(わすれられた祭りの跡)・通常出現。出現階38〜、range5。

## 由来

祭りの櫓に住み着いた古い霊。見世物のぬしの手先として、高い場所から矢のような一撃を放つ。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `ranged` |
| maxHp / atk / def | 36 / 22 / 10 |
| exp | 44 |
| 出現weight | 3 |
| 備考 | 出現階38〜、range5 |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
