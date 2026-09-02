> **実装済み(コード変更なし)。** `src/entities/species.ts`の`id:
> "surigarasu"`エントリを確認し、本文書のデータ表(AI/maxHp/atk/def/exp/
> weight/出現階)がすべて一致することを確認した。本文書自体は追加の
> コード変更を要求していないため、記録としてそのままアーカイブする。

# スリガラス(surigarasu)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/models/archive/model-surigarasu.md`で別途扱う)。

## 位置づけ

第1地方(うたたねの参道)・通常出現。出現階5〜。

## 由来

ヨリシロがふと目についたものを持っていきたくなる、他愛のない衝動が形になったもの。カラスに似た姿で、近づいて所持金をかすめ取るとすぐ飛び去る。悪意ではなく、光るものに気を取られるだけの罪のない衝動。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `thief` |
| maxHp / atk / def | 8 / 4 / 1 |
| exp | 10 |
| 出現weight | 4 |
| 備考 | 出現階5〜 |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
