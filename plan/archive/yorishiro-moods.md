> **実装済み。** `src/entities/moods.ts`(新規)に`MoodDef`・`MOODS`
> (6種)・`moodForDate`を実装。地方の基礎値×気分の係数×ギミックの係数
> という掛け算合成方針どおり、`src/game.ts`の`enterFloor`が持っていた
> 既存の係数計算(`monsterHouseChanceMultiplier`・`shopChanceMultiplier`・
> `GIMMICK_CHANCE_MULTIPLIER`・`shiningChanceMultiplier`・
> `GOLD_REWARD_MULTIPLIER`)の末尾にそれぞれ`this.mood.xxxMul ?? 1`を
> 掛けるだけで反映した。
>
> **`dropRateMul`・`thiefRateMul`は、本文書が「既存の処理に1項足すだけ」
> としていたが実際にはその既存処理自体が無かった**ため、実装時に新設
> した: `dropRateMul`は`populateFloor`(`src/dungeon/populate.ts`)の
> フロア設置アイテム数(`itemCount`)に掛ける`itemCountMultiplier`
> パラメータとして、`thiefRateMul`は野生湧きの重み抽選で`ai: "thief"`
> (スリガラス)の重みだけを底上げする`thiefWeightMultiplier`パラメータ
> として新設した(モンスターハウス・野良湧きの2箇所目以降には広げず、
> 主要な野生湧きの1箇所だけに絞った)。
>
> **`awareDistanceMul`も、本文書の言う「既存の索敵距離判定」が実際には
> 存在しなかった**(`canSee`は「隣接」または「同室」の二値判定で、
> 連続的な距離のしきい値を持たない)。実装時の判断で、「隣接時は必ず
> 気づく(奇襲を許さない)。それ以外(同室内だが隣接していない相手)は、
> 気づく判定そのものを`rng.chance(awareDistanceMul)`の確率ロールに
> する」という解釈に落とし込んだ(`src/entities/ai.ts`の
> `attemptSight`)。既定値1では従来どおり必ず気づく(確率ロール自体を
> 通らない)ため、この文書を実装する前の挙動を完全に保つ。
>
> `monsterAtkMulAfterAware`は、モンスターは気づいていないと攻撃できない
> (=攻撃する時点で必ず`aware`)ため、実質「モンスターの攻撃力そのもの」
> に等しいと判断し、既存の`MONSTER_ATK_MULTIPLIER[difficulty]`の計算
> チェーンにそのまま合成した。
>
> 「深い眠り」の`awareDistanceMul`は、本文書の記述が自己矛盾していた
> (表では1.3だが「実装時は0.6寄りの値にする」との注記があった)ため、
> `nightly-dream-scaling.md`と同じ要領で後者を採用し、素直に`0.6`とした。
>
> **実装中に見つけて修正した設計上の問題**: `Game`のコンストラクタが
> `moodOverride`省略時に`moodForDate(todayKey())`で実際の日付から気分を
> 決める、という本文書どおりの実装を最初に行ったところ、`seed`だけで
> 完全に決定的なRNG列を前提とする既存の多数のテストが、**CI実行日に
> よって結果が変わってしまう**という重大な不具合を引き起こした(実際に
> `tests/wetland-quagmire.test.ts`が本セッション実行日の気分「寝苦しい
> 夜」のせいで落ちるのを確認した)。`compendiumComplete`・
> `trueAwakeningCleared`と同じ設計に揃え、**`Game`自身は現実の日付に
> 依存させず**(`moodOverride`省略時は補正なしの既定の気分
> `DEFAULT_MOOD_ID`)、実際の日付から今日の気分を決める責務は
> `src/main.ts`側(ダイブ開始時に`moodForDate(todayKey())`を明示的に
> `moodOverride`へ渡す)に持たせる形に修正した。
>
> 表示は`src/ui/town.ts`の「潜るダンジョン」列の見出し直下に、今日の
> 気分の名前とフレーバー文を1行追加しただけ(新しいUIコンポーネントは
> 増やしていない)。
>
> テストは`tests/yorishiro-moods.test.ts`(気分の日付決定・
> `moodOverride`・`awareDistanceMul`の確率ロール)で検証。拠点画面での
> 表示もブラウザで確認済み。

# ヨリシロの気分

`design/yorishiro-moods.md` が定義した「日替わりでダイブ全体にかかる
補正」を実装可能な形に確定させる。データ構造・係数の合成方針
(地方の基礎値 × 気分の係数 × フロアギミックの係数、という単純な掛け算)
は同文書のものをそのまま採用する。

## 気分の決定方法(確定)

`design/yorishiro-moods.md` の「実行中の端末の日付から一意に決まる」を
そのまま採用する。追加のセーブフィールドは不要(その日の日付から
毎回同じ気分が再計算できるため、永続化する必要がない)。

**日付キーの算出は新規に作らず、`plan/archive/quest-board.md` が既に
実装済みの `todayKey`(`src/entities/quests.ts`)をそのまま import して
使う。** 依頼板・気分・後述の村の祭り(`plan/yoimatsuri-festival.md`)が
みな同じ日付キーを共有することで、「今日は何の日か」がずれなく揃う。

