> **実装済み(コード変更なし)。** `src/entities/species.ts`の`id:
> "akubitokage"`エントリを確認し、本文書のデータ表(AI/maxHp/atk/def/exp/
> weight/出現階)がすべて一致することを検証した。差分なし。本文書はコード
> を伴わない記録用の文書のため、追加の実装は行わない。

# あくびとかげ(akubitokage)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/models/archive/model-akubitokage.md`で別途扱う)。

## 位置づけ

第1地方(うたたねの参道)・通常出現。出現階2〜。

## 由来

ヨリシロのあくびの合間に紛れ込んだ影。取るに足らない存在で、触れられるとすぐ距離を取る。うたたねの参道でぷるんの次に出会う、ごく小さな夢。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `coward` |
| maxHp / atk / def | 6 / 3 / 0 |
| exp | 4 |
| 出現weight | 9 |
| 備考 | 出現階2〜 |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
