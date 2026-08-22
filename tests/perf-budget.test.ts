import { beforeEach, describe, expect, it, vi } from "vitest";
import { spawnWanderingMonster } from "../src/dungeon/populate";
import { buildDistanceField } from "../src/entities/ai";
import { Game } from "../src/game";
import { saveRunSnapshot } from "../src/save";
import { clearBossIfPresent } from "./helpers/bossFloor";

// 距離場が1ターンに何本作られるかを数えたいので、本物を包んで差し替える。
// game.ts 側の import もこの包んだものに差し替わる
vi.mock("../src/entities/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/entities/ai")>();
  return { ...actual, buildDistanceField: vi.fn(actual.buildDistanceField) };
});

/**
 * 性能の予算。
 *
 * このプロジェクトは1日に数十本のPRが自動でマージされていくので、
 * 「毎ターン全マスを走査する処理」や「セーブに巨大なものを載せる変更」が
 * 静かに入り込むと、誰も気づかないまま遅くなる。README「速さのために
 * 効いていること」に書いた性質を、ここで機械が見張る。
 *
 * ■ 何で見張るか
 *
 * **時間の絶対値はあてにならない**。この実装はもともと十分に速く
 * (1ターン0.2ms)、CIのランナーの遅さと揺れを吸収できるだけ上限を緩めると、
 * 現実的な退行が素通りしてしまう。実際、アクター全員ぶん距離場を作り直す
 * という明らかに無駄な変更を入れても 0.20ms → 0.68ms にしかならず、
 * 揺れを許容した上限には引っかからなかった。
 *
 * そこで主役は**決定的な指標**に置く。
 *
 * - 1ターンに距離場を何本作ったか(回数)
 * - オートセーブが1回に何バイト書くか(容量)
 *
 * どちらも機械の速さと無関係に同じ値が出るので、実測ぎりぎりで締められる。
 * 時間については、機械の速さが相殺される**アクター数に対する伸び方の比**と、
 * 桁が変わったときだけ鳴る緩い絶対値を、補助として置いてある。
 */

/** 実測(このリポジトリの開発機、2026-08): 0.201ms。桁が変わったら落とす */
const TURN_MS_LIMIT = 2.5;
/** 実測: アクター81体で 0.701ms */
const CROWDED_TURN_MS_LIMIT = 6;
/** 実測: 81体/11体 = 3.48倍。O(アクター数²)が効き始めたらここで落ちる */
const CROWDED_RATIO_LIMIT = 10;
/** 実測: 0.0436ms。BFSの内側で使い捨てオブジェクトを作ると跳ね上がる */
const DISTANCE_FIELD_MS_LIMIT = 0.5;
/** 実測: 地下10階で約8KB。タイル格子の畳み込みをやめると100KB近くに戻る */
const SNAPSHOT_KB_LIMIT = 20;

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

/**
 * 何度か測って中央値を採る。1回だけだとGCや他プロセスの影響をそのまま拾う。
 * 計測前にウォームアップを回して、JITが温まった状態で比べる。
 */
function measureMs(warmup: () => void, batch: () => void, perBatch: number): number {
  for (let i = 0; i < 3; i++) warmup();
  const runs: number[] = [];
  for (let b = 0; b < 5; b++) {
    const started = performance.now();
    batch();
    runs.push((performance.now() - started) / perBatch);
  }
  return median(runs);
}

function diveTo(depth: number): Game {
  const game = new Game({ seed: 4242, maxDepth: 48, startingItems: [] });
  let guard = 0;
  while (game.depth < depth && guard++ < 200) {
    clearBossIfPresent(game);
    game.player.pos = { ...game.floor.stairs };
    game.command({ type: "descend" });
  }
  // 満腹度やHPで途中で終わらないようにする。測りたいのは1ターンの処理量だけ
  game.player.hp = 99_999;
  game.player.maxHp = 99_999;
  game.player.satiety = 99_999;
  return game;
}

function turnMs(game: Game): number {
  const warmup = () => {
    for (let i = 0; i < 10; i++) game.command({ type: "wait" });
  };
  const batch = () => {
    for (let i = 0; i < 100; i++) game.command({ type: "wait" });
  };
  return measureMs(warmup, batch, 100);
}

/** そのフロアに、指定した数まで野良モンスターを足す */
function crowd(game: Game, count: number): void {
  const internals = game as unknown as { rng: never; ids: never };
  for (let i = 0; i < count; i++) {
    spawnWanderingMonster(internals.rng, game.floor, internals.ids, game.player.pos, 0);
  }
}

