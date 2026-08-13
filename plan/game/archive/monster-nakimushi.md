> **実装済み(コード変更なし)。** `src/entities/species.ts`の`id:
> "nakimushi"`エントリを確認し、本文書のデータ表(AI/maxHp/atk/def/exp/
> weight/出現階/swarmSize)がすべて一致することを検証した。差分なし。
> なお由来文にある「仲間が倒されるたびに残ったものの声が大きくなる」
> (群れ内連携でのatk上昇)は実装されておらず、素の`swarm`挙動のみ
> (`species.ts`のコード注記にも明記されている)。ただしこれは新たな
> 不一致ではなく、`plan/archive/monster-roster-expansion-species.md`側の
> アーカイブノートで「群れ内連携は実装しなかった」と既に検討済み・
> 記録済みの簡略化のため、本文書では追加の指摘はしない。本文書自体は
> コードを伴わない記録用の文書のため、追加の実装は行わない。

# なきむし(nakimushi)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/models/model-nakimushi.md`で別途扱う)。

## 位置づけ

第5地方(なみだの滝つぼ)・通常出現。出現階25〜(swarmSize 3-4)。

## 由来

泣きやまない小さな夢。群れで現れ、仲間が倒されるたびに、残ったものの声がいっそう大きくなる。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `swarm` |
| maxHp / atk / def | 16 / 13 / 5 |
| exp | 18 |
| 出現weight | 4 |
| 備考 | 出現階25〜(swarmSize 3-4) |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
