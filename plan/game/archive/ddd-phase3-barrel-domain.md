# DDD Phase 3: Barrel ドメインを作る

関連: [ADR 0016](../../adr/0016-incremental-ddd-for-game-rules.md) Phase 3
前提: [Phase 2](ddd-phase2-combat-rules.md) 完了(移行パターンとゴールデンテストの型が確立していること)

## 目的

このゲーム固有のコアドメインであるタルのルール
(持ち上げ・投擲・開封・捕獲・仲間化・元素タル・タルわざ・爆発)を
`game.ts` から `src/domain/barrel/` へ移す。挙動は一切変えない。

**樽比べ(tarukurabe)はスコープ外。** 樽比べは「タル」ではなく
「ミニゲームの得点進行」のルールであり、`resolveTarukurabeHit` /
`finishTarukurabeThrow` / `spawnTarukurabeBarrel` / `enterTarukurabeFloor`
は `Game` に残す(Phase 8 で再評価)。ただし `resolveEmptyBarrel` から
的(`hit.kind === "target"`)への分岐はコールバックとして残す(後述)。

## 事前作業: ゴールデンテスト

`tests/barrel-golden.test.ts` を新設し、固定シードで以下のシナリオの
`GameEvent[]` 列を固定する。

- 持ち上げ → 置く(前方が塞がっている/いないの両方)
- 空タル投げ → 命中 → 捕獲成功(イベント列に `capture` が入る)
- 空タル投げ → 捕獲失敗(`captureFailed` → ドロップ)
- 空タル投げ → 満員(MAX_ALLIES)時は判定に進まない
- ボムタルの爆発(範囲・連鎖)
- 水・風・石・眠りタルの開封それぞれ1本
- いたわり投げ(HP1ちょうどまで削る)

## Context の設計

タルのルールは戦闘計算と違い、フロア状態の書き換え(アクター除去・
タル設置・爆発)まで踏み込む。`bossMoveContext` / `dreamArtContext` と
同じ確立済みイディオムで、narrow な `BarrelContext` を定義する。

```ts
// domain/barrel/types.ts
export interface BarrelContext {
  rng: Rng;
  floor: FloorState;
  player: PlayerState;
  allies: AllyActor[];
  runSkills: RunSkillId[];
  events: GameEvent[];
  // Game 側に残る処理への narrow なコールバック
  damageActor(target: Actor, damage: number, critical: boolean): void;
  addStatus(target: Actor, kind: StatusKind, turns: number, verb: string): void;
  resolveTarukurabeHit(hit: TargetActor): void; // 樽比べはGame側
  recruitFromBarrel(barrel: Barrel, landing: Vec2): void; // 仲間化(Phase 5の対象。当面Game実装)
}
```

`Game.barrelContext(events)` を `effectContext` と同様に生やし、
呼び出しごとに組み立てる。コールバックは「Game に残ると Phase 計画で
決めたもの」だけに限定し、安易に増やさない(増やしたくなったら、
その処理自体を domain へ移すサインとみなす)。

## 移すもの → 移し先

| 移動元(game.ts) | 移し先 | 備考 |
|---|---|---|
| `liftOrPutBarrel()` | `domain/barrel/barrelLift.ts` | 持ち上げ・置く・ukemiReady 連動 |
| `traceThrow()` | `domain/barrel/barrelThrow.ts` | 軌道計算(純粋関数にできる) |
| `throwCarriedBarrel()` | `domain/barrel/barrelThrow.ts` | 貫通(抱え投げの奥義)含む |
| `applyElementalBarrelHit()` | `domain/barrel/barrelElemental.ts` | 目つぶし・眠り |
| `openCarriedBarrel()` / `openWaterBarrel()` / `openWindBarrel()` / `openStoneBarrel()` / `openSleepBarrel()` | `domain/barrel/barrelOpen.ts` | 開封5種 |
| `resolveEmptyBarrel()` | `domain/barrel/barrelCapture.ts` | 捕獲判定の本体。HP1保険・いたわり投げ・なだめの手つき(captureBonus)・腕輪/スキル補正・確率上限0.9 |
| `captureOutlook()` | `domain/barrel/barrelCapture.ts` | UI向け見込み表示も同じ式を使う(式の重複を1箇所に) |
| `dropBarrelNear()` / `releaseFromBarrel()` | `domain/barrel/barrelDrop.ts` | 転がし・砕け・中身の解放 |
| `explode()` / `burstBarrel()` | `domain/barrel/barrelExplosion.ts` | ボム連鎖・攻撃で割れる処理 |
| `castBarrelArt()` | `domain/barrel/barrelArt.ts` | タルわざ |
| `barrelThrowDamage()`(Phase 2 で domain/combat に置いたもの) | そのまま | barrel 側から import する |

定数(`BARREL_DAMAGE`, `CAPTURE_MASTERY_BONUS`, 爆発範囲・ダメージ等)も
対応モジュールへ移す。`captureChance()` が `entities/` 側にある場合は
呼び出しのみ(カタログ参照として維持)。

## 設計上の決め事

- Phase 2 と同じ原則: Domain は `entities/` カタログ参照可・
  `events` push 可・`Game`(this)は渡さない・乱数消費順を変えない。
- **仲間化(recruit)は Phase 5 の Party ドメインの領分。** このPhaseでは
  `recruitFromBarrel` コールバックで Game 実装のまま呼び、捕獲(タルに
  吸い込むまで)と仲間化(パーティへの加入処理)の境界をここで切っておく。
- `resolveEmptyBarrel` 内の「捕獲対象はHP1未満にしない」保険と
  いたわり投げは、**捕獲ルールの一部**として barrelCapture.ts に置く
  (combat のダメージ計算には混ぜない)。
- タルの状態遷移(empty → caught / bomb 爆発済み等)は各関数内で
  barrel オブジェクトを直接書き換えてよい(barrel はドメイン状態)。

## PR分割の目安

1. ゴールデンテスト追加
2. 軌道・持ち上げ・ドロップ(traceThrow / liftOrPutBarrel / dropBarrelNear / releaseFromBarrel)
3. 開封・元素タル(open* / applyElementalBarrelHit)
4. 捕獲(resolveEmptyBarrel / captureOutlook)+ BarrelContext 導入
5. 爆発・タルわざ(explode / burstBarrel / castBarrelArt)

## 完了条件

- 上記メソッドが `domain/barrel/` にあり、`game.ts` にタルのルール本体が
  残っていない(樽比べと仲間化コールバックを除く)
- ゴールデンテスト・既存テストが無変更で pass
- `domain/barrel/` から `game.ts` への import が無い(コールバックは
  `BarrelContext` interface 経由のみ)
- 捕獲確率の式が `barrelCapture.ts` の1箇所にだけ存在する
