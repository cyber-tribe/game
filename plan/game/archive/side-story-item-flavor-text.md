# NPCサイドストーリー専用品のflavorText

`design/side-stories.md`および`plan/side-stories-part2.md`(archive)が
「未決事項」として先送りしていた、サイドストーリー締めくくりの専用品
5点の`flavorText`を確定させる。枠組みは`plan/flavor-and-dialogue.md`
(archive)がすでに実装した`ItemDef.flavorText`(既存の`description`
とは別行で、持ち物メニューの詳細表示に追加する)をそのまま使う。

## 対象

`src/items/catalog.ts`の武器・道具4点(`flavorText`フィールドは
既存、値が未設定)と、`src/entities/costumes.ts`の衣装1点(型に
`flavorText`フィールド自体が無い)。

| id | 種別 | 由来 |
|---|---|---|
| `mogurababaKeepsakeHatchet` | 武器 | モグラ婆(`plan/side-stories-part1.md`) |
| `gendoPhantomBillhook` | 武器 | ゲンド(同上) |
| `otoneMemoBook` | 道具 | オトネ(`plan/side-stories-part2.md`) |
| `okiyoSketchMap` | 道具 | おキヨ(同上) |
| `pochiHandMeDownHappi` | 衣装 | ポチ(同上) |

## flavorText本文

`description`(効果の説明)とは役割を分け、機能に触れず、その人物・
逸話だけを短く匂わせる一文にする(既存4件のflavorText——いやしの葉・
なた・送り火の粉・松明——と同じ長さ・温度感)。

```ts
// src/items/catalog.ts
{
  id: "mogurababaKeepsakeHatchet",
  // ...既存フィールド
  flavorText: "柄が手に馴染むほど使い込まれている。もう振るう手は要らない、とモグラ婆は笑っていた。",
},
{
  id: "gendoPhantomBillhook",
  // ...既存フィールド
  flavorText: "ゲンドが若い頃に一度だけ打てたという、あの一振りそのものの重さと輝き。",
},
{
  id: "otoneMemoBook",
  // ...既存フィールド
  flavorText: "村の誰と誰が、いつ何をしたか。何十年ぶんもの気づかいが、細かな字でぎっしり詰まっている。",
},
{
  id: "okiyoSketchMap",
  // ...既存フィールド
  flavorText: "名前のない生き物のための余白が、いちばん最初のページに残されたままになっている。",
},
```

## 衣装への`flavorText`追加

`CostumeDef`(`src/entities/costumes.ts`)には`flavorText`が無いため、
`ItemDef`と同じ形で追加する。対象はポチの1件のみで、他の衣装は
既存どおり省略可能のまま(全衣装への一斉追記はしない)。

```ts
// src/entities/costumes.ts
export interface CostumeDef {
  id: string;
  name: string;
  description: string;
  /** 既存のdescriptionとは別行で、着替え画面の詳細表示に追加する */
  flavorText?: string;
  tint?: readonly [number, number, number];
  unlock: CostumeUnlock;
}
```

```ts
{
  id: "pochiHandMeDownHappi",
  // ...既存フィールド
  flavorText: "袖はまだ少し長い。けれど、いつか着こなせる日が来ることを、ポチ自身が一番わかっている。",
},
```

表示先(拠点の着替え画面)は`ItemDef.flavorText`が持ち物メニューに
追加された経緯とそろえ、既存の詳細表示に1行足すだけにする。新しい
UIコンポーネントは増やさない。

## 実装への影響の見積もり

- `src/items/catalog.ts`: 4件に`flavorText`を追記するだけ(型定義は
  既存のまま変更不要)。
- `src/entities/costumes.ts`: `CostumeDef.flavorText?: string`を追加し、
  ポチの1件にだけ値を設定。
- 表示側(拠点の着替え画面)がまだ`CostumeDef.flavorText`を読んでいない
  場合は、`ItemDef.flavorText`の表示箇所(持ち物メニュー)と同じ形で
  1行追加する。

## 未決事項

- 他の衣装(記念解放系)への`flavorText`追加は、本文書のスコープ外
  (`plan/flavor-and-dialogue.md`の「一斉に追記する必要はなく、少しずつ
  埋めていける」方針を踏襲し、対象を先送りしたままにする)。
