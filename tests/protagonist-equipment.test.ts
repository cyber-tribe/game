import { describe, expect, it } from "vitest";
import { Game } from "../src/game";
import { populateFloor, type IdSource } from "../src/dungeon/populate";
import { updateVisibility, isVisible } from "../src/dungeon/visibility";
import {
  addItem,
  charmDefId,
  createInventory,
  equip,
  headBonus,
  headDefId,
  isEquipped,
} from "../src/items/inventory";
import { totalDefense } from "../src/entities/player";
import {
  STATUS_SLEEP,
  TILE_ROOM,
  hasStatus,
  isFree,
  type Actor,
  type FloorState,
  type Tile,
} from "../src/core/types";
import { Rng } from "../src/core/rng";

describe("items/inventory.ts: 頭防具・装身具", () => {
  it("headUid/charmUidをequip()でトグルできる", () => {
    const inv = createInventory();
    addItem(inv, { uid: 1, defId: "barrelGuardHat" });
    addItem(inv, { uid: 2, defId: "fulfillingStone" });
    equip(inv, 1);
    equip(inv, 2);
    expect(inv.headUid).toBe(1);
    expect(inv.charmUid).toBe(2);
    expect(isEquipped(inv, 1)).toBe(true);
    expect(isEquipped(inv, 2)).toBe(true);
    expect(headDefId(inv)).toBe("barrelGuardHat");
    expect(charmDefId(inv)).toBe("fulfillingStone");

    // もう一度equip()すると外れる
    equip(inv, 1);
    expect(inv.headUid).toBeNull();
    expect(headDefId(inv)).toBeNull();
  });

  it("鉄兜(headBonus)はtotalDefenseに加算される", () => {
    const inv = createInventory();
    addItem(inv, { uid: 1, defId: "ironHelm" });
    equip(inv, 1);
    expect(headBonus(inv)).toBe(2);
  });
});

function newPlayerWithGear(seed: number, defId: string): Game {
  const game = new Game({ seed });
  addItem(game.player.inventory, { uid: 9999, defId });
  equip(game.player.inventory, 9999);
  return game;
}

describe("entities/player.ts: totalDefense", () => {
  it("鉄兜を装備すると守備力+2される", () => {
    const bare = new Game({ seed: 1 });
    const geared = newPlayerWithGear(1, "ironHelm");
    expect(totalDefense(geared.player)).toBe(totalDefense(bare.player) + 2);
  });
});

describe("dungeon/visibility.ts: updateVisibility", () => {
  it("extraRangeぶん、通路での視界(半径)が広がる", () => {
    const floor: FloorState = {
      depth: 1,
      width: 20,
      height: 20,
      tiles: Array.from({ length: 400 }, () => ({
        kind: TILE_ROOM,
        roomId: -1,
        explored: false,
        visible: false,
      })) as Tile[],
      rooms: [],
      stairs: { x: 19, y: 19 },
      actors: [],
      items: [],
      traps: [],
      barrels: [],
      goldPiles: [],
    };
    const viewer = { x: 10, y: 10 };
    updateVisibility(floor, viewer, 0);
    expect(isVisible(floor, { x: 12, y: 10 })).toBe(false);
    updateVisibility(floor, viewer, 1);
    expect(isVisible(floor, { x: 12, y: 10 })).toBe(true);
  });
});

describe("plan/protagonist-equipment.md: 樽守りの笠", () => {
  /** 必ず眠り付与を試みてくる隣接モンスターに、何度も1手だけ待たせて眠るか見る */
  function sleepRate(seed: number, withHat: boolean): number {
    const trials = 100;
    let slept = 0;
    for (let i = 0; i < trials; i++) {
      const game = withHat ? newPlayerWithGear(seed * 1000 + i, "barrelGuardHat") : new Game({ seed: seed * 1000 + i });
      game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
      game.floor.actors.push({
        id: 8001,
        kind: "monster",
        name: "テスト用モンスター",
        speciesId: "madoromi",
        model: "madoromi",
        pos: { x: game.player.pos.x + 1, y: game.player.pos.y },
        facing: 4,
        hp: 100000,
        maxHp: 100000,
        atk: 0,
        def: 0,
        level: 1,
        statuses: [],
        alive: true,
        aiKind: "melee",
        aware: true,
        inflicts: { kind: STATUS_SLEEP, chance: 1, turns: 4 },
      });
      game.command({ type: "wait" });
      if (hasStatus(game.player, STATUS_SLEEP)) slept++;
    }
    return slept / trials;
  }

  it("笠が無ければ確率1で必ず眠るが、笠があれば一部は抵抗する", () => {
    const withoutHat = sleepRate(1, false);
    const withHat = sleepRate(1, true);
    expect(withoutHat).toBe(1);
    expect(withHat).toBeLessThan(1);
    expect(withHat).toBeGreaterThan(0.5); // 抵抗率2割相応の範囲
  });
});

