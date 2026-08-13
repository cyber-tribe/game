> **実装済み。** `src/entities/credits.ts`(新規)に`CREDIT_REGIONS`
> (design/regions.mdの8地方名、既存の生データが無いためここに直書き)・
> `creditVillagerNames()`・`creditMonsterNames()`を実装。計画書の
> サンプルコードは`CREDIT_VILLAGERS`を静的配列として例示していたが、
> 実装時点で既に`src/entities/village.ts`の`VILLAGE_NPCS`に同じ内容の
> 実データが存在していたため、`creditMonsterNames()`が`SPECIES`から
> 生成するのと同じ理由(追加のたびの手作業更新を避ける)で、
> `VILLAGE_NPCS`から動的に生成する形に変えた(二重管理を避けるための
> 意図的な逸脱)。
>
> `src/ui/ending.ts`(新規)に`EndingScreen`を実装。既存の`StanceMenu`
> 等と同じ「open/hide/isOpen/handleKey/render」の形に揃え、新しい
> 入力・コンポーネントの型は増やさず、決定キー(Enter/Space)で
> ページ送りする4ページ構成(地方→夢のかけら→村の人々→締めの一言)。
> 自動スクロールは計画書どおり採用していない。
>
> **表示タイミング**は`src/main.ts`の`finish()`で、`recordRun`が
> `save.storyCleared`を上書きする直前に
> `this.mountainCoreClearedThisRun && !this.save.storyCleared`を判定し、
> `pendingEndingSequence`フィールドへ保持する形にした(「初めてstoryCleared
> が立つ回だけ」を、既存の踏破終了フローの中で素朴に判定できた)。
> 「R キーで拠点にもどる」操作(`case "restart"`)で、このフラグが
> 立っていればエンドロールを挟んでから`showTown()`を呼び、それ以外は
> 従来どおり直接`showTown()`を呼ぶ。2回目以降の山の芯踏破では
> `storyCleared`が既にtrueのためエンドロールは流れない(ブラウザで
> 確認済み)。
>
> **真の目覚めの締めくくり**は、計画書どおりエンドロールをまるごと
> 再度流さず、`finish()`の結果オーバーレイの文言に短い一言
> (「はじめの夢は、もう独りではないと知った。」design/postgame.mdの
> 「もう独りではないと伝わる決着」を踏まえて執筆)を追加するだけに
> した。「一枚絵」は、この実装環境にイラスト制作の手段(README記載の
> 自作方針に沿う描画パイプライン)が無いため見送った(計画書の未決事項
> 「発注/制作方法は別途」を踏襲する形での意図的な未実装)。
>
> 締めの一言(4ページ目)はdesign/story.mdの終章「山のいびき」の
> トーン(決着後、山は普通の寝息に戻り、村の日常が続いていく)に沿って
> 自分で執筆した。
>
> テストは`tests/ending-sequence.test.ts`(`CREDIT_REGIONS`の内容・
> `creditVillagerNames`/`creditMonsterNames`が既存データと一致すること)
> で検証。UI層(`src/ui/*.ts`)は既存の`StanceMenu`等と同様vitestの
> 対象外のため専用のunitテストは追加せず、ブラウザでのスモークテストで
> 検証した: 山の芯を初めて踏破するとエンドロールが4ページとも正しい
> 内容で表示されること、最終ページの確定で拠点に戻り`storyCleared`が
> trueになること、2回目の踏破ではエンドロールをスキップして直接拠点に
> 戻ること、真の目覚めの締めくくりで一言が追加されること、いずれも
> コンソールエラー無しで確認済み。

# エンドロール

`design/ui-flow.md` が未決事項として残していた「エンドロールの具体的な
演出時間・構成」を確定させる。`plan/mountain-core.md`(物語第四章の
決着)・`plan/true-awakening.md`(真の目覚め)の締めくくりに続けて表示する
画面を仕様化する。

## 内容: 制作物一覧をクレジットとして使う(既存設計の再掲)

