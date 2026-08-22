# DDD Phase 2: Game の戦闘計算ルールを domain/combat へ移す

関連: [ADR 0016](../../adr/0016-incremental-ddd-for-game-rules.md) Phase 2
前提: [Phase 1](ddd-phase1-combat-domain.md) 完了(`src/domain/combat/` が存在すること)

## 目的

`game.ts` の `attack()` 周辺に散らばっている**戦闘の計算ルール**
(補正倍率・会心強制条件・防御力決定・被ダメージ軽減・回避)を
`domain/combat/` の関数へ移す。挙動は一切変えない。

スコープは ADR 0016 のとおり「計算」だけに絞る。**攻撃1回の解決フロー**
(`attack()` のオーケストレーション、`applyAttackDamage()` の満腹度ドレイン・
反撃・死亡連鎖、`damageActor()`, `killActor()`)は Phase 4 の範囲であり、
このPhaseでは `Game` に残す。

## 事前作業: ゴールデンテスト(移行より先に別コミットで)

`tests/combat-golden.test.ts` を新設する。固定シードの `Game` を作り、
以下のシナリオで `command()` が返す `GameEvent[]` の **type と主要
フィールドの列**をスナップショット(`toMatchInlineSnapshot` ではなく
手書きの期待配列)として固定する。

- 素の攻撃(命中・ダメージ・会心なし)
- 不意打ち(未発見のモンスターへの攻撃 → 必ず会心)
- がまんのかまえ(足踏み → 攻撃で2倍)
- すてみ(与+50% / 被+25%)
- とどめのさき(HP1/4以下へ必ず会心)
- 身構え(2割軽減)・樽受け身(全無効)
- かばいあい(隣接の身代わり)

シナリオの組み方は既存の `tests/combat-mechanics.test.ts` の Game 構築
ヘルパーに倣う。**このテストは Phase 2 の全コミットで無変更のまま pass
し続けること**が挙動保存の証明になる。

## 移すもの → 移し先

### `domain/combat/damageModifier.ts`(新規)

Phase 1 で「作らない」としたファイルをここで作る。

| 移動元(game.ts) | 新しい関数 | 備考 |
|---|---|---|
| `attack()` 内の effectivePower 計算ブロック(ambush 1.5倍 / lowHpBonus / spore倍率 / がまんのかまえ / すてみ) | `effectiveAttackPower(args): number` | `args = { attacker, attackPower, ambushStrike, sporedRoom: boolean, runSkills, consumeBraced: () => boolean }` の形で `this` 依存を引数化。`roomOf(floor, pos)?.spored` の判定は呼び出し側(Game)で行い boolean で渡す(Domainにfloor全体を渡さない) |
| `attack()` 内の defense 決定ブロック(かたやぶり / ホネつよし / totalDefense) | `effectiveDefense(args): number` | かたやぶり(`ignoreDefenseNextHit`)の消費は関数内で行ってよい(actor はドメイン状態) |
| `mitigateIncomingDamage()` | `mitigateIncomingDamage(args): number` | すてみ被+25% / 樽受け身 / 身構え / ぷるんの印 / はねひらり / とんずら / ゆるがぬからだ / みをまもる / ゆめのかけぶとん。`partyGuardTurns` は number で渡す |
| `barrelThrowDamage()` | `barrelThrowDamage(inventory): number` | Phase 3 で domain/barrel から参照する予定があるため combat に置く |

### `domain/combat/criticalHit.ts`(追記)

| 移動元 | 新しい関数 | 備考 |
|---|---|---|
| `resolveAttackModifiers()` | `resolveAttackModifiers(args): { forceCrit, ambushStrike }` | 不意打ち / ふいうち(quickStart) / ambushReady / とどめのさき。`oncePerRun` は `OncePerRunTracker` をそのまま引数で渡す(core のユーティリティであり技術層ではない) |

### `domain/combat/evasion.ts`(新規)

| 移動元 | 新しい関数 | 備考 |
|---|---|---|
| `tryEvade()` | `tryEvade(rng, target, events): boolean` | 種族の evadeChance 参照 |

### 定数の移動

`game.ts` にある戦闘計算専用の定数を対応するモジュールへ移す:
`BRACED_DAMAGE_MULTIPLIER`, `ALL_IN_DAMAGE_MULTIPLIER`,
`ALL_IN_TAKEN_MULTIPLIER`, `GUARD_DAMAGE_REDUCTION`, `MUTUAL_GUARD_CHANCE`,
`FINISHER_HP_RATIO`, `FLUTTER_DODGE_CHANCE`, `HONE_TSUYOSHI_MULTIPLIER`,
`YUME_NO_KAKEBUTON_DAMAGE_REDUCTION` など。移動時に他の用途で参照して
いないか grep で確認する。

### `applyMutualGuard()`(かばいあい)

対象差し替えの判定部分(確率・隣接探索)を
`domain/combat/damageModifier.ts` の `pickMutualGuardCoverer(args): Actor | null`
へ移す。party 配列(`[player, ...allies]`)は引数で渡す。

## 設計上の決め事

- **Domain は `entities/` のカタログ(`speciesById` 等)を import してよい**
  (読み取り専用のマスタデータ参照はルールの一部)。逆方向は禁止。
- **Domain 関数は `events: GameEvent[]` に push してよい**(ADR 0002 の
  境界の内側)。View を知らなければよい。
- **Domain 関数に `Game`(this)を渡さない。** 必要な状態は個別の引数
  または小さな args オブジェクトで渡す。`bossMoveContext` のような
  narrow context を作るほどの規模ではないので、素朴な引数渡しでよい。
- 消費系の状態変更(`bracedReady`・`ignoreDefenseNextHit`・`oncePerRun`
  の markUsed・`ambushReady` クリア)は、判定と同じ関数内で行う
  (判定と消費を分けると呼び出し忘れで二重発動バグを生むため)。
- **乱数消費の順序を変えない。** `rng.chance()` / `rng.float()` の呼び出し
  順・回数は元コードと同一に保つ。ゴールデンテストが検証してくれるが、
  レビュー時にも意識すること。

## `Game` 側に残るもの(Phase 4 送り)

- `attack()` 本体(上記関数を呼ぶオーケストレーションに縮む)
- `applyAttackDamage()`(満腹度ドレイン・反撃・こだまがえし)
- `applyOnHitStatuses()` / `applyEchoAttacks()` / `echoHit()`
- `damageActor()` / `killActor()` / `hpOwnerOf()` / `mirrorSharedHp()`
- `attemptSteal()` / `resolvePlayerAttack()`

## PR分割の目安

1. ゴールデンテスト追加(コード変更なし)
2. `resolveAttackModifiers` + `tryEvade` の移動
3. effectivePower / effectiveDefense の抽出・移動
4. `mitigateIncomingDamage` + かばいあい判定 + 定数の移動

各PRで `npm run typecheck` と `npx vitest run` が通ること。

## 完了条件

- 上記の計算ルールが `domain/combat/` にあり、`game.ts` に同じ計算式が
  残っていない
- ゴールデンテストが1文字も変更されずに pass している
- `domain/combat/` から `game.ts` への import が存在しない
- 既存テスト(combat-mechanics / weapons ほか)が無変更で pass
