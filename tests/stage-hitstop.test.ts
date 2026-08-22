import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { Stage } from "../src/view/stage";
import type { Assets } from "../src/view/assets";
import type { AudioPlayer } from "../src/audio/player";

/** Stage.update内部の private フィールドへ、このファイル内でだけ覗き見る/差し込むための型付きキャスト */
interface StageInternals {
  hitStopRemaining: number;
  dying: Map<number, { remaining: number; burstColor: THREE.Color }>;
}

function access(stage: Stage): StageInternals {
  return stage as unknown as StageInternals;
}

function makeStage(): Stage {
  const assets = { has: () => false, instantiate: () => {
    throw new Error("not used in this test");
  }, loadInBackground: () => {} } as unknown as Assets;
  const audio = { playSfx: () => {}, setMoodLayer: () => {} } as unknown as AudioPlayer;
  return new Stage(new THREE.Scene(), assets, audio);
}

/**
 * ヒットストップ(plan/models/toon-advanced-techniques.md施策E-2)。打撃が
 * 当たった瞬間、時間を数フレーム止めて重さを出す。イベント経由の統合検証は
 * FloorState/Actorの組み立てが大掛かりになるため、Stage.update()が実際に
 * 副作用(dyingタイマーの減衰)を止めることを直接確かめる
 */
describe("view/stage.ts: ヒットストップ", () => {
  it("hitStopRemainingが残っているあいだは、update()の中身(dyingタイマー等)が進まない", () => {
    const stage = makeStage();
    const internals = access(stage);
    internals.hitStopRemaining = 3 / 60;
    internals.dying.set(1, { remaining: 0.5, burstColor: new THREE.Color(0xffffff) });

    stage.update(1 / 60, 0);
    expect(internals.dying.get(1)!.remaining).toBe(0.5); // 止まっている

    stage.update(1 / 60, 0);
    expect(internals.dying.get(1)!.remaining).toBe(0.5); // まだ止まっている

    // 3フレームぶん(3/60秒)経過してヒットストップが明けるまで進める
    // (浮動小数の誤差で1/60を3回引いても厳密に0にならないことがあるため、
    // 十分な回数を回して確実に明けさせる)
    for (let i = 0; i < 10; i++) stage.update(1 / 60, 0);
    expect(internals.dying.get(1)!.remaining).toBeLessThan(0.5);
  });

  it("ヒットストップが無ければ、update()は毎フレーム普通に進む", () => {
    const stage = makeStage();
    const internals = access(stage);
    internals.dying.set(1, { remaining: 0.5, burstColor: new THREE.Color(0xffffff) });

    stage.update(1 / 60, 0);
    expect(internals.dying.get(1)!.remaining).toBeLessThan(0.5);
  });
});
