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

/**
 * #372再発報告: 敵と接触したとき・敵が攻撃する時・主人公が攻撃する時に、
 * モデルの表示位置が狂う。
 *
 * 攻撃の踏み込み(lunge)がroot.positionへ毎フレーム「加算」するだけで、
 * 前フレームぶんのオフセットを戻していなかったため、sinの山なりが
 * 「行って戻る」にならず、攻撃1回ごとに攻撃方向へ2〜3マスぶん(60fps時)
 * 表示位置が恒久的にずれていた。攻撃者側で必ず起きるため、プレイヤーの
 * 攻撃でも、モンスターの攻撃・反撃でも発生していた。
 */
describe("view/actorView.ts: lunge の表示位置(#372再発)", () => {
  /** 60fps相当の刻みで、指定秒数ぶんupdateを回す */
  function runFrames(view: ActorView, seconds: number, fps = 60): void {
    const dt = 1 / fps;
    for (let t = 0; t < seconds; t += dt) view.update(dt);
  }

  it("踏み込みが終わったら、表示位置は元のマスへ戻る(ずれが残らない)", () => {
    const view = new ActorView({ root: new THREE.Group(), mixer: null, actions: new Map() }, { x: 5, y: 4 });

    view.lunge(1, 0); // 東の敵へ踏み込む
    runFrames(view, 0.5); // lungeの持続(0.26s)より十分長く回す

    // 旧実装ではここで x≈7.7(2.7マス漂流)になっていた
    expect(view.root.position.x).toBeCloseTo(5, 5);
    expect(view.root.position.z).toBeCloseTo(4, 5);
  });

  it("踏み込みの途中では実際に前へ出ている(演出そのものは失われない)", () => {
    const view = new ActorView({ root: new THREE.Group(), mixer: null, actions: new Map() }, { x: 0, y: 0 });

    view.lunge(1, 0);
    runFrames(view, 0.13); // 持続0.26sのちょうど山の頂上あたり
    expect(view.root.position.x).toBeGreaterThan(0.1); // 前に出ている
    expect(view.root.position.x).toBeLessThan(0.4); // 最大踏み込み量(0.28)を大きくは超えない
  });

  it("何度攻撃を繰り返しても、表示位置がずれ続けない", () => {
    const view = new ActorView({ root: new THREE.Group(), mixer: null, actions: new Map() }, { x: 5, y: 4 });

    for (let i = 0; i < 10; i++) {
      view.lunge(1, 0);
      runFrames(view, 0.5);
    }

    expect(view.root.position.x).toBeCloseTo(5, 5);
    expect(view.root.position.z).toBeCloseTo(4, 5);
  });

  it("踏み込み中に移動が始まっても、移動の行き先へ正しく着地する", () => {
    const view = new ActorView({ root: new THREE.Group(), mixer: null, actions: new Map() }, { x: 0, y: 0 });

    view.lunge(1, 0);
    runFrames(view, 0.1); // 踏み込みの途中
    view.moveTo({ x: 0, y: 0 }, { x: 0, y: 1 }, 0.15);
    runFrames(view, 1); // 移動もlungeも完全に終わるまで回す

    expect(view.root.position.x).toBeCloseTo(0, 5);
    expect(view.root.position.z).toBeCloseTo(1, 5);
  });

  it("踏み込み中にsetPositionで置き直されても、古いオフセットを引きずらない", () => {
    const view = new ActorView({ root: new THREE.Group(), mixer: null, actions: new Map() }, { x: 0, y: 0 });

    view.lunge(1, 0);
    runFrames(view, 0.1); // オフセットが乗っている状態
    view.setPosition({ x: 8, y: 8 }); // ワープ(teleportイベント相当)
    runFrames(view, 1);

    expect(view.root.position.x).toBeCloseTo(8, 5);
    expect(view.root.position.z).toBeCloseTo(8, 5);
  });
});

