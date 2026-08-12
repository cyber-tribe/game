> **実装済み。**
> `src/entities/dungeons.ts`(`NIGHTLY_DREAM_OVERFLOW_LAP`・
> `NIGHTLY_DREAM_LAP_MULTIPLIER`・`nightlyDreamStatMultiplier`を追加)、
> `src/dungeon/populate.ts`(`populateFloor`に`statMultiplier`引数を追加し、
> ボス・野生モンスター・群れ(swarm)の全生成箇所でmaxHp/atk/defに掛ける)、
> `src/game.ts`(`this.dungeon.id === NIGHTLY_DREAM_ID`のときだけ
> `nightlyDreamStatMultiplier(depth)`を計算して渡す)に実装した。
> テストは `tests/nightly-dream-scaling.test.ts`(6件)。
>
> プランからの調整点:
> - プラン本文が示したコード例(`laps = Math.floor((depth -
>   MAIN_CAVE_MAX_DEPTH) / NIGHTLY_DREAM_OVERFLOW_LAP)`)は、同じ文書内の
>   具体例表(「49〜60階: 倍率1.0」「61〜72階: 倍率1.15」)と食い違って
>   いた(コード例だと60階の時点で既に1.15になってしまう)。具体例表を
>   仕様として採用し、`laps = Math.floor((depth - MAIN_CAVE_MAX_DEPTH - 1)
>   / NIGHTLY_DREAM_OVERFLOW_LAP)`に直して表どおりの境界にした。
> - `difficultyMultiplier`(既存の難易度倍率)は`atk`にしか掛かって
>   いなかったが、`statMultiplier`はプランの指示どおりmaxHp/atk/defの
>   3値すべてに掛ける。両者は掛け算で併存する。
> - `expには掛けない`はプランどおり厳守(`monster.exp`は種族値のまま)。
> - `NIGHTLY_DREAM_OVERFLOW_LAP`(12)・`NIGHTLY_DREAM_LAP_MULTIPLIER`
>   (0.15)の数値はプランの初期案をそのまま採用した(未決事項として
>   明記されていたとおり、実測分布を見ての調整は今後の課題)。
> - ドロップ率・金貨の深さ応じた増加はプランどおりスコープ外(未実装)。

# 夜ごとの夢のモンスター強化カーブ

`plan/archive/multiple-dungeons.md`が未決事項として残していた「夜ごとの
夢」(終わりのない周回ダンジョン)のモンスター強化カーブを確定させる。
現状の実装は`MAIN_CAVE_MAX_DEPTH`(48)を超えた深さでも`speciesForDepth`
が単に同じ種族表を参照し続けるだけで、**49階以降はモンスターの強さが
頭打ちになり、深く潜るほど易しくなっていく**という逆転現象が起きる
(`design/balance-philosophy.md`の「深く潜るほど手強くなる」という
前提が、この無限モードだけ崩れている)。

## 方針: 新しい種族テーブルは作らず、既存の`Species`ステータスに
## 深さ超過ぶんの倍率を掛ける

`plan/archive/difficulty-modes.md`が`MONSTER_ATK_MULTIPLIER`のような
難易度別の乗数テーブルを既に持っているのと同じパターンで、**48階を
超えた深さぶんの乗数**を追加する。新しい敵・新しいAIは一切増やさない。

```ts
export const NIGHTLY_DREAM_OVERFLOW_LAP = 12; // 地方2つぶん(plan/region-expansion.mdの地方境界の倍)
export const NIGHTLY_DREAM_LAP_MULTIPLIER = 0.15; // 1周ごとに+15%

export function nightlyDreamStatMultiplier(depth: number): number {
  if (depth <= MAIN_CAVE_MAX_DEPTH) return 1;
  const laps = Math.floor((depth - MAIN_CAVE_MAX_DEPTH) / NIGHTLY_DREAM_OVERFLOW_LAP);
  return 1 + laps * NIGHTLY_DREAM_LAP_MULTIPLIER;
}
```

- 49〜60階: 倍率1.0(48階と同じ強さ。1周目の猶予)
- 61〜72階: 倍率1.15
- 73〜84階: 倍率1.30
- ……以後12階ごとに+15%、**上限は設けない**(`design/multiple-
  dungeons.md`の「潜れるだけ潜って自己ベストを更新する」という無限
  モードの性質上、意図的にキャップを作らない。どこまで潜れるかという
  問い自体がこのモードの遊びなので、頭打ちにしない)。

## 適用対象

`maxHp`・`atk`・`def`の3値すべてに同じ倍率を掛ける(個別に係数を
変えると調整が複雑になるだけで、`design/balance-philosophy.md`の
「シンプルさ」を損なう)。`exp`(経験値)には**掛けない**――強くなった
ぶんだけ経験値効率も良くなると、無限に強くなり続ける自己強化ループに
なり、`design/balance-philosophy.md`のパワーバジェット方針(全滅時の
ロストが唯一のブレーキ)と噛み合わなくなるため。

## 適用箇所

`src/dungeon/populate.ts`の`createMonster`呼び出し側
(`populateFloor`)で、`dungeonId === NIGHTLY_DREAM_ID`のときだけ
`nightlyDreamStatMultiplier(depth)`を`maxHp`/`atk`/`def`に掛ける。
`plan/archive/difficulty-modes.md`の難易度倍率とは**掛け算で併存**
させる(「きびしい」で夜ごとの夢に潜れば、難易度倍率×深さ超過倍率の
両方がかかる)。

## 実装への影響の見積もり

- `src/entities/dungeons.ts`または新規`src/entities/nightlyDream.ts`:
  `NIGHTLY_DREAM_OVERFLOW_LAP`・`NIGHTLY_DREAM_LAP_MULTIPLIER`・
  `nightlyDreamStatMultiplier`。
- `src/dungeon/populate.ts`: `createMonster`呼び出し箇所での倍率適用
  (`dungeonId`を`populateFloor`の引数として既に受け取っているかの
  確認が必要。受け取っていなければ引数追加)。

## 未決事項

- `NIGHTLY_DREAM_OVERFLOW_LAP`(12階)・`NIGHTLY_DREAM_LAP_MULTIPLIER`
  (15%)の具体的な数値は初期案。実装後、`nightlyDreamBestDepth`の
  実測分布を見て調整する。
- ドロップ率・金貨も同様に深さに応じて増やすかどうか(本文書はステータス
  面の強化だけを扱い、報酬面は`design/economy.md`のインフレ防止指針を
  踏まえ、当面は据え置きとする)。
