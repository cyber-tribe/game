> **実装済み(コード変更なし)。** `src/entities/species.ts`の`id:
> "menkaburikozo"`エントリを確認し、本文書のデータ表(AI/maxHp/atk/def/exp/
> weight/備考)がすべて一致することを検証した。差分なし。本文書はコード
> を伴わない記録用の文書のため、追加の実装は行わない。

# めんかぶりこぞう(menkaburikozo)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/model-menkaburikozo.md`で別途扱う)。

## 位置づけ

第7地方(わすれられた祭りの跡)・通常出現。出現階37〜(confuse25% 3turn)。

## 由来

出し物の陰に潜む悪戯。隣接するまで気配を消し、不意打ちが決まると相手を混乱させる。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `ambush` |
| maxHp / atk / def | 42 / 26 / 12 |
| exp | 52 |
| 出現weight | 4 |
| 備考 | 出現階37〜(confuse25% 3turn) |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
