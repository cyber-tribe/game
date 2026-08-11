# 依頼板

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
