# 章立て(ストーリーフラグ)

> **実装済み。** `src/entities/story.ts`(新規。`StoryChapter`・
> `storyChapter`・`STORY_CHAPTER_MESSAGES`・`storyChapterEventId`)・
> `src/entities/village.ts`(`VillageNpcDef.appearsFromDeepest` →
> `appearsFromChapter`に変更、`visibleVillageNpcs`の引数を
> `deepest: number`から`chapter: StoryChapter`に変更。「目覚めたおたま」の
> 出現条件を`storyChapter>=2`に差し替え済み)・`src/ui/town.ts`
> (`currentStoryChapter()`ヘルパーを新設し、3箇所の`visibleVillageNpcs`
> 呼び出しをこれ経由に変更)・`src/main.ts`
> (`checkStoryChapterTransition`。拠点帰還のたびに新しい章への突入を
> 検知し、`seenVillageEvents`で1回だけ導入メッセージを流す)。
>
> テストは `tests/story-chapters.test.ts`(新規8件)。既存の
> `tests/village-life.test.ts`も新シグネチャに合わせて更新した。
> `npx tsc --noEmit`・`npx vitest run`(597件全て通過)・
> `npm run build`を確認済み。
>
> 実装にあたって次の判断をした。
>
> - **`SaveData.storyCleared`はまだ追加していない。** `plan/mountain-
>   core.md`が本来この文書の`storyChapter`が参照するフィールドを
>   新設する予定だが、その文書自体が未実装のため、当面は
>   `storyChapter(deepest, false)`のように`false`を直接渡す形にした
>   (`src/ui/town.ts`の`currentStoryChapter()`・`src/main.ts`の
>   `checkStoryChapterTransition`の両方にコメントで明記)。`plan/
>   mountain-core.md`実装時に`SaveData.storyCleared`を追加し、この
>   2箇所の`false`を`this.save.storyCleared`に差し替えるだけで
>   接続できる設計にしてある。
> - **第三章の「仲間探し」イベント(`plan/chapter3-collapse-event.md`)は
>   本PRのスコープ外のまま。** 章の遷移メッセージだけを実装し、崩落の
>   固定配置自体は別途扱う(本文の未決事項どおり)。

`design/story.md` の全6章構成(序章・第一〜第四章・終章)を、初めて
`plan/`側の実装可能な仕組みに落とす。これまでの複数の文書
(`plan/archive/village-development.md`・`plan/archive/multiple-
dungeons.md`・`plan/village-life.md`)が繰り返し「章立て自体は未実装の
ため、`deepest`/`villageStage`を代替指標にした」と明記してきた
簡略化を、ここで正式な章フラグに置き換える。

## 方針: 既存の指標を「章の判定式」として再利用する(新しいイベントは増やさない)

`design/story.md`の各章は地方の範囲にほぼ対応しているため、新しい
ゲームプレイ上のトリガーを発明せず、**既存の`deepest`・
`SaveData.storyCleared`(`plan/mountain-core.md`)から章番号を導出する
関数**として実装する。

```ts
export type StoryChapter = 0 | 1 | 2 | 3 | 4 | 5 | 6;
// 0=序章, 1=第一章, 2=第二章, 3=第三章, 4=第四章, 5=終章

export function storyChapter(deepest: number, storyCleared: boolean): StoryChapter {
  if (storyCleared) return 5; // 終章。山の芯クリア後
  if (deepest >= 42) return 4; // 第四章: 第七〜第八地方
  if (deepest >= 30) return 3; // 第三章: 第五〜第六地方
  if (deepest >= 18) return 2; // 第二章: 近道屋の裏穴+第三〜第四地方
  if (deepest >= 6) return 1;  // 第一章: 第一〜第二地方
  return 0;                    // 序章: 第一地方
}
```

`SaveData`に章番号そのものを保存する新フィールドは作らない
(`deepest`・`storyCleared`から毎回導出できるため、`plan/yorishiro-
moods.md`と同じ「永続化しない」設計方針を踏襲する)。

## 章が変わった瞬間の演出

- 章の境目(`deepest`が閾値を初めて超えた瞬間)に、`plan/village-
  life.md`で新設した`seenVillageEvents`と同じ仕組みで、**その章の
  導入にあたる短いメッセージを1回だけ**表示する(既存の`GameEvent`
  (`type: "message"`)を使う。新しいUIは増やさない)。
- 表示内容は`design/story.md`の各章の冒頭描写を1〜2行に要約したもの
  (例: 第一章突入時「近ごろ、山の様子がおかしいという噂を耳にする」)。
  実際の文面の執筆は本文書のスコープ外とする。
- **章の遷移メッセージは、拠点(ネンネ村)に帰還した直後**に判定する
  (`main.ts`の帰還処理に、`storyChapter`の再計算と
  `seenVillageEvents`への追加チェックを挟むだけで実装できる)。

## `plan/village-life.md`との接続

`plan/village-life.md`が暫定条件(`deepest >= 12`)にしていた「目覚めた
おたま」の出現条件を、本文書の実装後は**`storyChapter(deepest,
storyCleared) >= 2`(第二章到達)**に差し替える。`design/story.md`が
明記する「第二章で救出される」という設定に、これで初めて正確に一致する
(`plan/village-life.md`の未決事項として残されていた移行を、本文書が
解消する)。

## 第三章の「仲間探し」イベントについて

`design/story.md`第三章は「骨積みの回廊の崩落→力持ちの仲間を探しに
戻る」という具体的なゲームプレイ上の展開を記述しているが、これは
`plan/archive/ally-field-gimmicks.md`側の仕組み(仲間の特性を使った
フィールドギミック解除)に依存する演出であり、**本文書では章の遷移
メッセージだけを扱い、崩落そのもの・専用の探索イベントの実装は
`plan/ally-field-gimmicks.md`の追加改修として別途扱う**(本文書の
スコープ外とし、未決事項に明記する)。

## 実装への影響の見積もり

- `src/entities/story.ts`(新規): `StoryChapter`・`storyChapter`関数・
  各章の導入メッセージ定数。
- `src/main.ts`: 拠点帰還処理に、章の再判定と初回メッセージ表示を追加。
- `src/save.ts`: 新規フィールドは不要。`plan/village-life.md`の
  「目覚めたおたま」出現条件の参照先を`storyChapter`に差し替える
  (該当箇所の実装時に反映)。

## 未決事項

- 各章の導入メッセージの実際の執筆(6章ぶん)。
- 第三章の「仲間探し」の具体的なイベント実装(`plan/ally-field-
  gimmicks.md`側の改修として別途)。
- 章の閾値(6/18/30/42)を地方境界(`plan/region-expansion.md`)と
  厳密に一致させるか、`design/story.md`の記述(地方の範囲がやや
  重なって書かれている箇所がある)に忠実にずらすか。本文書は単純な
  地方境界ベースの案を採用したが、最終判断は実装時の体感に委ねる。
