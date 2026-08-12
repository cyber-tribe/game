# 依頼板

> **実装済み(護送を除く)。** `src/entities/quests.ts`(新規。依頼カタログ
> `QuestDef`/`QUESTS`、`questsForDate`、`todayKey`)・`src/save.ts`
> (`SaveData.gold`・`boardDate`・`boardOffers`・`activeQuests`・
> `completedQuestIds`、`refreshBoard`、`acceptQuest`、`abandonQuest`、
> `recordRun`内の`resolveQuests`、壊れたセーブデータのサニタイズ)・
> `src/core/events.ts`(`die`イベントに`speciesId`を追加)・`src/game.ts`
> (`die`イベント発火時に`speciesId`を乗せる)・`src/main.ts`(拠点を開く
> たびに`refreshBoard`を呼ぶ配線、ダイブ中の討伐種族・新規図鑑登録数・
> 到達階の集計、受注/取り下げを`TownScreen`から受け取る配線)・
> `src/ui/town.ts`(拠点に「依頼板」カラムを追加。貼り出し中/受注中の
> 依頼を一覧表示し、Enterで受注・取り下げできる。所持金を画面上部の
> 記録行に表示)。テストは `tests/quest-board.test.ts`(25件)。
>
> 実装にあたって次の判断をした。
>
> - **護送(escort)は今回のスコープから外した。** 対象NPCを非戦闘のまま
>   同伴させる新しい仕組み(`plan/companion-orders.md`の戦う仲間とは別枠)
>   と、`design/story.md`の章の進行(未実装)の両方が前提になっており、
>   本文の未決事項が挙げていたとおり実装コストが大きいため見送った。
>   `QuestKind`から`"escort"`を外し、`QuestDef`から`requiresChapter`・
>   `reward.bondNpc`/`bondAmount`も削っている。対応する仕組みが揃った
>   時点で追加できる。
> - **`SaveData.gold`(所持金の永続化)を今回新設した。** 依頼の金銭報酬を
>   実装するには前提になる項目だが、`plan/shops-and-thieves.md`実装時には
>   ダイブ中の`player.gold`しかなく、拠点帰還時にセーブへ持ち帰る配線が
>   無かった(踏破しても所持金が毎回失われていた、既存の抜け)。今回
>   `recordRun`に`goldBroughtBack`を渡すことで、依頼と無関係に踏破報酬の
>   所持金も正しく積み上がるようになった。
> - **日替わりの依頼板は「受注していない残り枠だけを補充する」簡略化を
>   採用した。** 本文が示す「固定3枠」のような厳密なスロット位置の管理は
>   せず、`boardOffers`を「未受注の貼り出し一覧」というだけの配列にして
>   いる。受注済みの依頼は日付が変わっても消えず、達成済みidは二度と
>   貼り出されない。
> - **依頼カタログは8件の例示的な集合にとどめた。** 討伐2件・採取2件・
>   探索2件・図鑑2件で、各種類の判定ロジックを最低限検証できる数に
>   絞っている。本文が挙げる「地方限定素材」「指定地方以深」のような、
>   まだ実装されていない地方システム(`plan/multiple-dungeons.md`等)に
>   依存する条件は使っていない。
> - **報酬は素材付与の型(`reward.materials`)を用意したが、現在のカタログ
>   は全件が所持金のみの報酬になっている。** `resolveQuests`側は素材報酬に
>   対応済みなので、素材を使った依頼を追加する際にコード変更は不要。
> - **`activeQuests`の`progress`フィールドは、ダイブ中の途中経過は
>   追跡していない。** ダイブの成果(`recordRun`の`result`)から一括で
>   達成/未達成を判定するため、常に`0`のまま保存され、達成した瞬間に
>   `completedQuestIds`へ移る。途中経過を拠点で確認したいニーズが出た
>   場合は別途対応する。

`design/village-life.md` の**肝いりのオトネ**が窓口となる、村の依頼板を
仕様化する。「深く潜って踏破する」以外の目的をダイブのたびに用意し、
反復プレイに具体的な目標のバリエーションを持たせる
(`design/balance-philosophy.md` の方針)。

## 依頼の種類

