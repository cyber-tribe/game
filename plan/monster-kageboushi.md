# かげぼうし(kageboushi)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/model-kageboushi.md`で別途扱う)。

## 位置づけ

第7地方(わすれられた祭りの跡)・通常出現。出現階37〜(sleep20% 3turn)。

## 由来

祭りの影絵芝居の忘れ物。めんかぶりこぞうと同系統の奇襲役だが、混乱の代わりに眠りを誘う。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `ambush` |
| maxHp / atk / def | 38 / 24 / 10 |
| exp | 48 |
| 出現weight | 4 |
| 備考 | 出現階37〜(sleep20% 3turn) |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
