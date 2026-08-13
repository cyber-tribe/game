# なだかぜ(nadakaze)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/model-nadakaze.md`で別途扱う)。

## 位置づけ

第5地方(なみだの滝つぼ)・通常出現。出現階25〜、range4、奔流付近で射程+2。

## 由来

涙を誘う風。奔流タイルの近くでいっそう勢いを増し、射程を伸ばして吹きつける。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `ranged` |
| maxHp / atk / def | 26 / 17 / 7 |
| exp | 26 |
| 出現weight | 4 |
| 備考 | 出現階25〜、range4、奔流付近で射程+2 |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