| 種類 | 内容 | 完了判定 |
|---|---|---|
| 討伐 | 指定の種族(`plan/monster-compendium.md`)を指定数、指定地方以深で倒す | ダイブ中の撃破数を集計 |
| 採取 | 指定の素材(ほこら粉・刻印石・地方限定素材)を指定数持ち帰る | 帰還時の持ち物を確認 |
| 探索 | 指定のめざめの階段(`plan/checkpoint-select.md`)へ初めて到達する | 到達イベントで判定 |
| 図鑑 | 未確認の種族を指定数、新たに「見た」状態にする | 図鑑の更新差分で判定 |
| 護送 | 村へ一時的に身を寄せている村人(`design/village-life.md` の「目覚めたおたま」等)を、指定のめざめの階段まで無事に連れて行く | 対象NPCを同伴させたまま指定階に到達 |

護送は仲間(`plan/companion-orders.md`)と同じ「同伴させて移動する」枠組みを
流用する。**護送対象は戦闘に参加させない**(戦えない代わりに、道中の危険を
プレイヤーと仲間で引き受ける、という緊張感を作る)。

## 依頼板の更新

`design/yorishiro-moods.md` と同じ「端末の日付をハッシュして決める」方式を
再利用し、**日替わりで3件**を提示する(気分の抽選と同じ仕組みを使い回すため、
実装の分岐を増やさない)。

- 常時受けられる依頼(討伐・採取・図鑑)に加え、`design/story.md` の
  章の進行に応じてのみ出現する依頼(護送など)を混ぜる。
- 同時に受注できる依頼は最大3件(`design/balance-philosophy.md` の
  「操作の複雑さを大きく崩さない」方針により、常に一覧を追う負担を
  増やさない)。
- 受注済みの依頼は日付が変わっても消えない(達成するか、明示的に
  破棄するまで残る)。翌日の新しい3件は、受注していない残り枠だけに補充される。

## 全滅時の扱い

`design/balance-philosophy.md` の「その場に存在する個体・持ち物は
全滅でロスト、知識・記録はロストしない」原則に従う。

- **採取・護送**: そのダイブで確保していた素材/連れていた対象は、
  他の持ち物・仲間と同じくロストする。依頼自体は失敗にならず、
  再挑戦できる(受注は取り消されない)。
- **討伐・探索・図鑑**: 撃破数・到達記録・図鑑登録は知識側の扱いなので、
  全滅しても達成済みの分は消えない。

## 報酬

- 主な報酬は所持金・素材。`plan/equipment-forging.md` の経済(ほこら粉・
  刻印石)を回す補助線として使う。
- ごく一部の依頼(章連動の護送など)の報酬は `design/village-life.md` の
  絆を大きく進める。数値効率より、村の暮らしの進み方に効かせる。
- `design/balance-philosophy.md` に従い、**戦闘力に直結する強力な報酬は
  用意しない**(依頼は目的の多様化が主目的であり、装備の強化値・印・
  夢あわせといった既存の強化手段を追い抜かせないようにする)。

## データ構造

```ts
export type QuestKind = "hunt" | "gather" | "explore" | "compendium" | "escort";

export interface QuestDef {
  id: string;
  kind: QuestKind;
  description: string;
  target: { speciesId?: string; itemDefId?: string; depth?: number; count?: number };
  reward: { gold?: number; materials?: { defId: string; count: number }[]; bondNpc?: string; bondAmount?: number };
  /** 常時候補に入るか、特定の章のみか */
  requiresChapter?: number;
}

export interface SaveData {
  // ...既存フィールド
  boardDate: string;              // 最後に依頼板を更新した日付キー
  activeQuests: { defId: string; progress: number }[];
  completedQuestIds: string[];    // 達成履歴。ロストしない
}
```

`design/yorishiro-moods.md` の `moodForDate` と同じ日付キーの仕組みで
`questsForDate(dateKey)` を作れるため、実装コストは小さい。

## 未決事項

- 依頼の具体的な報酬額・達成条件の個数
- 護送依頼の詳細な失敗演出(対象NPCが力尽きた場合の扱い)
- 同時受注数(3件)の妥当性はプレイテストで調整する
