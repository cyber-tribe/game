> **実装済み(コード変更なし)。** `src/entities/species.ts`の`id:
> "kageboushi"`エントリを確認し、本文書のデータ表(AI/maxHp/atk/def/exp/
> weight/備考)がすべて一致することを検証した(sleep20% 3turnは
> `inflicts: { kind: "sleep", chance: 0.2, turns: 3 }`に対応)。差分なし。
> 本文書はコードを伴わない記録用の文書のため、追加の実装は行わない。

# かげぼうし(kageboushi)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/models/model-kageboushi.md`で別途扱う)。

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
