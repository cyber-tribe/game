# 村の発展段階の条件を、地方拡張後のmaxDepthに合わせて調整する

> **実装済み。** `src/entities/village.ts`の`VILLAGE_STAGE_REQUIREMENTS`
> の`minDeepest`を本文どおり3/6/10→12/24/48に変更(`cost`・`label`は
> 変更なし)。既存テスト(`tests/village-development.test.ts`)は
> `nextVillageStageRequirement`等を経由した相対比較のみで具体値を
> 直接書いていなかったため、変更不要のまま通過した。新しい具体値
> (12/24/48)を回帰確認する1件だけ追加した。
>
> テストは既存の`tests/village-development.test.ts`に1件追加。
> `npx tsc --noEmit`・`npx vitest run`(559件全て通過)・
> `npm run build`を確認済み。他の実装への影響は本文の「波及確認」
> どおり、追加の変更は不要だった。

`plan/region-expansion.md` で `MAIN_CAVE_MAX_DEPTH` が10→48に変わった
ことで生じた整合性の崩れを直す。`plan/archive/village-development.md`
(実装済み)の `minDeepest` 条件は、当時「10階=表の寝穴の完全踏破」を
前提に「章クリアの代替指標」として設定されていた
(`src/entities/village.ts` 冒頭のコメントに明記されている)。48階への
拡張後もこの数値のままだと、**村段階4(コスチューム解放・腕試しの間
解放・postgame.mdが「物語クリア相当」とみなす節目)が、第2地方クリア
程度の早い段階で満たせてしまう。**

## 変更内容

`VILLAGE_STAGE_REQUIREMENTS`(`src/entities/village.ts`)の
`minDeepest` を、地方境界(`plan/region-expansion.md` の地方境界表、
6階ごと)に沿った値に調整する。

| 段階 | 現行(10階時代) | 変更後 | 対応する地方の節目 |
|---|---|---|---|
| 2 | 3 | 12 | 第二地方クリア(依頼板) |
| 3 | 6 | 24 | 第四地方クリア(工房の拡張) |
| 4 | 10 | 48 | 第八地方クリア=表の寝穴完全踏破(山を静めたあとの村) |

`cost`(必要ゴールド)・`label` は変更しない(発展の「重さ」の設計意図は
既存のまま維持し、到達難度の指標だけを地方構造に合わせ直す)。

## 波及確認

- `plan/multiple-dungeons.md` の「夜ごとの夢」解放条件
  (`{ minDeepest: MAIN_CAVE_MAX_DEPTH }` = 48)は既に定数参照のため、
  今回の変更と自然に整合する(変更不要)。
- `plan/archive/hidden-dungeon.md`(腕試しの間)の解放条件
  `{ minVillageStage: 4 }` は、段階4の到達難度が引き上がる分、
  結果的に「表の寝穴を完全踏破してから挑む」という当初の設計意図
  (`design/postgame.md` が村段階4を「物語クリア相当」とみなしている
  こと)に近づく。腕試しの間側の変更は不要。
- `plan/archive/costumes.md` の衣装(`villageStage: 4`)解放も同様に
  変更不要。難度が上がるだけで、条件式自体は影響を受けない。
- `plan/mountain-core.md`(このあと計画する「山の芯」)は、村段階4到達
  ではなく地方ボス撃破を独自の解放条件にする予定のため、本文書の
  変更と競合しない(詳細はそちらの文書側で扱う)。

## 実装への影響の見積もり

- `src/entities/village.ts`: `VILLAGE_STAGE_REQUIREMENTS` の
  `minDeepest` 3箇所の数値変更のみ。
- 既存テスト(`tests/village-development.test.ts` 等)のうち、旧しきい値
  (3/6/10)を直接使っているものは新しい値に更新が必要。

## 未決事項

- 段階2・3の`minDeepest`を地方境界(12/24)にきっちり合わせるか、
  もう少し早い段階(例: 各地方の中間、9/21)にして「地方クリアより
  少し手前で発展できる」余裕を持たせるかは、実装後のプレイ時間バランス
  (`design/balance-philosophy.md`)を見て調整の余地を残す。本文書の
  表は最も単純な「地方境界ちょうど」案を初期値として提示する。