/** 実際のAnimationClip/Actionを持つInstanceを作る(timeScaleを覗くため) */
function instanceWithClips(names: string[]): { root: THREE.Group; mixer: THREE.AnimationMixer; actions: Map<string, THREE.AnimationAction> } {
  const root = new THREE.Group();
  const mixer = new THREE.AnimationMixer(root);
  const actions = new Map<string, THREE.AnimationAction>();
  for (const name of names) {
    const clip = new THREE.AnimationClip(name, 1, []);
    actions.set(name, mixer.clipAction(clip));
  }
  return { root, mixer, actions };
}

/** private な actions マップへ、このファイル内でだけ覗き見るための型付きキャスト */
function actionTimeScale(view: ActorView, name: string): number {
  const internals = view as unknown as { actions: Map<string, THREE.AnimationAction> };
  return internals.actions.get(name)!.timeScale;
}

/**
 * plan/models/archive/garudo-walk-motion.md「2. 足滑りの解消」: 村なか歩きは
 * 連続移動なので、クリップの歩幅と移動速度が合っていないと足が滑って見える。
 * 再生速度をコンストラクタの倍率で調整できるようにした
 */
describe("view/actorView.ts: 歩行(walk)の再生速度倍率", () => {
  it("既定(倍率省略)ではwalkもidleも等倍で再生する", () => {
    const view = new ActorView(instanceWithClips(["idle", "walk"]), { x: 0, y: 0 });
    view.play("walk");
    expect(actionTimeScale(view, "walk")).toBe(1);
  });

  it("walkSpeedMulを渡すと、walkクリップだけその倍率で再生する", () => {
    const view = new ActorView(instanceWithClips(["idle", "walk"]), { x: 0, y: 0 }, 4, 1, 2.2);
    view.play("walk");
    expect(actionTimeScale(view, "walk")).toBeCloseTo(2.2);

    // idleはwalkSpeedMulの影響を受けない
    view.play("idle");
    expect(actionTimeScale(view, "idle")).toBe(1);
  });
});

/**
 * スメア(残像変形、plan/models/toon-advanced-techniques.md施策E-1)。
 * 攻撃の踏み込み(lunge)の立ち上がりだけ、進行方向へルートを伸ばして
 * 手描きアニメの「線が流れる」速さを出す
 */
describe("view/actorView.ts: 攻撃のスメア", () => {
  it("踏み込みの立ち上がり(最速の瞬間)は進行方向(ローカルZ)へ伸び、直交方向は縮む", () => {
    const view = new ActorView({ root: new THREE.Group(), mixer: null, actions: new Map() }, { x: 0, y: 0 });
    view.lunge(1, 0);
    view.update(0.01); // ごく短い経過。立ち上がり(phaseが小さい)のまま

    expect(view.root.scale.z).toBeGreaterThan(1);
    expect(view.root.scale.x).toBeLessThan(1);
  });

  it("踏み込みが半ばを過ぎると、スメアは元の等倍へ戻る", () => {
    const view = new ActorView({ root: new THREE.Group(), mixer: null, actions: new Map() }, { x: 0, y: 0 });
    view.lunge(1, 0, 0.28, 0.26); // 既定の距離・時間
    view.update(0.26 * 0.5); // 半分ほど経過(立ち上がりの窓は過ぎている)

    expect(view.root.scale.x).toBe(1);
    expect(view.root.scale.y).toBe(1);
    expect(view.root.scale.z).toBe(1);
  });

  it("踏み込みが終わったあとは、スケールが等倍のまま残らない", () => {
    const view = new ActorView({ root: new THREE.Group(), mixer: null, actions: new Map() }, { x: 0, y: 0 });
    view.lunge(1, 0);
    view.update(0.01); // スメア中
    view.update(1); // 踏み込み完了まで進める

    expect(view.root.scale.x).toBe(1);
    expect(view.root.scale.y).toBe(1);
    expect(view.root.scale.z).toBe(1);
  });
});
