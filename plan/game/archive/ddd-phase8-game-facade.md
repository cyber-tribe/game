# DDD Phase 8: Game を DungeonRun の Facade へ縮小する

関連: [ADR 0016](../../adr/0016-incremental-ddd-for-game-rules.md) Phase 8(最終)
前提: Phase 2〜7 完了

## 目的

Phase 2〜7 を終えた時点で `game.ts` に残っているものを棚卸しし、
`Game` を「DungeonRun の状態 + コマンドを domain へ振り分ける
Application Controller」へ縮小する。ここで初めてディレクトリの最終形
(ADR 0016 の推奨構成)が完成する。

## このPhase開始時に Game に残っている見込みのもの

1. **状態フィールド一式**(player / allies / floor / depth / rng / ids /
   TurnEffects / 樽比べ / ストーリーフラグ …)と `toSnapshot()`
2. **コマンド振り分け**(`command()` / `resolvePlayerCommand()` の
   switch、`wakesUpWith` ガード)
3. **アイテム系コマンド**(`pickUp` / `useItem` / `useTool` /
   `throwItem` / `dropItem` / `sellItem` / `applySharingHand`)
4. **移動コマンド**(`movePlayer` / `pushMonster` と店・金貨・罠・
   ヒントのチェック連鎖)
5. **主人公のわざ**(`useArt` / クールダウン)
6. **樽比べ一式・店・エンディング分岐**(各Phaseでスコープ外にしたもの)
7. **デバッグ/UI向けクエリ**(`giveItem` / `giveBarrel` /
   `captureOutlook` / `visibleMonsters` / `adjacentMonsters` / `freeTile`)

## 作業内容

### 1. 残るルールの domain 移動(先に済ませる)

| 対象 | 移し先 | 備考 |
|---|---|---|
| `src/items/inventory.ts` / `src/items/effects.ts` | `domain/item/` | 既に良いドメインモジュール。ファイルごと移動 |
| `src/items/catalog.ts` | `entities/itemCatalog.ts` | マスタデータなので entities 側へ(役割分担ルールの適用) |
| `useItem` / `useTool` / `throwItem` 内の効果適用ルール | `domain/item/` | 「どのアイテムが何をするか」は item のルール。効果は Phase 2〜6 の domain 関数を呼ぶ |
| `useArt` のわざ効果・クールダウンルール | `domain/player/arts.ts` | 主人公のわざ |
| `movePlayer` 内の移動可否・押し合い(`pushMonster`) | `domain/turn/movement.ts` | 地形・すれ違い判定。店・金貨・ヒントの反応は Phase 6 の domain/dungeon 関数呼び出しに置き換わっている |
| 樽比べ(`enterTarukurabeFloor` / `resolveTarukurabeHit` / `finishTarukurabeThrow` / `spawnTarukurabeBarrel` / 得点状態) | `domain/tarukurabe/` | 独立ミニゲームとして最後に独立させる |
| 店(`checkShoplifting` / `sellItem` / `shopWary`) | `domain/dungeon/shop.ts` | ダイブ内の店ルール |

### 2. application/dungeonRun の構築

```
src/application/dungeonRun/
├── game.ts           # Game クラス本体(src/game.ts から移動)
├── runState.ts       # DungeonRun の状態グループ(ADR 0016 の図の実体)
├── commands.ts       # コマンド → 処理関数の網羅 dispatch 表
└── storyMoments.ts   # エンディング分岐(maybePlayMountainCoreEnding / trueAwakeningEnding)
```

- `resolvePlayerCommand()` の switch を、ADR 0013 と同じ
  `{ [K in Command["type"]]: (game, cmd, events) => boolean }` 形の
  **網羅チェック付き dispatch 表**にする。新コマンド追加時に処理を
  書き忘れると typecheck が落ちる状態にする。
- 各エントリは domain 関数の呼び出し+Context 組み立てだけの薄い関数。
  1コマンド1クラスにはしない(ADR 0016 実装ルール10)。
- `src/game.ts` は削除し、import は `application/dungeonRun/game` へ
  一括更新(機械的変更。re-export シムは作らない)。
- デバッグ/UI向けクエリ(上記7)は Facade のメソッドとして残してよい
  (読み取り専用の窓口は Facade の正当な仕事)。

### 3. 最終検証

- `tests/` の全ゴールデンテスト(combat / barrel / turn / party /
  dungeon)が Phase 2 以降無変更のまま pass していることを確認
- `just playtest`(ヘッドレス通しプレイ、ADR 0006)を実行して
  正常終了すること
- 依存方向の検証を1本テスト化する:
  `domain/**` のファイルが `application/**`・`view/**`・`ui/**`・
  `save/localStorage` を import していないことを、import 文の静的走査
  (`tests/architecture.test.ts` 新設)で恒久チェックする

## 完了条件(= ADR 0016 の完了条件の検収)

- `Game` クラスが状態保持・dispatch・snapshot・読み取りクエリのみで、
  ドメインルールの実装を1つも含まない(目安: 500行以下)
- `src/` 直下が `domain/` `application/` `entities/` `core/` `view/`
  `ui/` `audio/` `save/` `main.ts` ほか技術層のみになっている
  (`systems/` `items/` `dungeon/` は存在しない)
- 新しいゲームルールの置き場所が ADR 0016 の判断手順で一意に決まる
  (レビューで「とりあえず Game に」が構造的に不可能になっている)
- `tests/architecture.test.ts` が依存方向を守っている
- 全テスト + playtest が green

## このPhaseでやらないこと

- 村(`ui/town.ts`)側の再設計(ADR 0016 でスコープ外と決定済み)
- ルールの挙動変更・バランス調整(全Phase共通)
- `Command` 型自体の再設計(dispatch 表化のみ)