```ts
import { todayKey } from "./quests";

export function moodForDate(dateKey: string): MoodId {
  let h = 0;
  for (let i = 0; i < dateKey.length; i++) h = (h * 31 + dateKey.charCodeAt(i)) >>> 0;
  return MOOD_IDS[h % MOOD_IDS.length];
}
```

## `Game` への接続

`RunOptions`(`src/game.ts`)に、テスト用の上書き手段として
`moodOverride?: MoodId` を追加する(既存の`seed`と同じ考え方。省略時は
`moodForDate(todayKey())`で実際の日付から決まる)。

```ts
export interface RunOptions {
  // ...既存フィールド
  moodOverride?: MoodId;
}
```

`Game`のコンストラクタで気分を1つ確定させ(`this.mood: MoodDef`)、
ダイブ中は変えない(`design/yorishiro-moods.md`の「日付をまたいでも
そのダイブ内は開始時の気分で固定する」を確定方針として採用)。

## 既存の係数計算への合成

`src/game.ts`の`enterFloor`が既に持っている、地方・ダンジョンの係数
(`plan/archive/multiple-dungeons.md`の`monsterHouseRateMul`・
`shopRateMul`)の計算に、気分の係数を掛け算で足すだけで実装できる。

```ts
// 変更前(例)
MONSTER_HOUSE_CHANCE_MULTIPLIER[this.difficulty] * (this.dungeon.monsterHouseRateMul ?? 1)
// 変更後
MONSTER_HOUSE_CHANCE_MULTIPLIER[this.difficulty]
  * (this.dungeon.monsterHouseRateMul ?? 1)
  * (this.mood.monsterHouseRateMul ?? 1)
```

同様に`shopRateMul`・`plan/archive/floor-gimmicks.md`の抽選確率・
`plan/archive/monster-compendium.md`の「かがやきの夢のかけら」出現率
(`rareSpawnRateMul`)にも、既存の掛け算の最後に1項足すだけで反映できる。
ドロップ量・所持金倍率(`dropRateMul`・`goldRateMul`)は、既存の
ドロップ処理・所持金加算処理にそれぞれ同様に1項足す。

`awareDistanceMul`・`monsterAtkMulAfterAware`は、`src/entities/ai.ts`の
既存の索敵距離判定・ダメージ計算に、`this.mood`から渡された係数を
掛けるだけで実装できる(新しいAI分岐は不要)。

## 気分の一覧(確定案)

`design/yorishiro-moods.md`の初期案をそのまま採用し、係数の初期値だけ
具体化する。

| 気分 | 係数(初期値) |
|---|---|
| おだやかな寝息(既定) | 補正なしぶんすべて1 |
| 浅い眠り | `awareDistanceMul: 0.7`, `dropRateMul: 0.85` |
| 深い眠り | `awareDistanceMul: 1.3`(気づくのが遅い=判定距離を縮める方向と逆の値なので、実装時は「気づく距離を縮める」表現に合わせ`0.6`寄りの値にする。最終値は実装後の体感で調整), `monsterAtkMulAfterAware: 1.2` |
| 寝苦しい夜 | `floorGimmickRateMul: 1.5`, `monsterHouseRateMul: 1.5`, `dropRateMul: 1.2`, `goldRateMul: 1.2` |
| 虫の知らせ | `rareSpawnRateMul: 1.5`, `dropRateMul: 0.9` |
| 近道屋の気配 | `shopRateMul: 1.5`, `thiefRateMul: 1.5` |

いずれも`design/yorishiro-moods.md`の「損な日にしない」原則どおり、
効果と代償が対になるよう組んである。数値自体は仮であり、実装後の
プレイテストでの調整を前提にする(未決事項として明記済みの方針を
そのまま継承)。

## 表示

拠点の出発前画面(`src/ui/town.ts`、ダンジョン選択の並び)に、今日の
気分の名前・フレーバー文を1行添える。新しいUIコンポーネントは増やさず、
既存のダンジョン一覧の上に固定テキストとして表示する。

## 実装への影響の見積もり

- `src/entities/moods.ts`(新規): `MoodDef`・`MOODS`・`moodForDate`
  (`todayKey`は`src/entities/quests.ts`から import して使う)。
- `src/game.ts`: `RunOptions.moodOverride`、`Game.mood`フィールド、
  既存の各種係数計算への合成。
- `src/entities/ai.ts`: 索敵距離・気づいた後の攻撃力への係数適用。
- `src/ui/town.ts`: 今日の気分の表示。
- テスト: `moodForDate`が日付ごとに安定した値を返すこと、
  `moodOverride`で特定の気分を固定してダイブを生成できること
  (`floorGimmickRateMul`等が実際に反映されることの確認に使う)。

## 未決事項(design/yorishiro-moods.mdから継続)

- 各気分の係数の最終的な調整値。
- 気分そのものを図鑑的に記録するかどうかは、本文書でも見送る
  (既存の図鑑・実績カテゴリを増やすほどの優先度は無いと判断)。
