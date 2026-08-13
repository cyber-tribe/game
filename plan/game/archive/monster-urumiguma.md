> **実装済み(コード変更なし)。** `src/entities/species.ts`の`id:
> "urumiguma"`エントリを確認し、本文書のデータ表(AI/maxHp/atk/def/exp/
> weight/出現階/`regenIfUnhit`)がすべて一致することを確認した。本文書
> 自体は追加のコード変更を要求していないため、記録としてそのまま
> アーカイブする。

# うるみぐま(urumiguma)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/models/model-urumiguma.md`で別途扱う)。

## 位置づけ

第5地方(なみだの滝つぼ)・通常出現。出現階25〜、被弾なしで自然回復。

## 由来

ふさぎ込んだ古い悲しみ。ほとんど動かず、攻撃を受けなかったターンにわずかに癒える。悲しみに沈んだまま、そっとしておかれることでだけ少し軽くなる。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `guard` |
| maxHp / atk / def | 60 / 22 / 18 |
| exp | 44 |
| 出現weight | 4 |
| 備考 | 出現階25〜、被弾なしで自然回復 |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
