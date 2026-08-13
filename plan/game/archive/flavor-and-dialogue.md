> **実装済み。** `src/core/types.ts`に`ItemDef.flavorText`・
> `Species.idleSpeedMul`を追加。`src/entities/dialogue.ts`(新規)に
> `DialoguePool`・`DIALOGUE_POOLS`・`dialogueContext`(計画書どおりの
> 優先順位: 絆・最高→highBond、気分「寝苦しい夜」→moodRestless、
> 宵祭り→afterFestival、どれも該当なければdefault)を実装した。
>
> **既存のyoimatsuri-festival.mdのアドホックな仕組みを、本文書が意図
> していたとおりこの統一されたcontext分岐に吸収した**: 直前のPRで
> 追加していた`YOIMATSURI_NPC_LINES`(宵祭りの日だけNPCの一言を差し替える
> 単純なRecord)を廃止し、その内容を`DIALOGUE_POOLS`の
> `context: "afterFestival"`エントリへ移設した。あわせて
> `tests/yoimatsuri-festival.test.ts`の対応するテストを削除した。
>
> NPCのせりふ抽選は`src/ui/town.ts`の「NPCと話す」列に実装。「直前と
> 同じ文言を避ける」はNPCごとに直前のインデックスをメモリ上(セッション
> 内だけ、セーブしない)に持たせて実現した。表示中のNPCが変わったときだけ
> 再抽選し、同じNPCを見ている間は描画のたびに文言がちらつかないよう固定した。
>
> `idleSpeedMul`は`THREE.AnimationAction.timeScale`をidleクリップ再生時
> だけ適用する形で実装(`src/view/actorView.ts`)。計画書が例示した3種
> (ぷるん・ガジリねずみ・ホネガラミ)にだけ設定し、残りは未決事項として
> 見送った(計画書どおり)。
>
> **隠れた小ネタ**: おキヨの「うろこ覚えのヒント」・ポチの「ぷるんを
> 妙に怖がる」は、それぞれのdefaultコンテキストのlinesに素朴な一言として
> 書き込んだ(新しいcontextは増やしていない)。ゲンドの「+9装備を見せた
> ときの専用の一言」は、計画書が想定していた`GameEvent`(ダイブ中専用の
> 仕組み)ではなく、鍛冶(ゲンドの工房)自体が拠点画面(ダイブ外)の
> 機能だったため、`DialoguePool`とは独立した拠点画面側の一時通知として
> 実装した(既存の`favoriteNotice`と同じパターン)。
>
> `flavorText`はいやしの葉・なた・送り火の粉・松明の4点にだけ追加した
> (計画書の「全アイテムに一斉に追記する必要はなく、実装後に少しずつ
> 埋めていける」という方針どおり)。
>
> テストは`tests/flavor-and-dialogue.test.ts`(context優先順位・
> DialoguePoolの整合性とフォールバック・flavorText/idleSpeedMulの
> 設定)で検証。ブラウザでもアイテムのflavorText表示・NPCのせりふ抽選
> 表示の両方を確認済み。

# 小ネタ・遊び心(アイテムのflavorText・NPCのせりふプール)

`design/flavor-details.md` を実装可能な形に確定させる。特に
「NPCのせりふプール」は、`plan/village-life.md`(絆段階)・`plan/
yorishiro-moods.md`(気分)・`plan/yoimatsuri-festival.md`(宵祭り)が
それぞれ独立に仕様化してきた3つの状態を、初めて1つの分岐(`context`)に
束ねる文書になる。

## アイテムのflavorText

```ts
// src/items/catalog.ts の ItemDef に追加
export interface ItemDef {
  // ...既存フィールド
  flavorText?: string;
}
```

既存の`description`(機能説明)とは別の行として、持ち物メニューの
アイテム詳細に追加表示する。**新しいUIコンポーネントは増やさず**、
既存の詳細表示に1行足すだけ。省略可能(`?`)なので、全アイテムに
一斉に追記する必要はなく、実装後に少しずつ埋めていける。

## NPCのせりふプール

```ts
export interface DialoguePool {
  npcId: string;
  context: "default" | "afterFestival" | "moodRestless" | "highBond";
  lines: string[];
}
```

