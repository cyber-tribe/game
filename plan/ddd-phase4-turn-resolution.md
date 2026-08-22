# DDD Phase 4: Turn Resolution を分離する

関連: [ADR 0016](../adr/0016-incremental-ddd-for-game-rules.md) Phase 4
前提: [Phase 2](ddd-phase2-combat-rules.md)・[Phase 3](ddd-phase3-barrel-domain.md) 完了

## 目的

「1ターンの解決」——プレイヤー行動後の敵・仲間の行動、攻撃1回の解決
フロー、ダメージ適用と死亡連鎖、ターン終了処理(upkeep)——を
`src/domain/turn/` へまとめる。全Phase中で最も密結合な領域なので、
このPhaseだけは**ゴールデンテストを複数ターンのシナリオ**で先に固定する。

## 事前作業: ゴールデンテスト

`tests/turn-golden.test.ts` を新設。固定シードで「10ターン程度の
コマンド列(移動・攻撃・足踏み・アイテム使用の混在)」を2〜3本流し、
全ターンぶんの `GameEvent[]` の type 列を固定する。特に:

- 敵2体+仲間1体がいる状態のターン順(runActors の処理順)
- 深みタイル(quagmire)進入時の「もう1手」
- 状態異常(眠り・混乱・毒)の tick と自然回復
- 満腹度の減少と空腹ダメージ
- 湧き(SPAWN_INTERVAL)のタイミング

## 移すもの → 移し先

### `domain/turn/turnCycle.ts` — 1ターンの骨格

`command()` の「consumedTurn 後」の並びを、名前付きの手順として移す。

```
resolveTurn(ctx):
  runActors          … 敵・仲間の行動
  (quagmire なら runActors をもう1回)
  upkeep             … ターン終了処理
  turnCount++
  resolveActorOverlaps
```

**upkeep 内の tick 順序は現状の並びを仕様として固定する**
(tickStatuses → tickHunger → tickArtCooldowns → tickDreamArts →
tickRegen → tickSporeRooms → tickSummonedTorrentTiles → tickBoneWalls →
tickMirrors → tickTorch → 湧き → 死体除去)。順序をコメントではなく
関数の並びで表現し、変更が diff に出るようにする。

### `domain/turn/actorActions.ts` — 敵・仲間の1手

| 移動元 | 備考 |
|---|---|
| `runActors()` | 眠り/おどしなき/混乱/ねばりつきの行動スキップ・差し替えを含む |
| `buildActionDistanceFields()` | ダイクストラ距離場の遅延評価(ADR 0004) |
| `executeMonsterAction()` | AI が返した action の実行 |
| `moveActor()` / `applyTorrentPush()` / `tickQuagmireInvisibility()` | 移動と地形連動 |

`decideAllyAction` / `decideMonsterAction`(entities/ai.ts)の呼び出しは
そのまま。AI の意思決定はカタログ側、実行はターン解決側という分担。

### `domain/turn/attackResolution.ts` — 攻撃1回の解決フロー

Phase 2 で Game に残した部分をここへ移す。

| 移動元 | 備考 |
|---|---|
| `attack()` | Phase 2 の計算関数を呼ぶオーケストレーション |
| `applyAttackDamage()` | 満腹度ドレイン・反撃(counterDamageRatio)・こだまがえし |
| `applyOnHitStatuses()` / `applyEchoAttacks()` / `echoHit()` | 命中後の追加効果 |
| `attemptSteal()` | 盗み |

### `domain/turn/damage.ts` — ダメージ適用と死亡連鎖

| 移動元 | 備考 |
|---|---|
| `damageActor()` | ふんばり・目覚めのいのり・HP共有(hpOwnerOf)・目覚め |
| `hpOwnerOf()` / `mirrorSharedHp()` | 分身のHP共有 |
| `killActor()` | 死亡イベント・ドロップ・経験値の起点 |

**例外的に Game に残すもの**: `killActor` 内から呼ばれる
`trueAwakeningEnding`(エンディング分岐)と `gainAllyExpFromKill`
(Phase 5 の Party 領分)は、`TurnContext` のコールバックとして渡す。

### `domain/turn/statusTicks.ts` — 状態の時間経過

`tickStatuses` / `tickHunger` / `tickRegen` / `tickTorch` /
`tickArtCooldowns` を移す。フロアギミック系の tick
(`tickSporeRooms` / `tickSummonedTorrentTiles` / `tickBoneWalls` /
`tickMirrors`)は Phase 6 の Dungeon 領分なのでコールバックで残し、
turnCycle からは名前だけ呼ぶ。

## Context の設計

`TurnContext` を定義する。Phase 3 の `BarrelContext` より広くなるのは
やむを得ない(ターン解決は本質的に全域に触る)が、**View・保存・UI に
関わるものは一切入れない**。

```ts
// domain/turn/types.ts
export interface TurnContext {
  rng: Rng;
  floor: FloorState;
  player: PlayerState;
  allies: AllyActor[];
  runSkills: RunSkillId[];
  oncePerRun: OncePerRunTracker;
  mood: MoodDef;
  events: GameEvent[];
  // 消費型の一時状態(Game のフィールドから段階的にここへ引っ越す)
  hitThisTurn: Set<number>;
  // Game に残る処理へのコールバック(Phase 5/6/8 で置き換え予定)
  gainAllyExpFromKill(playerExp: number): void;
  trueAwakeningEnding(target: MonsterActor): void;
  tickFloorGimmicks(): void;
  isPlaying(): boolean;
  endRun(reason: string): void;
}
```

`partyGuardTurns` / `echoAttackTurns` / `lanternGlowTurns` /
`torchTurnsLeft` などターン数で減衰する Game フィールドは、このPhaseで
`TurnEffects` としてまとめ、`TurnContext` 経由で読み書きする
(ADR 0016 の DungeonRun 図にある RunEffects の実体)。

## PR分割の目安

1. ゴールデンテスト追加
2. `TurnEffects` の導入(Game フィールドの構造体化のみ、移動なし)
3. statusTicks の移動
4. damage の移動(damageActor / killActor)
5. attackResolution の移動
6. actorActions の移動
7. turnCycle の移動(command() が resolveTurn を呼ぶ形に)

## 完了条件

- `command()` のターン進行部分が `resolveTurn(ctx)` の1呼び出しになっている
- 複数ターンのゴールデンテストが無変更で pass
- upkeep の tick 順序が turnCycle.ts の関数並びとして読める
- `domain/turn/` から `game.ts` への import が無い