README記載の「3Dモデル・楽曲もすべて自作」という制作方針に沿い、
実在の制作者名を掲示するのではなく、**ゲーム内の制作物一覧
(モンスター・地方・NPCの名前)を実質的なクレジットとして流す**。

## 表示のタイミング

- `plan/mountain-core.md`の会話イベント(3階到達時の決着シーン)が
  終わったあと、拠点へ戻る**前**にこの画面を挟む。
- `plan/true-awakening.md`の締めくくりイベントのあとは、`design/ui-
  flow.md`が既に定めている通り「追加の短い一枚絵・一言」だけを差し込む
  (エンドロールをまるごと再度流さない。物語クリア1回分の演出として
  一度きりにする)。

## 演出の構成(確定): 自動スクロールではなく、既存のメッセージ送り操作を流用する

「スタッフロール」という言葉から連想される自動縦スクロールは、新規の
アニメーション実装コストが見合わないため採用しない。代わりに、
**既存のメッセージイベント送り(決定キーで次へ進む、会話イベントと
同じ操作)をそのまま使い、章立てされた一覧を数ページに分けて送る**、
という構成にする。新しい入力・新しいUIコンポーネントを増やさない。

```
1ページ目: 「地方」→ design/regions.mdの8地方の名前を一覧
2ページ目: 「夢のかけら」→ SPECIES(src/entities/species.ts)から
           name一覧を自動生成(モンスターを追加するたびに手作業の
           更新が要らない)
3ページ目: 「村の人々」→ design/characters.md・design/village-life.md・
           plan/side-stories.md・plan/side-stories-part2.mdのNPC名を
           一覧
4ページ目: 締めの一言(design/story.mdの結末に沿った、短い1〜2行)
```

## データ

```ts
// src/entities/credits.ts(新規)
export const CREDIT_REGIONS: readonly string[] = [
  "うたたねの参道", "忘れ潮の湿地", "まどろみの茸林", "骨積みの回廊",
  "なみだの滝つぼ", "こだまの尾根", "わすれられた祭りの跡", "めざめの前庭",
];

export const CREDIT_VILLAGERS: readonly string[] = [
  "モグラ婆", "樽転がしのゲンド", "目覚めたおたま",
  "肝いりのオトネ", "物知りのおキヨ", "ひよっこのポチ",
];

export function creditMonsterNames(): string[] {
  return SPECIES.map((s) => s.name); // 既存の種族表からその都度生成
}
```

`CREDIT_REGIONS`・`CREDIT_VILLAGERS`は名前だけの静的な配列で、既存の
`SPECIES`・`DUNGEONS`のような挙動を持つデータではないため、新規の
共有型は作らず、このリストの表示専用として割り切る。

## データ構造(セーブ)

新しいセーブフィールドは不要。エンドロールは「見た/見ていない」を
記録せず、`plan/mountain-core.md`の`storyCleared`フラグが立つ
タイミングで自動的に一度だけ再生されるフロー内の一画面として扱う
(再度村へ戻ったあとに任意で見返す機能は本文書のスコープ外とする)。

## 実装への影響の見積もり

- `src/entities/credits.ts`(新規): `CREDIT_REGIONS`・
  `CREDIT_VILLAGERS`・`creditMonsterNames`。
- `src/main.ts`: `plan/mountain-core.md`の会話イベント終了後、
  拠点へ戻る前にエンドロール画面(既存のメッセージ送り操作を流用)を
  挟む処理を追加。`plan/true-awakening.md`の締めくくり時は、この画面を
  スキップし専用の一枚絵・一言だけを表示する分岐を追加。
- 新規UIコンポーネントは、複数ページを既存のメッセージ送り操作で
  めくれる程度の軽量なものに留める(`src/ui/`配下に1ファイル追加する
  想定)。

## 未決事項

- 締めの一言(4ページ目)の実際の執筆。
- 真の目覚め後の一枚絵の具体的な内容・発注/制作方法(README記載の
  自作方針との整合は`design/audio-direction.md`同様、制作体制の
  話として別途)。
- エンドロールを村に戻ったあとに見返せるようにするかどうか。