function makeIds(): IdSource {
  let actorId = 0;
  let itemUid = 0;
  let barrelId = 0;
  return {
    nextActorId: () => ++actorId,
    nextItemUid: () => ++itemUid,
    nextBarrelId: () => ++barrelId,
  };
}

describe("dungeon/populate.ts: ほこら粉寄せの匂い袋(populateFloorのboostedItemDefId)", () => {
  // ほこら粉(plan/equipment-forging.md)はまだこのブランチのカタログに無いため、
  // 既存アイテムで汎用の重み付けの仕組みそのものを検証する
  it("boostedItemDefIdを渡すと、そのアイテムが出現しやすくなる", () => {
    let boostedCount = 0;
    let plainCount = 0;
    const trials = 200;
    for (let seed = 1; seed <= trials; seed++) {
      const floorPlain: FloorState = {
        depth: 5,
        width: 40,
        height: 40,
        tiles: Array.from({ length: 1600 }, () => ({
          kind: TILE_ROOM,
          roomId: 0,
          explored: false,
          visible: false,
        })) as Tile[],
        rooms: [{ id: 0, x: 0, y: 0, w: 40, h: 40 }],
        stairs: { x: 39, y: 39 },
        actors: [],
        items: [],
        traps: [],
        barrels: [],
        goldPiles: [],
      };
      populateFloor(new Rng(seed), floorPlain, makeIds(), { x: 0, y: 0 });
      plainCount += floorPlain.items.filter((gi) => gi.item.defId === "healLeaf").length;

      const floorBoosted: FloorState = { ...floorPlain, items: [], actors: [], traps: [], barrels: [] };
      populateFloor(new Rng(seed), floorBoosted, makeIds(), { x: 0, y: 0 }, "healLeaf");
      boostedCount += floorBoosted.items.filter((gi) => gi.item.defId === "healLeaf").length;
    }
    expect(boostedCount).toBeGreaterThan(plainCount);
  });
});

/** プレイヤーの正面が空くように向きを選ぶ */
function faceOpenDirection(game: Game) {
  for (const dir of [2, 6, 4, 0, 1, 3, 5, 7] as const) {
    const d = [
      { x: 0, y: -1 },
      { x: 1, y: -1 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: -1, y: 1 },
      { x: -1, y: 0 },
      { x: -1, y: -1 },
    ][dir]!;
    const front = { x: game.player.pos.x + d.x, y: game.player.pos.y + d.y };
    if (isFree(game.floor, front)) {
      game.command({ type: "face", dir });
      return { dir, front };
    }
  }
  return null;
}

function putMonster(game: Game, pos: { x: number; y: number }, overrides: Partial<Actor> = {}): Actor {
  const monster: Actor = {
    id: 9001 + Math.floor(Math.random() * 100000),
    kind: "monster",
    name: "テスト用モンスター",
    speciesId: "gajiri",
    model: "gajiri",
    pos,
    facing: 4,
    hp: 100000,
    maxHp: 100000,
    atk: 1,
    def: 0,
    level: 1,
    statuses: [],
    alive: true,
    aiKind: "melee",
    aware: true,
    ...overrides,
  };
  game.floor.actors.push(monster);
  return monster;
}

