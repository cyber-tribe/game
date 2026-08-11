# 装備・素材図鑑

`plan/monster-compendium.md` がモンスター側の収集要素なのに対し、
装備・素材側には同格のコレクション要素がなかった。ここで対になる
図鑑を追加し、`plan/gallery-mode.md` の持ち物ギャラリー(見て楽しむ)に
**記録・達成の軸**を足す。

## 記録する対象

| カテゴリ | 内容 | 出典 |
|---|---|---|
| 武器 | なた系・穂突き・大鉈・双樽鉤・主の大槌の各系統(基本形+上位形) | `plan/protagonist-weapons.md` |
| 防具 | 頭防具・装身具の各アイテム | `plan/protagonist-equipment.md` |
| 印 | ぷるん/ガジリねずみ/ツブテガエル/マドロミダケ/ホネガラミの5種の印 | `plan/equipment-forging.md` |
| 素材 | ほこら粉・刻印石(種族ごと)・地方ボス専用素材 | `plan/equipment-forging.md` `plan/region-bosses.md` |
| 道具 | 草・巻物・杖・食料・道具カテゴリの全アイテム | `src/items/catalog.ts` `plan/item-catalog-expansion.md` |

## 記録段階

`plan/monster-compendium.md` の図鑑と同じ3段階の考え方を踏襲する。

- **未発見**: 存在を知らない。
- **入手済み**: 一度でも手に入れたことがある。
- **極めた**: 武器・防具は強化値+9かつ印を上限まで刻んだ状態、道具・
  素材はその項目自体が「入手済み」になった時点で自動的にこの段階
  (使い切りのアイテムに「極める」概念は不要なため)。

## コンプリートの見返り

- `plan/monster-compendium.md` の図鑑コンプリートと同様、**攻撃力・
  防御力に直結する報酬は用意しない**(`design/balance-philosophy.md`
  のパワーバジェット方針)。
- 武器図鑑を全系統「極めた」状態にすると、`plan/achievements.md` に
  専用の称号(例:「樽守りの目利き」)を追加する。
- 素材図鑑をすべて埋めると、`design/economy.md` の売却額がわずかに
  優遇される(店主に一目置かれる、という説明づけ)。攻撃力に触れない
  範囲の経済的な優遇に留める。

## 図鑑を持つ意味

- **武器選びの見通しをよくする。** `plan/protagonist-weapons.md` で
  5系統に増やした武器のうち、まだ試していないものが一覧で分かるように
  なり、「次はどれを試そうか」という選択を後押しする。
- **強化のやりがいを可視化する。** `plan/equipment-forging.md` の
  強化値+9・印上限は、達成しても普段の画面には表れにくい地道な
  作業なので、図鑑側で「極めた」状態としてはっきり示す。

## データ構造

```ts
export interface SaveData {
  // ...既存フィールド
  equipmentCompendium: Record<string, "owned" | "mastered">; // defId → 段階
  materialCompendium: Record<string, "owned">;                // defId → 入手済み
}
```

`plan/monster-compendium.md` の `compendium` フィールドと対になる形に
揃え、実装側が同じパターンで扱えるようにする。

## UI

`plan/gallery-mode.md` の持ち物ギャラリーの中に、埋まっているかどうかの
チェックマークとして重ねて表示する(閲覧用の画面を増やさず、既存の
ギャラリー画面に**記録の層を1枚足すだけ**にする)。

## 未決事項

- 「極めた」の判定基準(強化値+9・印上限、それぞれ単独でも部分的に
  表示するか)
- 素材図鑑コンプリート時の売却額優遇の具体的な割合
- 道具カテゴリまで図鑑化する価値があるか(数が多く、実装コストとの
  兼ね合いを見て武器・防具・印のみに絞る案もある)