describe("1ターンの処理時間", () => {
  it(`通常のフロアで ${TURN_MS_LIMIT}ms を超えない`, () => {
    const ms = turnMs(diveTo(10));
    expect(ms, `1ターン ${ms.toFixed(3)}ms`).toBeLessThan(TURN_MS_LIMIT);
  }, 60_000);

  it("アクターが増えても、伸び方が急激にならない", () => {
    // 野良モンスターの湧きに上限が無いので、長く粘ると実際にこの状況になる。
    // 現状 3.5 倍程度。ここが跳ね上がったら、アクター数に対して二乗で効く
    // 処理(全アクター走査の入れ子など)が入ったということ
    const sparse = diveTo(10);
    const sparseCount = sparse.floor.actors.filter((a) => a.alive).length;
    const sparseMs = turnMs(sparse);

    const crowded = diveTo(10);
    crowd(crowded, 70);
    const crowdedCount = crowded.floor.actors.filter((a) => a.alive).length;
    const crowdedMs = turnMs(crowded);

    const detail =
      `${sparseCount}体 ${sparseMs.toFixed(3)}ms → ` +
      `${crowdedCount}体 ${crowdedMs.toFixed(3)}ms (${(crowdedMs / sparseMs).toFixed(2)}倍)`;
    expect(crowdedCount).toBeGreaterThan(sparseCount * 3);
    expect(crowdedMs, detail).toBeLessThan(CROWDED_TURN_MS_LIMIT);
    expect(crowdedMs / sparseMs, detail).toBeLessThan(CROWDED_RATIO_LIMIT);
  }, 120_000);
});

describe("1ターンに作る距離場の本数", () => {
  beforeEach(() => {
    vi.mocked(buildDistanceField).mockClear();
  });

  /** 1ターン進めて、そのあいだに buildDistanceField が呼ばれた回数 */
  function fieldsPerTurn(game: Game): number {
    vi.mocked(buildDistanceField).mockClear();
    game.command({ type: "wait" });
    return vi.mocked(buildDistanceField).mock.calls.length;
  }

  it("仲間がいなければ2本まで", () => {
    // 敵へ向かう距離場と、味方へ向かう距離場の2本で足りる。
    // プレイヤーへ向かう3本目は仲間しか使わないので、いないときは作らない。
    // ここが3本に戻っていたら、その遅延生成が外れたということ
    const game = diveTo(10);
    expect(game.allyList.length, "仲間がいない前提").toBe(0);
    const count = fieldsPerTurn(game);
    expect(count, `${count}本作られた`).toBeLessThanOrEqual(2);
  }, 60_000);

  it("アクターが増えても本数は変わらない", () => {
    // 距離場はその階の全員で使い回す設計(README「追跡AIと陣営」)。
    // アクターごとに作り直す実装に変わると、ここで落ちる
    const game = diveTo(10);
    const before = fieldsPerTurn(game);
    crowd(game, 70);
    const after = fieldsPerTurn(game);
    expect(game.floor.actors.filter((a) => a.alive).length).toBeGreaterThan(70);
    expect(after, `${before}本 → ${after}本`).toBe(before);
  }, 60_000);
});

describe("距離場(ダイクストラマップ)", () => {
  it(`1回あたり ${DISTANCE_FIELD_MS_LIMIT}ms を超えない`, () => {
    // 毎ターン2〜3本作るので、ここが重くなるとそのままターンの重さになる。
    // 近傍判定でいちいち座標オブジェクトを作る書き方に戻すと目に見えて悪化する
    const game = diveTo(10);
    const floor = game.floor;
    const from = game.player.pos;
    const ms = measureMs(
      () => {
        for (let i = 0; i < 50; i++) buildDistanceField(floor, from);
      },
      () => {
        for (let i = 0; i < 300; i++) buildDistanceField(floor, from);
      },
      300,
    );
    expect(ms, `1回 ${ms.toFixed(4)}ms`).toBeLessThan(DISTANCE_FIELD_MS_LIMIT);
  }, 60_000);
});

describe("ダイブ中オートセーブの書き出し量", () => {
  it(`地下10階で ${SNAPSHOT_KB_LIMIT}KB を超えない`, () => {
    // 1ターンごとに localStorage へ同期で書くので、ここが膨らむと
    // そのまま操作の引っかかりになる。タイル格子は畳んで持っている
    const game = diveTo(10);
    for (let i = 0; i < 20; i++) game.command({ type: "wait" });

    const original = globalThis.localStorage;
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    };
    let written = 0;
    try {
      saveRunSnapshot(game.toSnapshot());
      written = [...store.values()].reduce((sum, v) => sum + v.length, 0);
    } finally {
      (globalThis as { localStorage?: unknown }).localStorage = original;
    }

    const kb = written / 1024;
    expect(written, "何も書かれていない").toBeGreaterThan(0);
    expect(kb, `書き出し ${kb.toFixed(1)}KB`).toBeLessThan(SNAPSHOT_KB_LIMIT);
  }, 60_000);
});
