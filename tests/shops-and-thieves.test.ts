import { describe, expect, it } from "vitest";
import { Game } from "../src/game";
import { access, attemptSteal as attemptStealVia } from "./helpers/access";
import { Rng } from "../src/core/rng";
import { generateFloor } from "../src/domain/dungeon/generate";
import { decideMonsterAction } from "../src/entities/ai";
import { shopPrice, WARY_PRICE_MULTIPLIER } from "../src/entities/shop";
import { itemDef } from "../src/items/catalog";
import {
  roomCenter,
  roomContains,
  type Actor,
  type FloorState,
  type MonsterActor,
  type Tile,
} from "../src/core/types";

function putActor(game: Game, pos: { x: number; y: number }, overrides: Partial<Actor>): Actor {
  const actor: Actor = {
    id: 5000 + Math.floor(Math.random() * 100000),
    kind: "monster",
    name: "テスト用アクター",
    model: "gajiri",
    pos,
    facing: 4,
    hp: 100,
    maxHp: 100,
    atk: 1,
    def: 0,
    level: 1,
    statuses: [],
    alive: true,
    aware: true,
    ...overrides,
  };
  game.floor.actors.push(actor);
  return actor;
}

describe("entities/shop.ts: shopPrice", () => {
  it("minFloorが深く・weightが軽いほど高くなる", () => {
    const def = itemDef("healLeaf"); // minFloor:1 weight:12
    const item = { uid: 1, defId: "healLeaf" };
    expect(shopPrice(def, item, false)).toBe(20 + 1 * 8 + (10 - 12) * 5);
  });

  it("武器・盾はbonusぶん上乗せする", () => {
    const def = itemDef("hatchet");
    const item = { uid: 1, defId: "hatchet" };
    const base = 20 + def.minFloor * 8 + (10 - def.weight) * 5;
    expect(shopPrice(def, item, false)).toBe(base + (def.bonus ?? 0) * 3);
  });

  it("杖はchargesぶん上乗せする", () => {
    const staffDef = itemDef("sleepStaff");
    const item = { uid: 1, defId: "sleepStaff", charges: 4 };
    const base = 20 + staffDef.minFloor * 8 + (10 - staffDef.weight) * 5;
    expect(shopPrice(staffDef, item, false)).toBe(base + 4 * 5);
  });

  it("wary(万引き後)なら1.5倍に切り上げならぬ四捨五入される", () => {
    const def = itemDef("healLeaf");
    const item = { uid: 1, defId: "healLeaf" };
    const normal = shopPrice(def, item, false);
    const wary = shopPrice(def, item, true);
    expect(wary).toBe(Math.round(normal * WARY_PRICE_MULTIPLIER));
    expect(WARY_PRICE_MULTIPLIER).toBe(1.5);
  });

  it("価格は最低1", () => {
    const def = itemDef("healLeaf");
    const item = { uid: 1, defId: "healLeaf" };
    expect(shopPrice(def, item, false)).toBeGreaterThanOrEqual(1);
  });
});

describe("dungeon/generate.ts: 近道屋の出店", () => {
  it("3階以下には出現しない", () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const depth of [1, 2, 3]) {
        const floor = generateFloor(new Rng(seed), { depth });
        expect(floor.rooms.some((r) => r.kind === "shop")).toBe(false);
      }
    }
  });

  it("深い階では出現することがある", () => {
    let found = false;
    for (let seed = 1; seed <= 300; seed++) {
      const floor = generateFloor(new Rng(seed), { depth: 20 });
      if (floor.rooms.some((r) => r.kind === "shop")) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("1フロアに複数は出ず、モンスターハウス・階段の部屋とは重ならない", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const floor = generateFloor(new Rng(seed), { depth: 20 });
      const shopRooms = floor.rooms.filter((r) => r.kind === "shop");
      expect(shopRooms.length).toBeLessThanOrEqual(1);
      for (const room of shopRooms) {
        expect(roomContains(room, floor.stairs)).toBe(false);
      }
      const monsterHouse = floor.rooms.find((r) => r.kind === "monsterHouse");
      if (monsterHouse && shopRooms.length > 0) {
        expect(shopRooms[0]).not.toBe(monsterHouse);
      }
    }
  });
});

describe("dungeon/populate.ts: 金貨の山", () => {
  it("フロアごとに2〜5個の金貨の山が湧く", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const game = new Game({ seed });
      expect(game.floor.goldPiles.length).toBeGreaterThanOrEqual(2);
      expect(game.floor.goldPiles.length).toBeLessThanOrEqual(5);
    }
  });
});

describe("game.ts: 金貨を拾う", () => {
  it("金貨の山を踏むと自動で所持金に加算され、山は消える", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    game.player.gold = 0;
    const room = game.floor.rooms.find((r) => roomContains(r, game.player.pos)) ?? game.floor.rooms[0]!;
    const center = roomCenter(room);
    game.player.pos = { ...center };
    const pileAt = { x: center.x + 1, y: center.y };
    game.floor.goldPiles = [{ id: 1, pos: pileAt, amount: 42 }];
    const events = game.command({ type: "move", dir: 2 });
    expect(game.player.gold).toBe(42);
    expect(game.floor.goldPiles).toHaveLength(0);
    expect(events.some((e) => e.type === "message" && e.text === "42ゴールドを拾った。")).toBe(true);
  });
});

