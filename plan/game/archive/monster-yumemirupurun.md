> **実装済み(コード変更なし)。ただし食い違いが1点ある。** `src/entities/
> species.ts`の`id: "yumemirupurun"`エントリを確認したところ、
> maxHp/atk/def/exp/weight/AI/由来はすべて本文書の記述と一致するが、
> 睡眠付与の発動率だけ、本文書(位置づけ・データ表とも)の「sleep25%」
> に対し、実装は`inflicts: { kind: "sleep", chance: 0.2, turns: 3 }`
> (20%、持続3ターンは一致)になっている。`plan/archive/companion-
> evolution.md`の元設計は発動率を数値で指定していないため、どちらが
> 「正」の仕様かを遡って確定できる資料が無い。本文書は「すでに実装済みの
> 内容を書き起こす」ドキュメントであり、実際にゲーム内で発動するのは
> `src/entities/species.ts`の値であるため、**実装済みコードの20%を信頼
> できる値として扱う**(本文書のテキスト自体は当時の記述のまま変更せず
> 残す。バランス調整として25%へ寄せたい場合は別途`src/entities/
> species.ts`の変更として提案すること)。

# ゆめみるぷるん(yumemirupurun)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/models/archive/model-yumemirupurun.md`で別途扱う)。

## 位置づけ

第1地方(うたたねの参道)・配合限定。ぷるん+マドロミダケの成熟(sleep25% 3turn)。

## 由来

まどろみの余韻に眠気そのものが混ざり込み、攻撃に眠りを乗せるようになった姿。同じぷるんから出発しても、寄り添う相手しだいで別の夢に育つ。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `melee` |
| maxHp / atk / def | 20 / 9 / 4 |
| exp | 18 |
| 出現weight | 0 |
| 備考 | ぷるん+マドロミダケの成熟(sleep25% 3turn) |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
