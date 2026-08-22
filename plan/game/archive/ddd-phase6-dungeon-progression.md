# DDD Phase 6: Dungeon Progression / Floor Rules を分離する

関連: [ADR 0016](../../adr/0016-incremental-ddd-for-game-rules.md) Phase 6
前提: [Phase 4](ddd-phase4-turn-resolution.md) 完了(`tickFloorGimmicks`
コールバックをこのPhaseで実装に差し替えるため)

## 目的

階層遷移・フロア入場・地域ギミック・ボス階・横穴・罠を
`src/domain/dungeon/` へ移す。挙動は一切変えない。

既存の `src/dungeon/`(generate / populate / gimmicks)は名前も内容も
既にドメインモジュールなので、このPhaseの最終PRで `src/domain/dungeon/`
へ**ディレクトリごと移動**し、「ダンジョンのルールの家が2つある」状態を
終わらせる(ADR 0016 の同PR移動ルール)。

## 事前作業: ゴールデンテスト

`tests/dungeon-golden.test.ts` を新設し、固定シードで以下を固定する。

- 階段で降りる → `enterFloor` → フロア到着までのイベント列
- チェックポイント階への到達
- ボス階入場(専用レイアウト・ボス配置)
- 横穴(branch)へ入る → 戻る
- 罠(いくつか代表2種)を踏んだときのイベント列
- 地域ギミック(胞子部屋・激流など代表2つ)の tick 1周

## 移すもの → 移し先

### `domain/dungeon/floorEntry.ts` — フロア入場

| 移動元(game.ts) | 備考 |
|---|---|
| `enterFloor()` | 生成・配置・ギミック抽選・章依存の障害物の呼び出し順を関数の並びとして固定 |
| `enterBossFloor()` | 専用レイアウト生成(corridor 掘り)ごと移す |
| `enterHinataFloor()` | ひなた階 |
| `enterBranchDungeon()` / `returnFromBranchDungeon()` / `enterBranchTile()` | 横穴の入退場。`hostContext` の退避・復元を含む |
| `spawnTarukurabeBarrel()` / `enterTarukurabeFloor()` | **移さない**(樽比べは Phase 3 同様スコープ外、Game に残す) |

### `domain/dungeon/progression.ts` — 進行

| 移動元 | 備考 |
|---|---|
| `descend()` | 深度更新・到達記録・checkpoint 判定 |
| `bankRun()` | 中断・持ち帰り |
| `openDoor()` | 扉 |
| `regionGimmickApplies()` | 地域ギミックの適用範囲判定 |
| `checkSecretPassageHint()` / `checkMonsterHouseWarning()` / `announceGround()` / `collectGold()` | 移動時のフロア反応。`checkShoplifting()` は店のルールなので Game に残す(Phase 8 で再評価) |

### `domain/dungeon/traps.ts` — 罠

| 移動元 | 備考 |
|---|---|
| `checkTrap()` / `triggerTrap()` / `alertNearbyMonsters()` | 発動判定と効果。状態異常付与は Phase 2/4 の domain 関数を使う |

### `domain/dungeon/floorGimmicks.ts` — フロアギミックの時間経過

| 移動元 | 備考 |
|---|---|
| `tickSporeRooms()` / `tickSummonedTorrentTiles()` / `tickBoneWalls()` / `tickMirrors()` | Phase 4 の `TurnContext.tickFloorGimmicks` コールバックをこの実装へ差し替える。tick 順は turnCycle 側の並びのまま |
| `markGroundSpikeWarnings()` / `freeSpotNear()` / `adjacentFreeSpot()` / `placeTemporaryWall()` / `digWall()` | 盤面操作ユーティリティ。bossMoves・ゆめわざからも使うため、ここに集約 |

### `domain/dungeon/bossMoves.ts` — 地方ボスの大技

`src/systems/bossMoves.ts` をファイルごと移動する(同PR移動ルール)。
`bossMoveContext()` の組み立ても dungeon 側へ移し、コールバック実体は
Phase 4/6 の domain 関数を直接参照して薄くする。これで `src/systems/`
は空になるので**ディレクトリごと削除**する。

### `src/dungeon/` → `domain/dungeon/` の統合(最終PR)

`generate.ts` / `populate.ts` / `gimmicks.ts` を `domain/dungeon/` へ
移動し、import を一括更新する。ロジックは触らない。

## Game に残るもの(Phase 8 で再評価)

- エンディング分岐(`maybePlayMountainCoreEnding` / `trueAwakeningEnding` /
  `trueAwakeningFarewellLine`)— ストーリー進行は Application 関心
- 樽比べ一式・店(`checkShoplifting` / `sellItem`)
- `enterFloor` をいつ呼ぶかの判断(command 処理)

## 設計上の決め事

- フロア入場系は `FloorEntryContext`(rng / ids / dungeon / depth /
  storyChapter / events …)を引数に取る関数群にする。`Game` の
  フィールド更新(`this.floor = …` / `this.depth = …`)は関数の戻り値を
  Game 側で代入する形にし、domain がフィールド代入まで抱え込まない。
- 罠・ギミックの効果は既存 domain 関数(addStatus / damageActor 相当)を
  使い、重複実装を作らない。

## PR分割の目安

1. ゴールデンテスト追加
2. traps + floorGimmicks(tickFloorGimmicks 差し替え)
3. progression(descend / bankRun / openDoor / フロア反応)
4. floorEntry(enterFloor 系 + 横穴)
5. bossMoves 移動 + `src/systems/` 削除
6. `src/dungeon/` → `domain/dungeon/` 統合

## 完了条件

- 階層遷移・フロア入場・罠・ギミックのルールが `game.ts` に無い
- `src/systems/` と `src/dungeon/` が存在しない(すべて `domain/` 配下)
- Phase 4 の `tickFloorGimmicks` コールバックが domain 実装を指す
- ゴールデンテスト・既存テストが無変更で pass
