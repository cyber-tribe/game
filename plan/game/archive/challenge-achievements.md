> **実装済み。**
> `src/game.ts`(`usedItemThisRun`・`usedMultipleWeaponsThisRun`・
> `weaponKindThisRun`をGameクラスに追加。`useItem()`の実際に道具を
> 消費する経路(装備・素材・不発の杖を除く)で`usedItemThisRun`を立てる。
> `case "equip":`で武器カテゴリの新規装備(はずす操作は除く)ごとに
> 系統を比較し`usedMultipleWeaponsThisRun`を立てる新設`weaponKindOf`
> ヘルパーを追加)、`src/save.ts`(`recordRun`の`result`引数に
> `usedItem`・`usedMultipleWeapons`を追加。新設
> `checkChallengeAchievements`で即時判定)、`src/entities/achievements.ts`
> (4実績を追加)、`src/main.ts`(`finish()`が2フィールドを渡すよう変更)
> に実装した。テストは `tests/challenge-achievements.test.ts`(19件)。
>
> 実装時の判断:
> - 「武器の系統」はプラン想定の新規フィールドではなく、既存の
>   `ItemDef.attackPattern`をそのまま使った(基本形・上位形が同じ
>   `attackPattern`を持つ既存の設計と一致するため)。`attackPattern`
>   未指定の系統(なた/鉄のなた)は文字列`"basic"`に正規化して比較する。
> - 「持ち替え」の判定(未決事項だった、丸腰を挟んだ場合の扱い)は、
>   `weaponKindThisRun`を「はずす」操作では変更せず保持する方式にした。
>   結果として「A装備→はずす→B装備」は「Aからの持ち替え」として数える
>   (丸腰を挟んでも、直前に装備していた系統との比較で判定する)。
> - 「1地方踏破」(`noItemRegion`)・完全踏破系3実績はいずれも、
>   プランに明記の無かった`dungeonId === MAIN_CAVE_ID`(または未指定)
>   の判定を追加した。「地方」は表の寝穴だけの概念で、他のダンジョン
>   (夜ごとの夢等)は地方境界を持たないため。
> - `usedItemThisRun`は、装備(early return)・素材(使えず終わる)・
>   残り回数0の杖(不発)を除いた、実際に効果が発生する経路でだけ
>   立てるようにした(プランの「useItemコマンドの冒頭で」という
>   記述より厳密に、実際に使ったときだけ立つよう調整)。
> - 称号の文言(実績名・説明文含む)は新規に作成した。
> - 未決事項の「腕試しの間・忘れ物蔵への拡張」はプランどおりスコープ外
>   (`checkChallengeAchievements`は表の寝穴限定のまま、今回は実装しない)。

# 実績帳の「挑戦」カテゴリ(縛りプレイ実績)

`plan/archive/achievements.md`が「実装コストを見て初弾に含めるか判断する」
として見送った「挑戦」カテゴリに着手する。同文書が挙げた例(「1本の
武器種だけで表の寝穴を踏破する」「一度も道具を使わずに1地方を踏破する」)
を実装可能な形にする。

## 必要な追跡: ダイブ中の使用武器・使用アイテムの記録(新設)

`plan/archive/achievements.md`の`checkAchievements`は、既存のセーブ
フィールド(討伐・捕獲累計等)を再評価するだけの設計だった。「挑戦」
カテゴリだけは、**そのダイブ中に何をしなかったか**を見る必要があるため、
`plan/archive/hidden-dungeon.md`が`damageTakenThisRun`を`Game`に
新設したのと同じパターンで、軽量なダイブ中フラグを追加する。

```ts
// src/game.ts の Game クラスに追加(damageTakenThisRunと同じ並び)
usedItemThisRun = false;      // 杖・巻物・食料等を使ったか
usedMultipleWeaponsThisRun = false; // 武器を持ち替えたか
weaponKindThisRun: string | undefined; // 最初に使った武器の系統id
```

- `useItem`コマンド(道具・巻物使用)の冒頭で`usedItemThisRun = true`。
- 武器の`equip`コマンドで、`weaponKindThisRun`が既に別の系統(`plan/
  archive/protagonist-weapons.md`の系統id、なた/大鉈/等)なら
  `usedMultipleWeaponsThisRun = true`にする。素手・未装備からの初回
  装備は系統を記録するだけで「持ち替え」に数えない。

いずれも既存のコマンド処理に1行ずつ足すだけで、新しいイベント種別・
新しいUIは増やさない。

## `recordRun`への引き渡し

`plan/archive/hidden-dungeon.md`が`recordRun`の`result`引数に
`turns`/`damageTaken`を足したのと同じ形で、`usedItem`・
`usedMultipleWeapons`を追加する。

```ts
recordRun(save, {
  // ...既存フィールド
  usedItem: this.game.usedItemThisRun,
  usedMultipleWeapons: this.game.usedMultipleWeaponsThisRun,
});
```

`SaveData`自体には保存しない(ダイブ単位の一時情報のため)。`recordRun`
内部で、この回のダイブが「無道具踏破」「単一武器踏破」の条件を満たして
いれば、その場で`unlockAchievement`を呼ぶ(`checkAchievements`の
既存の毎回再評価パターンとは別枠の、ダイブ結果に応じた即時判定として
扱う。討伐累計等の「積み上がる系」の実績と性質が違うため、無理に同じ
関数にまとめない)。

## 実績例(確定案)

| id | 条件 | 称号 |
|---|---|---|
| `noItemRegion` | 道具を1つも使わずに1地方(6階分)を踏破する | なし |
| `noItemFullClear` | 道具を1つも使わずに表の寝穴を完全踏破する | 「素手の樽守り」 |
| `singleWeapon` | 武器を持ち替えずに表の寝穴を完全踏破する | 「一本気」 |
| `noItemSingleWeapon` | 上記2つを同時に満たす(無道具+単一武器) | 「求道者」 |

「1地方踏破」の判定は`plan/region-expansion.md`の地方境界(`deepest`が
6の倍数を跨いだ時点)を使う。`plan/checkpoint-select.md`が地方境界だけを
チェックポイントにする(`plan/region-expansion.md`側の変更)ため、
「区切って持ち帰った」タイミングと自然に一致する。

## 実装への影響の見積もり

- `src/game.ts`: `usedItemThisRun`・`usedMultipleWeaponsThisRun`・
  `weaponKindThisRun`の追加、`useItem`・`equip`コマンドでの更新。
- `src/save.ts`: `recordRun`の`result`引数拡張、挑戦系実績の即時判定
  ロジック追加。
- `src/entities/achievements.ts`(既存ファイル、`plan/archive/
  achievements.md`で新設済み): 上記4実績の定義追加。

## 未決事項

- 「持ち替え」の判定に、既存装備を外して丸腰になった状態を挟んだ場合の
  扱い(本文書は「同じ系統への再装備は持ち替えに数えない」を基本線と
  するが、丸腰を挟んだ場合の細部は実装時に詰める)。
- 称号の文言の最終調整。
- 「挑戦」カテゴリを腕試しの間(`plan/archive/hidden-dungeon.md`)・
  忘れ物蔵(`plan/lost-and-found-vault.md`)にも広げるかどうか(本文書は
  表の寝穴のみを対象とする)。