`context`の決定は、既存の3つの仕組みをそのまま参照するだけで済む
(新しい分岐ロジックは作らない、優先順位だけ決める)。

1. `plan/village-life.md`の絆段階が`"irreplaceable"`(最高)なら
   `"highBond"`
2. そうでなく、`plan/yorishiro-moods.md`の今日の気分が`"restless"`
   (寝苦しい夜)なら`"moodRestless"`
3. そうでなく、`plan/yoimatsuri-festival.md`の`isYoimatsuri(todayKey())`
   が真なら`"afterFestival"`(名称は「祭りのあと」だが、開催中も含めて
   このcontextを使う。設計文書の命名をそのまま踏襲する)
4. どれにも該当しなければ`"default"`

```ts
export function dialogueContext(save: SaveData, npcId: string): DialoguePool["context"] {
  if (bondStage(save.bonds[npcId] ?? 0) === "irreplaceable") return "highBond";
  if (moodForDate(todayKey()).id === "restless") return "moodRestless";
  if (isYoimatsuri(todayKey())) return "afterFestival";
  return "default";
}
```

選ばれた`context`に対応する`lines`から、**直前に表示したものと同じ
文言は避けて**(既存の抽選ロジックのパターン、`plan/archive/floor-
gimmicks.md`の「直前の階と同じギミックは選ばない」と同じ考え方)
ランダムに1つ選ぶ。直前の表示内容は`seenVillageEvents`とは別に、
NPCごとに最後に見た`lines`のインデックスだけをメモリ上(セーブしない、
セッション内だけの状態)に保持すればよい。

## モンスターの待機仕草

新規クリップは作らず、既存の`idle`アニメーションの再生速度・タイミング
パラメータの調整だけで表現する(`design/flavor-details.md`の方針を
そのまま採用)。`Species`に`idleSpeedMul?: number`(既定1)を追加し、
`src/view/`側の`idle`再生時にこの倍率を掛ける。

```ts
// src/entities/species.ts の該当種族に追加
{ id: "purun", ..., idleSpeedMul: 0.6 },       // ゆっくり揺れる
{ id: "gajiri", ..., idleSpeedMul: 1.4 },      // きょろきょろ、忙しない
{ id: "honegarami", ..., idleSpeedMul: 0.3 },  // ほとんど動かない
```

## 隠れた小ネタの実装形

- おキヨの「うろこ覚えのヒント」・ポチの「ぷるんを妙に怖がる」は、
  それぞれ専用の`DialoguePool`のcontextを増やすのではなく、
  `npcId`ごとの`lines`の中身として素朴に書き分ける(NPCごとに個性が
  違って当然なので、共通の分岐を複雑にしない)。
- ゲンドの「+9装備を見せたときの専用の一言」は、`context`の4種とは
  別枠の**イベント的な一言**として扱う(強化直後、既存の`GameEvent`
  (`message`)にゲンドの専用文言を1つ差し込むだけ。`DialoguePool`の
  仕組みには乗せない、独立した小さな分岐)。

## データ構造(セーブ)

新しいセーブフィールドは不要。`flavorText`はアイテム定義に静的に
持たせるだけ、`DialoguePool`の選択は`plan/village-life.md`・`plan/
yorishiro-moods.md`・`plan/yoimatsuri-festival.md`の既存の状態から
その場で導出するだけ(直前表示インデックスもセッション内メモリのみ)。

## 実装への影響の見積もり

- `src/items/catalog.ts`: `ItemDef.flavorText`追加、実データの
  段階的な追記。
- `src/entities/dialogue.ts`(新規): `DialoguePool`・`DIALOGUE_POOLS`・
  `dialogueContext`関数。
- `src/entities/species.ts`: `Species.idleSpeedMul`追加。
- `src/ui/town.ts`: アイテム詳細表示への`flavorText`追加、NPC訪問時の
  せりふプールからの抽選表示。
- `src/view/`: `idle`再生時の`idleSpeedMul`適用。

## 未決事項

- `flavorText`・`DialoguePool`の全量の執筆(本文書は仕組みのみ)。
- モンスターごとの`idleSpeedMul`の一覧化(既存3種以外)。
- ゲンドの専用一言以外にも、同種の「イベント的な一言」を増やすか
  どうか(当面は個別対応に留め、共通の仕組みは作らない)。
