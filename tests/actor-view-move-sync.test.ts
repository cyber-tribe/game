import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { ActorView } from "../src/view/actorView";

/**
 * #372: モンスターに近づいたり攻撃すると、モンスターや主人公の位置がズレる。
 *
 * 1ターンの中で同じアクターに move イベントが2回続くこと(押し出し直後に
 * そのモンスター自身のAI行動が動く。plan/attack-button.md、tests/attack-button.test.ts
 * の「押し出したあと同じcommand内でモンスターAIの1手ぶんも進む」参照。
 * 主人公側では奔流タイル(plan/waterfall-torrent.md)で同様の連続moveが起きる)
 * が普通にある。Stage.applyEvents はそれらを描画を挟まず同じtick内で順番に
 * 処理するため、moveTo が event.from をそのまま信じていると1回目の移動区間が
 * まるごと飛ばされ、2回目の開始点へ瞬間移動してから動き出して見えてしまっていた。
 */
describe("view/actorView.ts: moveTo の連続呼び出し(#372)", () => {
  it("1回目のmoveToが1フレームも描画されないまま2回目が来ても、表示位置は瞬間移動しない", () => {
    const view = new ActorView({ root: new THREE.Group(), mixer: null, actions: new Map() }, { x: 5, y: 4 });

    // 押し出し: (5,4) -> (6,4)
    view.moveTo({ x: 5, y: 4 }, { x: 6, y: 4 }, 0.15);
    // 直後に同じアクター自身のAI行動: (6,4) -> (5,5) (applyEvents内で同一tick、描画は一度も挟まらない)
    view.moveTo({ x: 6, y: 4 }, { x: 5, y: 5 }, 0.15);

    // update(0)(=経過0秒。t=0の瞬間)の時点で、表示は元の位置(5,4)のまま
    // でなければならない。event.from をそのまま信じる旧実装だと、ここで
    // 押し出し先(6,4)へ1マスぶん瞬間移動してしまっていた(#372)
    view.update(0);
    expect(view.root.position.x).toBeCloseTo(5);
    expect(view.root.position.z).toBeCloseTo(4);

    // アニメーションが完全に終わるまで進めると、最終的な行き先(5,5)へ滑らかに着地する
    view.update(1);
    expect(view.root.position.x).toBeCloseTo(5);
    expect(view.root.position.z).toBeCloseTo(5);
  });

  it("アニメーション再生中に途中経過した表示位置から、次の区間へ継ぎ目なくつながる(瞬間移動しない)", () => {
    const view = new ActorView({ root: new THREE.Group(), mixer: null, actions: new Map() }, { x: 0, y: 0 });

    view.moveTo({ x: 0, y: 0 }, { x: 1, y: 0 }, 0.2);
    view.update(0.1); // アニメーション途中(半分ほど進んだところ)
    const midX = view.root.position.x;
    expect(midX).toBeGreaterThan(0);
    expect(midX).toBeLessThan(1);

    // この時点で次のmoveイベントが来ても、開始点は「今表示されている場所」であるべきで、
    // 本来の論理的な出発点である(1,0)へ飛んでからは動かない
    view.moveTo({ x: 1, y: 0 }, { x: 1, y: 1 }, 0.2);
    view.update(0);
    expect(view.root.position.x).toBeCloseTo(midX);
    expect(view.root.position.z).toBeCloseTo(0);
  });
});
