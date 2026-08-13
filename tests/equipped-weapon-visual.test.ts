import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { Game } from "../src/game";
import { addItem, createInventory, equip, equippedWeaponModel } from "../src/items/inventory";
import { ActorView } from "../src/view/actorView";

describe("items/inventory.ts: equippedWeaponModel", () => {
  it("未装備なら null", () => {
    const inv = createInventory();
    expect(equippedWeaponModel(inv)).toBeNull();
  });

  it("武器を装備すると、そのアイテム定義のmodelを返す", () => {
    const inv = createInventory();
    addItem(inv, { uid: 1, defId: "hatchet" });
    equip(inv, 1);
    expect(equippedWeaponModel(inv)).toBe("hatchet");
  });

  it("同じuidをもう一度equipすると外れ、nullに戻る", () => {
    const inv = createInventory();
    addItem(inv, { uid: 1, defId: "hatchet" });
    equip(inv, 1);
    equip(inv, 1);
    expect(equippedWeaponModel(inv)).toBeNull();
  });

  it("盾など武器以外を装備しても影響しない", () => {
    const inv = createInventory();
    addItem(inv, { uid: 1, defId: "hatchet" });
    addItem(inv, { uid: 2, defId: "woodShield" });
    equip(inv, 1);
    equip(inv, 2);
    expect(equippedWeaponModel(inv)).toBe("hatchet");
  });
});

/** 壁のない開けたフロアに差し替える。装備コマンドの検証には地形が要らないため */
function setupOpenFloor(game: Game): void {
  game.floor.actors = game.floor.actors.filter((a) => a !== game.player);
  game.floor.actors.push(game.player);
}

describe("Game: player.equippedWeaponModel(plan/equipped-weapon-visual.md)", () => {
  it("ダイブ開始直後は素手(undefined)", () => {
    const game = new Game({ seed: 1 });
    expect(game.player.equippedWeaponModel).toBeUndefined();
  });

  it("equipコマンドで武器を装備すると、Actor側にモデル名が反映される", () => {
    const game = new Game({ seed: 1 });
    setupOpenFloor(game);
    const item = game.giveItem("hatchet");
    expect(item).not.toBeNull();

    game.command({ type: "equip", uid: item!.uid });
    expect(game.player.equippedWeaponModel).toBe("hatchet");
  });

  it("装備中の武器をもう一度equipして外すと、undefinedに戻る", () => {
    const game = new Game({ seed: 1 });
    setupOpenFloor(game);
    const item = game.giveItem("hatchet");
    game.command({ type: "equip", uid: item!.uid });
    expect(game.player.equippedWeaponModel).toBe("hatchet");

    game.command({ type: "equip", uid: item!.uid });
    expect(game.player.equippedWeaponModel).toBeUndefined();
  });

  it("装備中の武器を足元に置く(drop)と、素手表示に戻る", () => {
    const game = new Game({ seed: 1 });
    setupOpenFloor(game);
    const item = game.giveItem("hatchet");
    game.command({ type: "equip", uid: item!.uid });
    expect(game.player.equippedWeaponModel).toBe("hatchet");

    game.command({ type: "drop", uid: item!.uid });
    expect(game.player.equippedWeaponModel).toBeUndefined();
  });

  it("攻撃パターンの異なる武器へ持ち替えても、素手には戻らない", () => {
    // 現状すべての武器defが model: "hatchet" を共有している
    // (plan/archive/protagonist-weapons.md)ため、見た目の値自体は変わらないが、
    // weaponUid が正しく切り替わり equippedWeaponModel が null に落ちないことを確かめる
    const game = new Game({ seed: 1 });
    setupOpenFloor(game);
    const hatchet = game.giveItem("hatchet");
    const spear = game.giveItem("spearedge");
    game.command({ type: "equip", uid: hatchet!.uid });
    expect(game.player.inventory.weaponUid).toBe(hatchet!.uid);

    // 別の武器を装備すると自動的に持ち替わる(items/inventory.ts の equip() 参照)
    game.command({ type: "equip", uid: spear!.uid });
    expect(game.player.inventory.weaponUid).toBe(spear!.uid);
    expect(game.player.equippedWeaponModel).toBe("hatchet");
  });
});

describe("view/actorView.ts: setWeapon", () => {
  /** garudo.glb の右手ボーン("elbow.R-hand.R")を模した骨組み */
  function buildRootWithHandBone(): THREE.Group {
    const root = new THREE.Group();
    const hand = new THREE.Bone();
    hand.name = "elbow.R-hand.R";
    root.add(hand);
    return root;
  }

  it("手のボーンに武器オブジェクトを子付けする", () => {
    const root = buildRootWithHandBone();
    const view = new ActorView({ root, mixer: null, actions: new Map() }, { x: 0, y: 0 });
    const weapon = new THREE.Object3D();

    view.setWeapon(weapon);

    const hand = root.getObjectByName("elbow.R-hand.R")!;
    expect(weapon.parent).toBe(hand);
  });

  it("null を渡すと素手に戻る(取り外される)", () => {
    const root = buildRootWithHandBone();
    const view = new ActorView({ root, mixer: null, actions: new Map() }, { x: 0, y: 0 });
    const weapon = new THREE.Object3D();

    view.setWeapon(weapon);
    view.setWeapon(null);

    expect(weapon.parent).toBeNull();
  });

  it("持ち替えると、前の武器オブジェクトは外れて新しいものだけが付く", () => {
    const root = buildRootWithHandBone();
    const view = new ActorView({ root, mixer: null, actions: new Map() }, { x: 0, y: 0 });
    const first = new THREE.Object3D();
    const second = new THREE.Object3D();

    view.setWeapon(first);
    view.setWeapon(second);

    const hand = root.getObjectByName("elbow.R-hand.R")!;
    expect(first.parent).toBeNull();
    expect(second.parent).toBe(hand);
  });

  it("手のボーンが無いモデルでは root に直接付ける(フォールバック)", () => {
    const root = new THREE.Group();
    const view = new ActorView({ root, mixer: null, actions: new Map() }, { x: 0, y: 0 });
    const weapon = new THREE.Object3D();

    view.setWeapon(weapon);

    expect(weapon.parent).toBe(root);
  });
});
