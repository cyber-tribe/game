> **実装済み(コード変更なし)。** `src/entities/species.ts`の`id:
> "misemonoNoNushi"`エントリを確認し、本文書のデータ表(AI/maxHp/atk/def/exp/
> weight/備考)がすべて一致することを検証した。差分なし。本文書はコード
> を伴わない記録用の文書のため、追加の実装は行わない。

# 見世物のぬし(misemonoNoNushi)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/models/archive/model-misemonoNoNushi.md`で別途扱う)。

## 位置づけ

第7地方(わすれられた祭りの跡)・地方ボス。第七地方ボス。

## 由来

かつての祭りでもっとも人目を引いた出し物の記憶が、朽ちてなお色濃く残った姿。今は誰もいない会場の中央に、当時のままの存在感で居座り続ける。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `melee` |
| maxHp / atk / def | 152 / 31 / 34 |
| exp | 105 |
| 出現weight | 0 |
| 備考 | 第七地方ボス |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
