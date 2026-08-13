> **実装済み(コード変更なし)。** `src/entities/species.ts`の`id:
> "moyautsubo"`エントリを確認し、本文書のデータ表(AI/maxHp/atk/def/exp/
> weight/出現階)がすべて一致することを検証した。差分なし。本文書はコード
> を伴わない記録用の文書のため、追加の実装は行わない。

# モヤウツボ(moyautsubo)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/models/model-moyautsubo.md`で別途扱う)。

## 位置づけ

第2地方(忘れ潮の湿地)・通常出現。出現階7〜。

## 由来

霧に紛れた油断が形になったもの。隣接するまで気配を消し、油断したところへ初撃を強く叩き込む。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `ambush` |
| maxHp / atk / def | 24 / 15 / 6 |
| exp | 22 |
| 出現weight | 5 |
| 備考 | 出現階7〜 |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
