# まざりねずみ(mazarinezumi)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/model-mazarinezumi.md`で別途扱う)。

## 位置づけ

第8地方(めざめの前庭)・通常出現。出現階44〜。

## 由来

ガジリねずみといしずえねずみが混ざった姿。臆病さと不動の構え、序盤と終盤の性質が同居する不安定な個体。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `guard` |
| maxHp / atk / def | 60 / 34 / 12 |
| exp | 72 |
| 出現weight | 3 |
| 備考 | 出現階44〜 |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