describe("plan/protagonist-equipment.md: 樽なじみの腕輪", () => {
  it("空のタルでモンスターを吸い込める確率が上がる(多数試行の成功率で検証)", () => {
    function captureRate(seed: number, withBracelet: boolean): number | null {
      const game = withBracelet ? newPlayerWithGear(seed, "barrelKinshipBracelet") : new Game({ seed });
      game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
      const setup = faceOpenDirection(game);
      if (!setup) return null;
      let captures = 0;
      const trials = 300;
      for (let i = 0; i < trials; i++) {
        game.allies = [];
        // 前回捕獲に失敗したタルが正面に転がって道を塞ぐことがあるので、毎回片付ける
        game.floor.barrels = [];
        const monster = putMonster(game, setup.front, { hp: 100000, maxHp: 100000 });
        game.player.carrying = { id: 1, kind: "empty", pos: game.player.pos };
        const events = game.command({ type: "throwBarrel" });
        if (events.some((e) => e.type === "capture")) captures++;
        game.floor.actors = game.floor.actors.filter((a) => a.id !== monster.id);
      }
      return captures / trials;
    }

    for (let seed = 1; seed <= 5; seed++) {
      const plain = captureRate(seed, false);
      const withCharm = captureRate(seed, true);
      if (plain === null || withCharm === null) continue;
      expect(withCharm, `seed=${seed}`).toBeGreaterThan(plain);
      return;
    }
    throw new Error("開けた方向が見つかるseedがなかった");
  });
});

describe("plan/protagonist-equipment.md: 身がわりの鈴", () => {
  it("HPが1残っていれば、致死ダメージを1ダイブ1回だけ耐える", () => {
    const game = newPlayerWithGear(1, "guardianBell");
    game.player.hp = 1;
    game.player.maxHp = 999;

    const damageActor = (
      game as unknown as {
        damageActor: (target: Actor, damage: number, critical: boolean, events: unknown[]) => void;
      }
    ).damageActor.bind(game);

    damageActor(game.player, 500, false, []);
    expect(game.player.hp).toBe(1);
    expect(game.status).toBe("playing");

    game.player.hp = 1;
    damageActor(game.player, 500, false, []);
    expect(game.status).toBe("dead");
  });
});

describe("plan/protagonist-equipment.md: 満たされ石", () => {
  it("満腹度の減りが2割ゆるやかになる", () => {
    const plain = new Game({ seed: 1 });
    const geared = newPlayerWithGear(1, "fulfillingStone");
    plain.command({ type: "wait" });
    geared.command({ type: "wait" });
    const plainDecay = 100 - plain.player.satiety;
    const gearedDecay = 100 - geared.player.satiety;
    expect(gearedDecay).toBeCloseTo(plainDecay * 0.8, 5);
  });
});

describe("plan/protagonist-equipment.md: 道具(tool)", () => {
  it("送り火の粉: その場でダイブを打ち切り、踏破と同じ「持ち帰り」になる", () => {
    const game = new Game({ seed: 1 });
    addItem(game.player.inventory, { uid: 9000, defId: "ashfireDust" });
    const events = game.command({ type: "use", uid: 9000 });
    expect(game.status).toBe("cleared");
    expect(events.some((e) => e.type === "gameOver")).toBe(true);
    // めざめの階段を使ったわけではないので、checkpointイベントは出ない
    expect(events.some((e) => e.type === "checkpoint")).toBe(false);
  });

  it("樽の目利き: 視界内のモンスター入りのタルの中身を見分ける", () => {
    const game = new Game({ seed: 1 });
    game.floor.barrels.push({ id: 500, kind: "caught", speciesId: "gajiri", pos: game.player.pos });
    updateVisibility(game.floor, game.player.pos);
    addItem(game.player.inventory, { uid: 9001, defId: "barrelAppraisal" });
    const events = game.command({ type: "use", uid: 9001 });
    expect(
      events.some((e) => e.type === "message" && e.text.includes("ガジリねずみ")),
    ).toBe(true);
  });

  it("望郷の綱: 仲間をプレイヤーのそばへ呼び寄せる", () => {
    const game = new Game({ seed: 1, bringAllies: [] });
    const ally: Actor = {
      id: 7001,
      kind: "ally",
      name: "はぐれ仲間",
      speciesId: "gajiri",
      model: "gajiri",
      pos: { x: 0, y: 0 },
      facing: 4,
      hp: 10,
      maxHp: 10,
      atk: 1,
      def: 0,
      level: 1,
      statuses: [],
      alive: true,
    };
    game.allies.push(ally);
    game.floor.actors.push(ally);
    addItem(game.player.inventory, { uid: 9002, defId: "homesickRope" });
    game.command({ type: "use", uid: 9002 });
    const dx = Math.abs(ally.pos.x - game.player.pos.x);
    const dy = Math.abs(ally.pos.y - game.player.pos.y);
    expect(Math.max(dx, dy)).toBeLessThanOrEqual(3);
  });
});
