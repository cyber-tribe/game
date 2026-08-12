# ヨリシロの気分

`design/yorishiro-moods.md` が定義した「日替わりでダイブ全体にかかる
補正」を実装可能な形に確定させる。データ構造・係数の合成方針
(地方の基礎値 × 気分の係数 × フロアギミックの係数、という単純な掛け算)
は同文書のものをそのまま採用する。

## 気分の決定方法(確定)

`design/yorishiro-moods.md` の「実行中の端末の日付から一意に決まる」を
そのまま採用する。追加のセーブフィールドは不要(その日の日付から
毎回同じ気分が再計算できるため、永続化する必要がない)。

```ts
export function todayKey(date = new Date()): string {
  // YYYY-MM-DD(ローカルタイムゾーン)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

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

- `src/entities/moods.ts`(新規): `MoodDef`・`MOODS`・`todayKey`・
  `moodForDate`。
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
