import { describe, expect, it } from "vitest";
import { Rng } from "../src/core/rng";
import type { Actor, FloorState } from "../src/core/types";
import { roomContains } from "../src/core/types";
import { decideMonsterAction } from "../src/entities/ai";
import { REGION_BOSS_ORDER, speciesById } from "../src/entities/species";
import { Game } from "../src/game";
import { access } from "./helpers/access";
import { makeEmptyFloor } from "./helpers/floor";

function bossActor(overrides: Partial<Actor> = {}): Actor {
  const species = speciesById("honezukaNoNushi");
  return {
    id: 1,
    kind: "monster",
    name: species.name,
    speciesId: species.id,
    model: species.model,
    pos: { x: 5, y: 5 },
    facing: 4,
    hp: species.maxHp,
    maxHp: species.maxHp,
    atk: species.atk,
    def: species.def,
    level: 1,
    statuses: [],
    alive: true,
    aiKind: species.ai,
    aware: true,
    ...overrides,
  };
}

function player(pos = { x: 5, y: 6 }): Actor {
  return {
    id: 2,
    kind: "player",
    name: "プレイヤー",
    model: "player",
    pos,
    facing: 0,
    hp: 100,
    maxHp: 100,
    atk: 5,
    def: 1,
    level: 1,
    statuses: [],
    alive: true,
  };
}

function emptyFloor(): FloorState {
  return makeEmptyFloor({ depth: 24, rooms: [{ id: 0, x: 0, y: 0, w: 12, h: 12 }] });
}

describe("entities/species.ts: ホネヅカのぬし(第四地方ボス)", () => {
  it("野生出現テーブルには乗らない(minFloor: Infinity・weight: 0)", () => {
    const species = speciesById("honezukaNoNushi");
    expect(species.minFloor).toBe(Number.POSITIVE_INFINITY);
    expect(species.weight).toBe(0);
  });

  it("isRegionBossフラグを持ち、大技はaoeSeal", () => {
    const species = speciesById("honezukaNoNushi");
    expect(species.isRegionBoss).toBe(true);
    expect(species.bossTelegraph?.effect).toBe("aoeSeal");
  });

  it("防御特化: 雑魚最上位種(honegarami def16)より防御力が高い", () => {
    const species = speciesById("honezukaNoNushi");
    const honegarami = speciesById("honegarami");
    expect(species.def).toBeGreaterThan(honegarami.def);
  });

  it("REGION_BOSS_ORDERに、オオマドロミに続いて登録されている", () => {
    expect(REGION_BOSS_ORDER.indexOf("honezukaNoNushi")).toBe(REGION_BOSS_ORDER.indexOf("oomadoromi") + 1);
  });
});

describe("entities/ai.ts: ホネヅカのぬしの大技(decideMonsterAction)", () => {
  it("隣接した最初の手は攻撃せず、予兆(telegraph)を返す", () => {
    const rng = new Rng(1);
    const floor = emptyFloor();
    const boss = bossActor();
    const target = player({ x: 6, y: 5 });
    floor.actors = [boss, target];
    const field = new Int32Array(floor.width * floor.height).fill(0);

    const action = decideMonsterAction(rng, floor, boss, target, field);
    expect(action.type).toBe("telegraph");
    expect(boss.telegraphCharge).toBe(true);
  });

  it("予兆済みの次の隣接した手は、隣接攻撃ではなくboomAoeSealになる", () => {
    const rng = new Rng(1);
    const floor = emptyFloor();
    const boss = bossActor({ telegraphCharge: true, telegraphCooldown: 5 });
    const target = player({ x: 6, y: 5 });
    floor.actors = [boss, target];
    const field = new Int32Array(floor.width * floor.height).fill(0);

    const action = decideMonsterAction(rng, floor, boss, target, field);
    expect(action).toEqual({ type: "boomAoeSeal" });
    expect(boss.telegraphCharge).toBe(false);
  });
});

describe("game.ts: 地方ボスの階(depth 24、表の寝穴)", () => {
  it("ホネヅカのぬしが1体だけ配置され、通常の野生モンスターは湧かない", () => {
    const game = new Game({ seed: 1, startDepth: 24 });
    const monsters = game.floor.actors.filter((a) => a.kind === "monster");
    expect(monsters).toHaveLength(1);
    expect(monsters[0]!.speciesId).toBe("honezukaNoNushi");
  });

  it("フロアギミックが乗らない", () => {
    const game = new Game({ seed: 1, startDepth: 24 });
    expect(game.floor.gimmick).toBeUndefined();
  });

  it("撃破すると地方限定素材(ホネヅカの骨盤)を確定ドロップする", () => {
    const game = new Game({ seed: 1, startDepth: 24 });
    const boss = game.floor.actors.find((a) => a.speciesId === "honezukaNoNushi")!;

    const killActor = access(game).killActor.bind(game);
    killActor(boss, []);

    const dropped = game.floor.items.some(
      (gi) => gi.item.defId === "honezukaKotsuban" && gi.pos.x === boss.pos.x && gi.pos.y === boss.pos.y,
    );
    expect(dropped).toBe(true);
  });
});

describe("game.ts: 大技(boomAoeSeal)が部屋全体を封じることがある", () => {
  it("予兆済みのボスに隣接した状態で行動させると、プレイヤーが封じられることがある", () => {
    let sealed = false;
    for (let seed = 1; seed <= 30 && !sealed; seed++) {
      const game = new Game({ seed, startDepth: 24 });
      const boss = game.floor.actors.find((a) => a.speciesId === "honezukaNoNushi");
      if (!boss) continue;
      const room = game.floor.rooms.find((r) => roomContains(r, boss.pos));
      if (!room) continue;
      const neighbors = [
        { x: boss.pos.x - 1, y: boss.pos.y },
        { x: boss.pos.x + 1, y: boss.pos.y },
        { x: boss.pos.x, y: boss.pos.y - 1 },
        { x: boss.pos.x, y: boss.pos.y + 1 },
      ];
      const spot = neighbors.find((n) => {
        const t = game.floor.tiles[n.y * game.floor.width + n.x];
        return t && t.kind !== 0 && roomContains(room, n);
      });
      if (!spot) continue;

      boss.telegraphCharge = true;
      boss.telegraphCooldown = 5;
      game.player.pos = spot;

      const events = game.command({ type: "wait" });
      expect(events.some((e) => e.type === "message" && e.text.includes("骨が一斉に鳴り響いた"))).toBe(true);
      sealed = game.player.statuses.some((s) => s.kind === "seal");
    }
    expect(sealed).toBe(true);
  });
});

describe("game.ts: ばくはつタルで大技(予兆)を解除する", () => {
  it("予兆中のボスと同じ部屋でタルを爆発させると、telegraphChargeがfalseに戻る", () => {
    const game = new Game({ seed: 1, startDepth: 24 });
    const boss = game.floor.actors.find((a) => a.speciesId === "honezukaNoNushi")!;
    boss.telegraphCharge = true;
    boss.telegraphCooldown = 5;

    const explode = access(game).explode.bind(game);
    const events: { type: string; text?: string }[] = [];
    explode(boss.pos, events);

    expect(boss.telegraphCharge).toBe(false);
    expect(events.some((e) => e.type === "message" && e.text === "大技の気配が霧散した!")).toBe(true);
  });
});
