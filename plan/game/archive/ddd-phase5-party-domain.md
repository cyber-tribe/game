# DDD Phase 5: Party / Companion と Player 成長を分離する

関連: [ADR 0016](../../adr/0016-incremental-ddd-for-game-rules.md) Phase 5
前提: [Phase 4](ddd-phase4-turn-resolution.md) 完了(TurnContext のコールバック
`gainAllyExpFromKill` を実装で置き換えるため)

## 目的

仲間(Party/Companion)のルールと、隣接するプレイヤー成長のルール
(レベルアップ・ランスキル)を `src/domain/party/` と `src/domain/player/`
へ移す。挙動は一切変えない。

既に純粋関数化されているもの——`entities/player.ts` の `gainExp` /
`expToNext`、`entities/companionBond.ts` の `bondBonus` / `bondStage`、
`gainAllyExp`、ゆめわざ効果表(`systems/dreamArtEffects.ts` の
`DREAM_ART_EFFECTS`)——は**良い基準実装**であり、このPhaseは
「`Game` に残った接着部分」を移すのが主作業。

## 事前作業: ゴールデンテスト

`tests/party-golden.test.ts` を新設し、固定シードで以下を固定する。

- 敵撃破 → プレイヤー経験値 → 仲間へ50%配分 → 仲間レベルアップ →
  ゆめわざ習得のイベント列
- レベルアップ → スキル3択提示(`skillChoiceOffered`)→ 選択 →
  次の3択、の一連(pendingSkillChoice 中は他コマンド無視、も含む)
- 隊列指示(setAllyStance)の切り替えと行動の変化1例
- 捕獲済みタルの開封 → 仲間化(なじみボーナスが乗ること)

## 移すもの → 移し先

### `domain/party/allyGrowth.ts`

| 移動元(game.ts) | 備考 |
|---|---|
| `gainAllyExpFromKill()` | 50%配分・レベルアップ・ゆめわざ習得通知。Phase 4 の `TurnContext.gainAllyExpFromKill` コールバックをこの実装へ差し替える |

### `domain/party/allyOrders.ts`

| 移動元 | 備考 |
|---|---|
| `setAllyStance()` | 隊列指示(ALLY_STANCE_NAMES の表示はイベント側) |

### `domain/party/recruit.ts`

| 移動元 | 備考 |
|---|---|
| `releaseFromBarrel()` 内の仲間化部分(Phase 3 で `recruitFromBarrel` コールバックとして切り出したもの) | `createAllyFromStored` / なじみ(companionBond)適用・MAX_ALLIES 判定。ここで初めてコールバックが domain 実装になる |

### `domain/party/dreamArts.ts`

| 移動元 | 備考 |
|---|---|
| `castBarrelArt()` から呼ばれるゆめわざ発動可否(クールダウン・封じ判定) | 効果本体は `systems/dreamArtEffects.ts` にあるので、`systems/dreamArtEffects.ts` → `domain/party/dreamArtEffects.ts` へ**ファイルごと移動**する(ADR 0016「移すと決めたら旧ファイルは同PRで移動」) |
| `dreamArtContext()` | context 組み立ても party 側へ。コールバック実体は Phase 4 の domain/turn 関数を参照する形に薄くなる |
| `tickDreamArts()` のうち仲間個体のクールダウン・defBuffTurns 減衰部分 | パーティ持続効果(lanternGlow / partyGuard / echoAttack / lightBarrel)は Phase 4 の `TurnEffects` に置いたまま。tick の呼び出し順は変えない |

### `domain/player/runSkills.ts`

| 移動元 | 備考 |
|---|---|
| `offerNextSkillChoice()` / `resolveSkillChoice()` | 3択の抽選(`rollRunSkillChoices`)はカタログ側のまま。pendingSkillChoice / pendingLevelUpChoices の2フィールドを `SkillChoiceState` としてまとめ、Game からは1オブジェクトで持つ |
| `command()` 冒頭の「提示中は chooseSkill 以外無視」ガード | `SkillChoiceState` に対する判定関数として同モジュールへ |

### `domain/player/leveling.ts`

| 移動元 | 備考 |
|---|---|
| `killActor()` 内のプレイヤー経験値獲得〜`gainExp` 呼び出し〜レベルアップイベント生成部分 | `entities/player.ts` の `gainExp` / `expToNext` は**カタログではなくルール**なので、このPhaseで `domain/player/leveling.ts` へ移動する(entities に残すのは種族などの静的データのみ、という ADR の役割分担に合わせる)。`trainingFocus` も引数化 |

## 設計上の決め事

- `bossMoveContext` は Phase 4 の TurnContext と重複が出るが、boss 大技は
  Dungeon 領分(Phase 6)なのでこのPhaseでは触らない。
- なじみ(companionBond)の**参照**は domain/party から、**永続カウントの
  更新**は保存境界(main.ts / save)側のまま。ダイブ内で完結しない状態を
  domain に持ち込まない。
- `entities/ai.ts` の `decideAllyAction` は行動決定であり Phase 4 の
  actorActions が呼ぶ形を維持(このPhaseでは動かさない)。

## PR分割の目安

1. ゴールデンテスト追加
2. `domain/player/`(runSkills + leveling)
3. `domain/party/allyGrowth` + TurnContext コールバック差し替え
4. `domain/party/recruit` + BarrelContext コールバック差し替え
5. `domain/party/dreamArts` + dreamArtEffects のファイル移動

## 完了条件

- Phase 3/4 で作った `recruitFromBarrel` / `gainAllyExpFromKill`
  コールバックが domain 実装を指しており、Game に本体実装が無い
- レベルアップ・ランスキル・仲間成長・仲間化のルールが `game.ts` に
  残っていない
- `systems/dreamArtEffects.ts` が `domain/party/` へ移動済みで、
  `systems/` に party のルールが無い
- ゴールデンテスト・既存テストが無変更で pass
