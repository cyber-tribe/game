> **実装済み(コード変更なし)。** `src/entities/species.ts`の`id:
> "subetenopurun"`エントリを確認し、本文書のデータ表(AI/maxHp/atk/def/
> exp/weight/出現階/sleep付与率/瀕死時攻撃力ボーナス)がすべて一致すること
> を検証した(`inflicts: { kind: "sleep", chance: 0.12, turns: 2 }`、
> `lowHpAtkBonusMax: 0.15`)。差分なし。本文書はコードを伴わない記録用の
> 文書のため、追加の実装は行わない。

# すべてのぷるん(subetenopurun)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/models/archive/model-subetenopurun.md`で別途扱う)。

## 位置づけ

第8地方(めざめの前庭)・通常出現。出現階43〜(sleep12% 2turn)、瀕死で攻撃力+最大15%。

## 由来

全地方の記憶が混ざり合ったぷるん。攻撃にわずかな眠りが乗るのは、ぷるん本来のまどろみの余韻がまだ芯に残っているため。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `melee` |
| maxHp / atk / def | 56 / 30 / 16 |
| exp | 70 |
| 出現weight | 3 |
| 備考 | 出現階43〜(sleep12% 2turn)、瀕死で攻撃力+最大15% |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
