# 主人公の鍛え方

> **実装済み。** `src/entities/player.ts`(`TrainingFocus` 型・`gainExp` の
> focus引数)・`src/game.ts`(`RunOptions.trainingFocus`)・`src/ui/town.ts`
> (拠点の4列目「鍛え方」)・`src/save.ts`(`SaveData.trainingFocus`・
> `setTrainingFocus`)・`src/main.ts`(選択の受け渡し)。
> テストは `tests/protagonist-training.test.ts`。
>
> 実装時の判断:
> - 「拠点の出発前にあらかじめ決めておく」方式のみを実装した。
>   「レベルアップ画面での都度選択」(専用モーダルUI)は見送っている。
>   毎回選ばせる方式自体が「操作の複雑さを大きく崩さない」方針と
>   相性が悪いという文書内の指摘を踏まえ、まずは軽い方の実装に絞った。
> - 「一度選んでおけば以後は何も聞かれない」を成り立たせるため、
>   仕様書には明記の無い `SaveData.trainingFocus` を追加し、拠点で選んだ
>   方針を次回の拠点表示にも引き継ぐようにした。
> - 数値は仕様書の目安(offense: atk+3 / defense: def+2 / balance:
>   atk+1・def+1、maxHp+6は共通)をそのまま採用した。
> - `plan/mid-dive-autosave.md`(アーカイブ済み)の `RunSnapshot` に
>   `trainingFocus` を追加した。無いと、ダイブ中オートセーブから復帰した
>   あとのレベルアップが既定の "balance" に戻ってしまうため。

現状の実装(`src/entities/player.ts` の `gainExp`)は、レベルが上がると
`maxHp+6` `atk+2` `def+1` が**固定**で付く。`design/protagonist.md` の
通りレベルは毎ダイブ1に戻るため、これは「毎回同じ成長を辿るだけ」に
なっている。ここに**レベルアップのたびの小さな選択**を足し、同じ
序盤・中盤でも今回はどう育てるかという方針を選べるようにする。

## 仕組み

レベルアップ時、`maxHp+6` は**どちらを選んでも共通の保証**として残す
(丸腰で不利になりすぎないための下限)。そのうえで、残りの成長を
3つから選ぶ。

| 鍛え方 | 効果 |
|---|---|
| 攻めを鍛える | `atk+3` |
| 守りを鍛える | `def+2` |
| バランスよく鍛える | `atk+1` `def+1`(迷ったときの既定値。おおむね現行の固定成長に近い) |

- 毎ダイブレベル1から始まり直すため、**この選択も毎ダイブやり直せる**。
  「今回は攻め気味に」「今回は硬めに」というダイブごとの方針が生まれ、
  `design/balance-philosophy.md` の反復感対策(同じ地方でも体験を
  変える)に、育成面から寄与する。
- `plan/protagonist-arts.md` の技(レベル3/7/12/16/20で習得)は、この
  選択とは無関係に固定で習得する(鍛え方は数値成長だけに関わる)。

## 操作の簡略化

毎回選ばせると19回(レベル2〜20)も選択を挟むことになり、
`design/balance-philosophy.md` の「操作の複雑さを大きく崩さない」方針に
反する。以下で軽減する。

- レベルアップ画面で、**直前に選んだものと同じ方針をもう一度選ぶ操作を
  1ボタンで済ませる**(3択のうち直前の選択にカーソルが残っている状態で
  即決定できる)。
- 拠点の出発前に「今回の方針」をあらかじめ決めておける
  (`design/ui-flow.md` の出発前画面に1項目追加)。決めておくと、
  レベルアップのたびに自動でその方針が適用され、**選択画面自体を
  出さない**設定にできる。深く考えずに遊びたいプレイヤーは、拠点で
  一度「バランスよく」を選んでおけば以後は何も聞かれない。

## データ構造

```ts
export type TrainingFocus = "offense" | "defense" | "balance";

// gainExp の中の固定成長を置き換える
function applyLevelUp(player: PlayerState, focus: TrainingFocus): void {
  player.maxHp += 6;
  player.hp += 6;
  if (focus === "offense") player.atk += 3;
  else if (focus === "defense") player.def += 2;
  else {
    player.atk += 1;
    player.def += 1;
  }
}

// RunOptions に追加(出発前にあらかじめ決めておく場合)
defaultTrainingFocus?: TrainingFocus;
```

## バランス上の注意

- 3択とも「1レベルぶんの成長の配分」が変わるだけで、**合計の伸び幅の
  総量は大きく変えない**(`design/balance-philosophy.md` のパワー
  バジェット方針)。攻め・守りに極振りしても、20レベル到達時点の
  最終値が他方針と比べて極端に強すぎたり弱すぎたりしないよう、
  実装時に数値を確認する。
- `plan/protagonist-weapons.md` の武器種(間合い重視・速さ重視等)との
  組み合わせを意識する(例: 主の大槌(最大火力・行動遅延あり)に
  「守りを鍛える」を合わせて隙をカバーする、といった選び方が自然に
  生まれるようにする)。

## 未決事項

- 各方針の具体的な数値(atk+3/def+2/atk+1&def+1)の最終調整
- レベルアップ画面のUI(3択のうちどれを既定カーソルにするか)
- 「今回の方針」を出発後に変更できるようにするか(本文書では出発前
  固定、レベルアップ画面での都度変更の両方を認める前提にしている)
