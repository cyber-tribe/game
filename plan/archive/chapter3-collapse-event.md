> **実装済み。**
> `src/entities/dungeons.ts`(`CHAPTER3_COLLAPSE_DEPTH = REGION_SIZE * 4`
> =24を追加)、`src/dungeon/populate.ts`(`placeChapter3CollapseObstacle`を
> 新設。既存の`FieldObstacle`(`requires: "break"`)をそのまま使う)、
> `src/game.ts`(`RunOptions.deepest`を新設し、24階かつ`MAIN_CAVE_ID`かつ
> `storyChapter(deepestAtStart, false) >= 3`のときだけ配置)、
> `src/main.ts`(`newRun`が`this.save.deepest`を渡すよう変更。章突入
> メッセージの直後にモグラ婆の助言メッセージを追加)に実装した。
> テストは `tests/chapter3-collapse-event.test.ts`(8件)。
>
> **プランに無かった重要な追加判断: `deepest>=30`(第三章到達済み)を
> 条件に加えた。** プラン本文は「24階に固定でFieldObstacleを配置する」
> とだけ書いていたが、それだと**初めて第四地方を通過するプレイヤーが、
> 瓦礫を砕ける仲間(fieldSkill: "break")をまだ持っていない場合に
> 詰む**(FieldObstacleは既存仕様どおり本当に通行不能で、ダイブ中に
> 引き返す手段は無い)。design/story.mdの「近道屋の裏穴」記述
> (`plan/checkpoint-select.md`の「既に一度通過して既知になった
> めざめの階段へ、拠点から選び直して戻る」)を読むと、この崩落は
> **最初から存在するのではなく、第三章に入ったあとの「戻りのダイブ」で
> 初めて意味を持つ**という設計だと判断した。deepest>=30は「既に24階を
> 越えたことがある」ことを意味するので、初回プレイヤーを足止めしない。
>
> その他の実装判断:
> - 出口タイルの選定は「階段のある部屋のタイルのうち、通路タイルに
>   隣接するものを1つ(先頭一致)」というシンプルな決定的ロジックにした
>   (乱数を使わない。同じフロアなら毎回同じ出口になる)。
> - `fieldSkill: "break"`を持つ種族の第四地方内での確認: `yoroimukade`
>   (ヨロイムカデ、minFloor:19、第四地方の範囲内)が既に存在したため、
>   プランの「無ければ既存種のminFloorを調整する」対応は不要だった。
> - 助言NPCはモグラ婆(育ての親・倉庫番)を選んだ(未決事項として
>   両論併記されていたうちの1つ。仲間探しの助言役として自然という判断)。
> - 助言メッセージの文面は新規に作成した。

# 第三章「仲間探し」の崩落イベント

`plan/story-chapters.md`が「本文書のスコープ外」として`plan/ally-
field-gimmicks.md`側の改修に譲っていた、`design/story.md`第三章冒頭の
「骨積みの回廊の出口をふさぐ崩落」を実装可能な形にする。既存の
`FieldObstacle`(`plan/archive/ally-field-gimmicks.md`)の仕組みを
**そのまま再利用**し、新しいゲームプレイ機構は作らない。

## 内容

- **第四地方(骨積みの回廊、19〜24階)の最終階(24階)**、めざめの階段の
  ある部屋の出口に、**固定で`FieldObstacle`(`kind: "break"`)を配置する**。
  通常のダイブでランダムに生成される`fieldObstacles`とは別枠の、
  物語上意味を持つ固定配置として扱う。
- 通過には`fieldSkill: "break"`を持つ仲間を連れている必要がある
  (既存のFieldObstacle解決ロジックをそのまま使う。新しい判定は不要)。
- 初めてこの階に到達した時点(`storyChapter(deepest, storyCleared)`が
  まだ2以下から3に上がる瞬間、`plan/story-chapters.md`の章遷移メッセージ
  と同じタイミング)で、`plan/village-life.md`のNPC(ゲンドかモグラ婆、
  design文書の記述どおりどちらでもよい)から**「崩落の向こうへ進むには、
  瓦礫を砕ける仲間が要りそうだ」という助言メッセージ**を出す
  (拠点帰還時、既存の`GameEvent`(`message`)を使う。新規UIなし)。

## 「仲間探しに専念する」の実現方法(確定: 強制ではなく誘導)

`design/story.md`は「あえて骨積みの回廊へ戻る」という展開を記述して
いるが、**プレイヤーの行動を強制する新しいゲームプレイ機構は作らない**。
既存の`plan/checkpoint-select.md`の仕組み(既知のめざめの階段から
直接出発できる)がそのまま解決策になる: 骨積みの回廊(第四地方)の
めざめの階段は既に既知(通過済み)のため、プレイヤーは**拠点の出発地点
選択でそこを選び直すだけ**で、自然に「仲間探しのために骨積みの回廊へ
戻る」というプレイができる。新しい強制イベント・専用モードは不要。

- `fieldSkill: "break"`を持つ種族のうち、19〜24階(第四地方)で捕獲
  可能な種族が既に存在するかを確認する必要がある(`src/entities/
  species.ts`の`minFloor`と`fieldSkill`の対応関係の実装時確認)。
  **もし該当種族が第四地方に存在しない場合、本文書の実装として、
  既存の`fieldSkill: "break"`種族のうち1種の`minFloor`を第四地方の
  範囲(19〜24)に収まるよう調整する**(新種は追加しない。既存種の
  出現階の再配置だけで解決する)。

## 崩落の解除(恒久化)

一度その仲間を連れて崩落を突破すれば、`FieldObstacle`の既存仕様どおり
**そのダイブの間だけ**解除された状態になる(次のダイブでは崩落は再び
存在する。ランダム生成される他のFieldObstacleと同じ挙動)。物語上の
「突破した」という事実は、`plan/story-chapters.md`の章遷移
(`storyChapter >= 3`に到達済みかどうか)で管理し、**崩落そのものを
セーブデータで恒久的に消す処理は行わない**(`design/world.md`の
「ダイブごとに夢が新しく組み上がる」という世界観と整合させる。物語上は
「1回突破した」という事実だけが意味を持ち、以後のダイブで毎回崩落を
避けて通れるようにする必要はない)。

## データ構造

新しいセーブフィールドは不要。`plan/story-chapters.md`の
`storyChapter`関数と、`plan/archive/ally-field-gimmicks.md`の既存
`FieldObstacle`機構の組み合わせだけで完結する。

## 実装への影響の見積もり

- `src/dungeon/generate.ts`または`populate.ts`: 第四地方24階の生成時、
  固定の`FieldObstacle(kind: "break")`を出口に配置する特別分岐を追加
  (`plan/region-bosses.md`のボス階専用生成と同じ「特定階だけ特別扱い」
  のパターン)。
- `src/entities/species.ts`: 該当種族が第四地方に無ければ、既存
  `fieldSkill: "break"`種族1種の`minFloor`を調整。
- `src/main.ts`: 章遷移(`plan/story-chapters.md`)時のメッセージに、
  第三章突入時だけ専用の助言メッセージを追加。

## 未決事項

- 助言NPCをゲンド・モグラ婆のどちらにするか(design文書は「ゲンドか
  モグラ婆」と両論併記のまま)。
- 実際の助言メッセージの文面。
- `fieldSkill: "break"`種族の第四地方内での再配置が必要かどうかの
  実装時確認(既に条件を満たしている可能性もある)。