describe("game.ts: 近道屋の出店(購入・万引き)", () => {
  function setupShop(seed: number) {
    const game = new Game({ seed });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const room = game.floor.rooms.find((r) => roomContains(r, game.player.pos)) ?? game.floor.rooms[0]!;
    room.kind = "shop";
    const center = roomCenter(room);
    game.player.pos = { ...center };
    return { game, room };
  }

  it("goldが足りればその場で自動購入される", () => {
    const { game } = setupShop(1);
    game.player.gold = 100;
    const price = shopPrice(itemDef("healLeaf"), { uid: 1, defId: "healLeaf" }, false);
    game.floor.items = [{ item: { uid: 1, defId: "healLeaf" }, pos: game.player.pos, forSale: { price } }];
    const events = game.command({ type: "pickup" });
    expect(game.player.gold).toBe(100 - price);
    const held = game.player.inventory.items.find((i) => i.uid === 1);
    expect(held).toBeDefined();
    expect(held?.unpaid).toBeUndefined();
    expect(events.some((e) => e.type === "message" && e.text === `いやしの葉を${price}ゴールドで買った。`)).toBe(
      true,
    );
  });

  it("goldが足りないと未払いのまま持ち出す", () => {
    const { game } = setupShop(1);
    game.player.gold = 0;
    const price = shopPrice(itemDef("healLeaf"), { uid: 1, defId: "healLeaf" }, false);
    game.floor.items = [{ item: { uid: 1, defId: "healLeaf" }, pos: game.player.pos, forSale: { price } }];
    const events = game.command({ type: "pickup" });
    expect(game.player.gold).toBe(0);
    const held = game.player.inventory.items.find((i) => i.uid === 1);
    expect(held?.unpaid).toBe(true);
    expect(events.some((e) => e.type === "message" && e.text.includes("だまって持ち出した"))).toBe(true);
  });

  it("未払いのまま店の外に出ると万引き扱いになり、店主が豹変する", () => {
    const { game, room } = setupShop(1);
    game.player.gold = 0;
    addUnpaidItem(game);
    const keeper = putActor(game, { ...game.player.pos, x: game.player.pos.x + 1 }, {
      name: "近道屋の行商人",
      aiKind: "shopkeeper",
      hp: 999,
      maxHp: 999,
    }) as MonsterActor;

    // 部屋の外(部屋の範囲外)へ、部屋の境界の外側まで移動する
    const outside = { x: room.x - 2, y: roomCenter(room).y };
    game.player.pos = { x: room.x, y: roomCenter(room).y };
    expect(roomContains(room, game.player.pos)).toBe(true);
    expect(roomContains(room, outside)).toBe(false);

    const checkShoplifting = (
      game as unknown as {
        checkShoplifting: (from: unknown, to: unknown, events: unknown[]) => void;
      }
    ).checkShoplifting.bind(game);
    const events: { type: string; text?: string }[] = [];
    checkShoplifting(game.player.pos, outside, events);

    expect(game.player.inventory.items.every((i) => !i.unpaid)).toBe(true);
    expect(keeper.angry).toBe(true);
    expect(access(game).shopWary).toBe(true);
    expect(events.some((e) => e.type === "message" && e.text === "万引きだ! 店主が豹変した!")).toBe(true);
  });

  function addUnpaidItem(game: Game): void {
    game.player.inventory.items.push({ uid: 1, defId: "healLeaf", unpaid: true });
  }
});

describe("entities/ai.ts: 近道屋の店主のAI", () => {
  it("豹変前は何もせず待つ", () => {
    const floor = makeOpenFloor();
    const keeper: MonsterActor = makeActor({ pos: { x: 2, y: 2 }, aiKind: "shopkeeper", angry: false }) as MonsterActor;
    const player: Actor = makeActor({ pos: { x: 2, y: 3 }, kind: "player" });
    const action = decideMonsterAction(new Rng(1), floor, keeper, player, new Int32Array(floor.width * floor.height).fill(-1));
    expect(action).toEqual({ type: "wait" });
  });

  it("豹変後、隣接していれば攻撃する", () => {
    const floor = makeOpenFloor();
    const keeper: MonsterActor = makeActor({
      pos: { x: 2, y: 2 },
      aiKind: "shopkeeper",
      angry: true,
      id: 77,
    }) as MonsterActor;
    const player: Actor = makeActor({ pos: { x: 2, y: 3 }, kind: "player", id: 1 });
    floor.actors.push(keeper, player);
    const action = decideMonsterAction(new Rng(1), floor, keeper, player, new Int32Array(floor.width * floor.height).fill(-1));
    expect(action).toEqual({ type: "attack", targetId: 1 });
  });

  it("豹変後でも隣接していなければ待つ(店を離れない)", () => {
    const floor = makeOpenFloor();
    const keeper: MonsterActor = makeActor({ pos: { x: 2, y: 2 }, aiKind: "shopkeeper", angry: true }) as MonsterActor;
    const player: Actor = makeActor({ pos: { x: 4, y: 4 }, kind: "player" });
    floor.actors.push(keeper, player);
    const action = decideMonsterAction(new Rng(1), floor, keeper, player, new Int32Array(floor.width * floor.height).fill(-1));
    expect(action).toEqual({ type: "wait" });
  });
});

