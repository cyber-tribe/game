> **実装済み。**
> `src/entities/shop.ts` に `sellPrice`(既存の `shopPrice` を呼ぶだけの
> 薄いラッパー、買値の4割を四捨五入)を追加し、`src/game.ts` の
> `dropItem` の冒頭で店の部屋(`Room.kind === "shop"`)判定を追加、
> 新設の `sellItem` へ分岐させた。本文書のサンプルコードどおりの実装。
> テストは `tests/item-selling.test.ts`(6件)。
>
> 実装時の判断:
> - **持ち物メニューの「置く」表示**: 本文書が「実装時の判断に委ねる」と
>   していた、店の部屋にいるときだけ「売る」に文言を変える表示調整は
>   見送った。`src/ui/menu.ts` の `InventoryMenu` は `PlayerState` しか
>   受け取っておらず、現在地が店の部屋かどうかを判定するには `FloorState`
>   への参照を新たに配線する必要があり、コマンド自体の挙動(実際に売却
>   されること)には影響しないUI文言だけの変更のためスコープ外とした。
> - **未払い(`unpaid`)アイテムの店内売却**: 本文書の未決事項どおり、
>   特別な精算処理は設けていない。`unpaid` なアイテムも通常の `sellItem`
>   と同じ経路で売却される(既存のダイブ終了時処理に委ねる方針を維持)。
> - **装備中アイテムの売却可否**: 既存の `removeItem`(`src/items/inventory.ts`)
>   が装備スロットも自動的にクリアする実装だったため、装備中でも
>   そのまま売却できる(本文書の「既存のdropの制約をそのまま踏襲」と整合)。

# アイテムの売却

`design/economy.md` が「抜けていた導線」として新設した、店でのアイテム
売却を実装可能な形に確定させる。同文書の売却額の式(買値の4割程度)・
万引き警戒状態との連動をそのまま採用する。

## 操作: 新しいコマンドは増やさない

`plan/archive/shops-and-thieves.md`の購入は、**店の売り物が置かれた
マスへ移動して拾う(Spaceキー)と自動購入になる**、という既存の
「拾う」操作の上書きだけで実装されている(`src/game.ts`の
`pickupItem`)。売却もこれと対になる形にする。

**店の部屋(`Room.kind === "shop"`)の中で、持ち物を置く(既存の
`"drop"`コマンド、既存のキー)と、床に置く代わりに自動で売却される。**
新しいキー・新しいメニュー項目は増やさない。

```ts
private dropItem(uid: number, events: GameEvent[]): boolean {
  const pos = this.player.pos;
  const shopRoom = this.floor.rooms.find(
    (r) => r.kind === "shop" && roomContains(r, pos),
  );
  if (shopRoom) {
    return this.sellItem(uid, events); // 新設
  }
  // ...既存のdrop処理はそのまま
}
```

## 売却額

`design/economy.md`・`src/entities/shop.ts`の既存の`shopPrice`関数
(`price = 20 + minFloor * 8 + (10 - weight) * 5`、`wary`なら
`WARY_PRICE_MULTIPLIER`を掛ける)を**そのまま再利用**し、売却額は
その4割にする。

```ts
function sellPrice(def: ItemDef, item: Item, wary: boolean): number {
  return Math.round(shopPrice(def, item, wary) * 0.4);
}
```

`this.shopWary`(既存のフィールド、`src/game.ts:314`)をそのまま
参照する。**万引き後の警戒状態では、売却額も同じ`wary`フラグで
割安になる**(`design/economy.md`の「悪評は売り買い両方に影響する」を
そのまま実装する)。

## 実装

```ts
private sellItem(uid: number, events: GameEvent[]): boolean {
  const item = removeItem(this.player.inventory, uid);
  if (!item) return false;
  const def = itemDef(item.defId);
  const price = sellPrice(def, item, this.shopWary);
  this.player.gold += price;
  events.push({ type: "message", text: `${def.name}を${price}ゴールドで売った。` });
  return true;
}
```

装備中のアイテム(`Item.equipped`相当)を売れるかどうかは、既存の
`"drop"`コマンド自体が装備中アイテムに対してどう振る舞うかに合わせる
(既存の挙動を変えない。装備中は`dropItem`の対象に選べない、という
既存の制約があるならそのまま踏襲する)。

## `unpaid`(未払いで持ち出したアイテム)の扱い

`pickupItem`が既に持つ`item.unpaid`(お金が足りず無断で持ち出した際の
フラグ)を店の中で売ろうとした場合は、**売却ではなく精算**(未払い分を
差し引く)にする、という特別扱いは今回は設けない。`unpaid`なアイテムは
既存のダイブ終了時の処理(全滅時ロスト等)にすでに乗っているため、
本文書では追加のケース分けをしない(未決事項として残す)。

## データ構造

新しいセーブフィールドは不要(既存の`gold`・`Inventory`の授受だけで
完結する。`design/economy.md`の記述どおり)。

## 実装への影響の見積もり

- `src/entities/shop.ts`: `sellPrice`関数を追加(`shopPrice`を呼ぶだけの
  薄いラッパー)。
- `src/game.ts`: `dropItem`の冒頭に店の部屋判定を追加し、`sellItem`
  (新設)へ分岐させる。
- `src/ui/`: 特別なUI変更は不要(既存の持ち物メニューから「置く」を
  選ぶ操作がそのまま「売る」になる、というメッセージ上の違いだけ)。
  持ち物メニュー上で「置く」と表示されている文言を、店の部屋にいる
  ときだけ「売る」に変える程度の軽微な表示調整は実装時の判断に委ねる。

## 未決事項

- `unpaid`なアイテムを店内で売ろうとした場合の精算処理(今回は特別扱い
  しない、という判断を暫定とする)。
- 装備中アイテムの売却可否(既存の`drop`コマンドの制約をそのまま踏襲)。
- 売却額の掛け率4割の妥当性(`design/economy.md`から継続する未決事項)。
