# 装備の刻印を2つ目まで拡張する

`plan/archive/equipment-forging.md`が未決事項として残していた「印の
効果を将来2つ目まで拡張する場合の追加コスト設計」に着手する。実装ノートは
「`Item.markId`を単一値のままにして今回は見送った」と明記しており、
本文書はその型を`markId → markIds`(最大2件)へ広げる改修を仕様化する。

## データ構造の変更

```ts
// src/core/types.ts
export interface Item {
  // ...既存フィールド
  markIds?: MarkId[]; // 最大2件。markIdから改名・複数化
}
```

**既存の`markId`フィールドは廃止し、`markIds`に一本化する。** 単一値の
まま`markIds?: [MarkId]`のような別名を残す互換レイヤーは作らない
(`Item`はダイブごとの一時的な所持データであり`SaveData`には直接
永続化されないため、`plan/archive/save-compat-testing.md`のような
後方互換フィクスチャは不要。`倉庫(StoredItem)`側の永続化データに
`markId`が含まれる場合のみ、ロード時に`markIds: [markId]`へ変換する
マイグレーションを1箇所書けば足りる)。

## 呼び出し側の変更

`weaponMarkId(inv)`/`shieldMarkId(inv)`(`src/items/inventory.ts`)を
それぞれ`weaponMarkIds(inv): MarkId[]`/`shieldMarkIds(inv): MarkId[]`
に改名し、`src/game.ts`の各判定箇所(`weaponMarkId(...) === "gajiri"`の
ような5箇所)を`weaponMarkIds(...).includes("gajiri")`に置き換える。
**印の効果そのもの(各`MarkId`が何をするか)は一切変更しない。** 2つの
印を持つ装備は、両方の効果が単純に併存する(相乗効果・特別な組み合わせ
効果は設けない。`design/balance-philosophy.md`の「操作の複雑さを大きく
崩さない」方針に沿い、掛け合わせの組み合わせ数を増やさない)。

## 2つ目の刻印を可能にする条件(新設)

無条件に2枠目を解放すると、`plan/archive/equipment-forging.md`が
定めた強化値+9到達の重みが相対的に薄まる。**2つ目の刻印には、専用の
新規素材を必要とする。**

- 新規材料**「重ね刻みの砥石」**をゲンドの工房で**合成**する
  (ダンジョンでの直接ドロップにはしない)。合成には、既に持っている
  刻印石2つ(通常の1つ目の印付けで使うのと同じ素材)+ほこら粉を
  多めに消費する、という工房内で完結するレシピにする(新しい出現
  テーブルを増やさない)。
- 2つ目の刻印を刻めるのは、**すでに+9かつ1つ目の印を持つ装備だけ**
  (`plan/archive/equipment-forging.md`の強化上限を、2枠目解放の
  前提条件として再利用する)。

## 装備図鑑への影響

`plan/archive/equipment-compendium.md`の`markCompendium`
(`Record<string, "owned">`、MarkIdをキーにする)は変更不要。**印1つを
初めて刻んだ時点で記録される仕組みのまま**でよく、2枠目に同じ印を
選んでも(異なる印を選んでも)新しい記録の仕組みは要らない。

## UIへの影響

`src/ui/town.ts`のゲンドの工房画面(既存の一覧UIパターン)に、+9かつ
1印済みの装備を選んだときだけ「重ね刻みの砥石で2つ目を刻む」の選択肢を
追加表示する。新しいUIコンポーネントは増やさない。

## 実装への影響の見積もり

- `src/core/types.ts`: `Item.markId` → `Item.markIds: MarkId[]`。
- `src/items/inventory.ts`: `weaponMarkId`/`shieldMarkId` →
  `weaponMarkIds`/`shieldMarkIds`(複数対応)。
- `src/game.ts`: 印判定5箇所を`.includes()`形式に置き換え。
- `src/items/catalog.ts`: 新規素材「重ね刻みの砥石」を追加。
- `src/save.ts`: `StoredItem`に`markId`が残っている場合の
  `markIds: [markId]`変換(ロード時の1回限りの読み替え)。
- `src/ui/town.ts`: 工房画面への2枠目UI追加。

## 未決事項

- 「重ね刻みの砥石」の具体的な合成コスト(刻印石2つ+ほこら粉何個か)。
- 同じ印を2枠とも同じものにできてよいか(例: がじり×2で会心率+更に
  上乗せ、のような重複を許すか)。本文書は**同じ印の重複は禁止**
  (2枠目は1枠目と異なる印を選ばせる)を初期案とするが、最終判断は
  実装時のバランス調整に委ねる。
