> **実装済み。** `src/entities/festivals.ts`(新規)に`isYoimatsuri`
> (`plan/yorishiro-moods.md`と同じ設計方針。新規セーブフィールドは無く、
> `todayKey()`をその場で評価するだけ)・`FESTIVAL_SHOP_OFFERS`・
> `YOIMATSURI_NPC_LINES`を実装した。
>
> **拠点BGM(`setMoodLayer`)は見送った**。計画書自身が明記していたとおり
> `plan/audio-playback.md`側の実装が先行する前提だったが、その文書は
> まだ実装されていない(`plan/`に残ったまま)ため、対応する仕組み
> (`AudioPlayer.setMoodLayer`)自体が存在しない。`plan/audio-
> playback.md`実装後に別途配線する。
>
> **限定品ぞろえ(宵祭りの出店)は、拠点画面に新しい列(列17)として
> 実装した**。既存の「身支度」「NPCと話す」と同じ、一覧+Enterで選択する
> UIパターンをそのまま踏襲(新しいUIコンポーネントの型は増やしていない)。
> 品揃えはほこら粉・ガジリねずみの刻印石・ツブテガエルの刻印石の3点に
> 固定した(計画書の未決事項だった具体的な品揃え・価格設定を実装時に
> 決定)。`src/save.ts`の`buyFestivalItem(save, defId, dateKey)`が
> 宵祭りの日以外・所持金不足のときは何もしない(既存の`developVillage`
> と同じ「条件を満たさなければno-op」パターン)。
>
> **NPCの一言**は、`plan/flavor-and-dialogue.md`(未実装)が定義する
> はずだった汎用の`DialoguePool`/`context`分岐にはまだ乗せられない
> (そちらが本文書に依存する側のため)ため、`YOIMATSURI_NPC_LINES`という
> 単純な`Record<VillageNpcId, string>`で先に実装した。`flavor-and-
> dialogue.md`実装時に、この専用の一言を`context: "afterFestival"`の
> 選択肢の1つとして吸収できる見込み。
>
> 表示は`plan/yorishiro-moods.md`の「今日の気分」のすぐ下に、開催有無を
> 1行追加しただけ。
>
> テストは`tests/yoimatsuri-festival.test.ts`(開催日判定・購入の
> 条件分岐・品揃えとNPCの一言データの整合性)で検証。ブラウザでも
> (日付をモックして)実際に出店から購入できることを確認済み。

# 宵祭り(よいまつり)

`design/village-festivals.md` が定義した2つの季節イベントのうち、
軽量な「宵祭り」を実装可能な形に確定させる。もう1つの「樽比べ」
(ミニゲーム)は実装コストの質が異なるため、`plan/tarukurabe-
minigame.md` として別途切り出す。

## 内容(既存設計の再掲)

月に一度、ネンネ村が提灯を灯して「ヨリシロが今夜も穏やかに眠っている」
ことを祝う祭り。戦闘・報酬に影響しない、雰囲気を楽しむための日
(`design/balance-philosophy.md`のパワーバジェット方針どおり)。

## 開催日の決定(確定)

`plan/archive/quest-board.md`・`plan/yorishiro-moods.md` と同じ
`todayKey`(`src/entities/quests.ts`)をそのまま使い、日付キーの
下1桁が`0`の日(10日に1回程度、月に3回ほど)を宵祭りの日とする。

```ts
export function isYoimatsuri(dateKey: string): boolean {
  return dateKey.endsWith("0"); // 日付キー末尾(日にちの1の位)が0
}
```

`design/village-festivals.md`の「月に一度」という目安よりやや頻度を
上げた(1の位が0の日、という単純な判定にすることで実装・説明の両方が
簡潔になる)。頻度の最終調整は未決事項として残す。

## 効果

- **拠点BGM**: `plan/audio-playback.md`の`AudioPlayer.setMoodLayer`と
  同じ仕組みを使い、通常の`village`BGMに宵祭り用のレイヤー(祭囃子)を
  重ねる(曲を丸ごと差し替えない)。
- **限定品ぞろえ**: `plan/archive/shops-and-thieves.md`の近道屋の出店
  とは別枠で、拠点に「宵祭りの出店」を1つ追加表示する。品揃えは
  `plan/equipment-forging.md`の刻印石・ほこら粉の詰め合わせ(通常の
  店より割高、地方限定素材を含む)を固定で並べる。売り切れ・補充の
  概念は持たせない(その日は常に同じ品揃え)。
- **NPCの一言**: `plan/archive/village-life.md`の各NPCの通常会話を、
  宵祭り専用の1行に差し替える(絆の進行には影響しない、フレーバーの
  上書きだけ)。
- 戦闘・ダンジョン生成には一切影響しない(`plan/yorishiro-moods.md`の
  「今日のヨリシロの気分」とは完全に独立したレイヤー)。

## 表示

`plan/yorishiro-moods.md`が拠点の出発前画面に出す「今日の気分」の
すぐ下に、宵祭りの開催有無を1行添える(新しいUIコンポーネントは
増やさない)。

## データ構造

新規のセーブフィールドは不要(`isYoimatsuri(todayKey())`をその場で
評価するだけで、永続化する状態を持たない。`plan/yorishiro-moods.md`と
同じ設計方針)。

## 実装への影響の見積もり

- `src/entities/festivals.ts`(新規): `isYoimatsuri`。
- `src/ui/town.ts`: 宵祭りの出店表示、NPC一言の差し替え、開催有無の
  表示。
- `plan/audio-playback.md`実装後: `setMoodLayer`呼び出しの追加
  (`plan/audio-playback.md`側の実装が先行する前提)。

## 未決事項

- 開催頻度の最終調整(日付キー下1桁=0、という単純な判定で十分か)。
- 宵祭りの出店の具体的な品揃え・価格設定。
- NPCごとの宵祭り専用の一言の実際の執筆。
