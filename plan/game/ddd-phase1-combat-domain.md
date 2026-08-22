# DDD Phase 1: Combat をドメインモジュールの基準実装にする

関連: [ADR 0016](../../adr/0016-incremental-ddd-for-game-rules.md) Phase 1

このドキュメントは実装セッションがそのまま着手できる粒度の作業指示。
仕様判断は済んでおり、残りはファイル移動・分割・import更新の機械的作業。

## 目的

`src/systems/combat.ts` を `src/domain/combat/` へ移し、以後「戦闘の
純粋なゲームルールはここに置く」という基準を作る。**ロジックの変更は
行わない**(挙動は一切変えない、単なる Extract Module + Move File)。
これ以降、新しい戦闘ルールを `game.ts` に追加しないという運用ルールを
開始する起点にする。

## 変更対象ファイル

### 移動元

- `src/systems/combat.ts`(65行、`computeDamage()` と `attackOffsets()` の2関数)

### 移動先(新規作成)

```
src/domain/combat/
├── types.ts             # DamageResult, DamageOptions
├── criticalHit.ts        # MAX_CRIT_RATE, CRITICAL_ONE_IN, 会心判定
├── damageCalculation.ts  # computeDamage()
└── attackPattern.ts      # attackOffsets()
```

`damageModifier.ts` は今回作らない(ADR 0016 の「目標イメージ」には
含まれるが、中身になる「がまんのかまえ」等のルールは Phase 2 で
`game.ts` から移す対象であり、今は空ファイルを置く理由がないため)。
Phase 2 でルールを移すタイミングにこのファイルを作る。

## 分割仕様

### `src/domain/combat/types.ts`

```ts
export interface DamageResult {
  damage: number;
  critical: boolean;
}

export interface DamageOptions {
  /** 会心率に上乗せする分(例: 双樽鉤の+0.15) */
  critBonus?: number;
  /** 会心を強制する(例: 双樽鉤のそのラン最初の1手、不意打ち) */
  forceCrit?: boolean;
}
```

### `src/domain/combat/criticalHit.ts`

`computeDamage()` 内にインラインで書かれている会心判定を、そのまま
関数として抽出する(ロジック変更なし)。

```ts
import type { Rng } from "../../core/rng";
import type { DamageOptions } from "./types";

/** 会心の一撃が出る基本確率(1/32) */
const CRITICAL_ONE_IN = 32;
/**
 * 会心率の合計の上限(plan/game/archive/combat-mechanics.md)。武器・印・
 * 特技などの会心率ボーナスをいくら積んでも、この値を超えない。会心が
 * 戦闘の主軸になりすぎないための歯止め。不意打ち・強制会心(forceCrit)
 * はこの上限の対象外(そもそも確率ではなく確定なので)。
 */
export const MAX_CRIT_RATE = 0.2;

export function rollCritical(rng: Rng, opts?: DamageOptions): boolean {
  const rate = Math.min(MAX_CRIT_RATE, 1 / CRITICAL_ONE_IN + (opts?.critBonus ?? 0));
  return opts?.forceCrit || rng.chance(rate);
}
```

### `src/domain/combat/damageCalculation.ts`

```ts
import type { Rng } from "../../core/rng";
import { rollCritical } from "./criticalHit";
import type { DamageOptions, DamageResult } from "./types";

/**
 * オーソドックスな和製RPGの手触りに寄せたダメージ計算。
 *   ダメージ = (attack - defense / 2) × 0.9〜1.1
 * 会心の一撃は守備力を無視する。守備を固めても最低1は通る。
 */
export function computeDamage(
  rng: Rng,
  attack: number,
  defense: number,
  opts?: DamageOptions,
): DamageResult {
  const critical = rollCritical(rng, opts);
  const base = critical ? attack : attack - defense / 2;
  const damage = Math.max(1, Math.floor(base * rng.float(0.9, 1.1)));
  return { damage, critical };
}
```

`rng.chance()` / `rng.float()` の呼び出し**回数・順序**を変えないこと。
乱数の消費順が変わると既存セーブ・リプレイ・テストの再現性が壊れる。
上記の分割(`rollCritical` を先に呼ぶ)は元の実装と同じ消費順であることを
確認済み。

### `src/domain/combat/attackPattern.ts`

```ts
import { type Dir, type Vec2, dirDelta } from "../../core/grid";
import type { WeaponPattern } from "../../core/types";

/**
 * 武器の攻撃パターンごとに、攻撃者の位置・向いている方向を基準にした
 * 相対マス(オフセット)を返す。plan/game/archive/protagonist-weapons.md
 * 参照。quickSingle・heavySingle は当たり判定そのものは single と同じで、
 * 特殊効果(会心率・行動遅延)は呼び出し側(game.ts)で扱う。
 */
export function attackOffsets(pattern: WeaponPattern, dir: Dir): Vec2[] {
  const forward = dirDelta(dir);
  switch (pattern) {
    case "line2":
      return [forward, { x: forward.x * 2, y: forward.y * 2 }];
    case "arc3": {
      const left = dirDelta(((dir + 7) % 8) as Dir);
      const right = dirDelta(((dir + 1) % 8) as Dir);
      return [forward, left, right];
    }
    default:
      return [forward];
  }
}
```

## 呼び出し側の更新(import パス変更のみ)

以下の箇所で `from "./systems/combat"` / `from "../systems/combat"` /
`from "./combat"` を `from "./domain/combat/damageCalculation"` +
`from "./domain/combat/attackPattern"` + `from "./domain/combat/criticalHit"`
(必要なものだけ)に置き換える。エクスポートされる関数名・シグネチャは
変えないので、呼び出し式自体の変更は不要。

- `src/game.ts`(`computeDamage`, `attackOffsets` を import している。
  L160 付近の import 文を更新)
- `src/systems/bossMoves.ts`(`computeDamage` を import している。
  L35 付近の import 文を更新)
- `tests/combat-mechanics.test.ts`(`computeDamage`, `MAX_CRIT_RATE` を
  `../src/systems/combat` から import している)
- `tests/weapons.test.ts`(`attackOffsets`, `computeDamage` を
  `../src/systems/combat` から import している)

`src/systems/combat.ts` は削除する(re-export シムは作らない。使用箇所は
上記4ファイルのみで把握済み)。

## この Phase でやらないこと

- `game.ts` 側の攻撃解決フロー(`attack()`, `applyAttackDamage()`,
  `resolvePlayerAttack()` 等)の抽出は行わない。これは Phase 2(戦闘の
  “計算”ルールのみ)、および Phase 4(Turn Resolution)の範囲。
- `damageModifier.ts` は作らない(上述)。
- `systems/bossMoves.ts` 自体の移動・分割は行わない(Combat ドメインの
  一部にするかは Phase 2 以降で判断)。

## 完了条件

- `npm run typecheck` が通る
- `npm test`(vitest)が全件 pass する。特に `tests/combat-mechanics.test.ts`
  と `tests/weapons.test.ts` の既存アサーションを1つも変更せずに pass
  すること(挙動が変わっていないことの確認)
- `src/systems/combat.ts` が削除され、`src/systems/` 配下に戦闘計算の
  実装が残っていないこと
- `src/domain/combat/` 配下の各ファイルに、元の JSDoc コメントが
  移設されていること(コメントも仕様の一部として保持する)