describe("entities/ai.ts: スリガラスのAI", () => {
  it("盗んだあとは戦わず、プレイヤーから遠ざかる方向へ逃げる", () => {
    const floor = makeOpenFloor();
    const thief: MonsterActor = makeActor({ pos: { x: 2, y: 2 }, aiKind: "thief", stolenGold: 5 }) as MonsterActor;
    const player: Actor = makeActor({ pos: { x: 2, y: 3 }, kind: "player" });
    const action = decideMonsterAction(new Rng(1), floor, thief, player, new Int32Array(floor.width * floor.height).fill(-1));
    expect(action.type).toBe("move");
    if (action.type === "move") {
      // y方向にプレイヤー(y=3)から離れる = y=2から上(dir 0系)へ
      const destY = { 0: 1, 1: 1, 2: 2, 3: 3, 4: 3, 5: 3, 6: 2, 7: 1 }[action.dir];
      expect(destY).toBeLessThanOrEqual(2);
    }
  });
});

function makeOpenFloor(): FloorState {
  const width = 7;
  const height = 7;
  const tiles: Tile[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inRoom = x >= 1 && x < width - 1 && y >= 1 && y < height - 1;
      tiles.push({ kind: inRoom ? 1 : 0, roomId: inRoom ? 0 : -1, explored: true, visible: true });
    }
  }
  return {
    depth: 1,
    width,
    height,
    tiles,
    rooms: [{ id: 0, x: 1, y: 1, w: width - 2, h: height - 2 }],
    stairs: { x: 5, y: 5 },
    actors: [],
    items: [],
    traps: [],
    barrels: [],
    goldPiles: [],
    fieldObstacles: [],
    secretPassages: [],
  };
}

function makeActor(overrides: Partial<Actor>): Actor {
  return {
    id: 1000 + Math.floor(Math.random() * 100000),
    kind: "monster",
    name: "テスト",
    model: "gajiri",
    pos: { x: 2, y: 2 },
    facing: 4,
    hp: 10,
    maxHp: 10,
    atk: 1,
    def: 0,
    level: 1,
    statuses: [],
    alive: true,
    aware: true,
    ...overrides,
  };
}

describe("game.ts: スリガラスの盗み・逃走・討伐", () => {
  it("盗みに成功すると所持金が減り、stolenGoldを持って逃走状態になる", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    game.player.gold = 100;
    const thief = putActor(game, { ...game.player.pos, x: game.player.pos.x + 1 }, { aiKind: "thief" }) as MonsterActor;

    let succeeded = false;
    for (let seed = 1; seed <= 50 && !succeeded; seed++) {
      thief.stolenGold = undefined;
      game.player.gold = 100;
      (game as unknown as { rng: Rng }).rng = new Rng(seed);
      const events: { type: string; text?: string }[] = [];
      attemptStealVia(game, thief, game.player, events);
      if (thief.stolenGold !== undefined) {
        succeeded = true;
        expect(game.player.gold).toBeLessThan(100);
        expect(game.player.gold + thief.stolenGold).toBe(100);
        expect(events.some((e) => e.type === "message" && e.text?.includes("盗まれた"))).toBe(true);
      }
    }
    expect(succeeded).toBe(true);
  });

  it("所持金が0なら盗みは常に失敗する", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    game.player.gold = 0;
    const thief = putActor(game, { ...game.player.pos, x: game.player.pos.x + 1 }, { aiKind: "thief" }) as MonsterActor;
    const events: { type: string; text?: string }[] = [];
    attemptStealVia(game, thief, game.player, events);
    expect(thief.stolenGold).toBeUndefined();
    expect(events.some((e) => e.type === "message" && e.text?.includes("何も盗めなかった"))).toBe(true);
  });

  it("盗んだスリガラスを倒すと、その場に盗品(金貨の山)を落とす", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const thief = putActor(game, { x: game.player.pos.x + 1, y: game.player.pos.y }, {
      aiKind: "thief",
      stolenGold: 17,
    });
    game.floor.goldPiles = [];
    const killActor = access(game).killActor.bind(game);
    const events: { type: string; text?: string }[] = [];
    killActor(thief, events);
    expect(game.floor.goldPiles).toHaveLength(1);
    expect(game.floor.goldPiles[0]).toMatchObject({ pos: thief.pos, amount: 17 });
    expect(events.some((e) => e.type === "message" && e.text === "盗まれた金を取り戻した!")).toBe(true);
  });
});
