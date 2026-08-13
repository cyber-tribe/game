> **実装済み(コード変更なし)。** `src/entities/species.ts`の`id:
> "horikuiNoNushi"`エントリを確認し、本文書のデータ表(AI/maxHp/atk/def/exp/
> weight/備考)がすべて一致することを検証した。差分なし。本文書はコード
> を伴わない記録用の文書のため、追加の実装は行わない。

# 掘り杭の主(horikuiNoNushi)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/model-horikuiNoNushi.md`で別途扱う)。

## 位置づけ

第8地方(めざめの前庭)・地方ボス。第八地方ボス(表の寝穴最終ボス)。

## 由来

近道屋が山へ打ち込んだ杭そのものに、ヨリシロの反発と痛みが絡みついてできあがった、いびつな姿。他の地方ボスと違い、夢が自然に生んだ存在ではなく、外から突き立てられた異物への拒絶反応として生まれている。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `melee` |
| maxHp / atk / def | 304 / 59 / 42 |
| exp | 120 |
| 出現weight | 0 |
| 備考 | 第八地方ボス(表の寝穴最終ボス) |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
