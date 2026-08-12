import { describe, expect, it } from "vitest";
import { Rng } from "../src/core/rng";
import type { Actor, FloorState } from "../src/core/types";
import { roomContains } from "../src/core/types";
import { decideMonsterAction } from "../src/entities/ai";
import { REGION_BOSS_ORDER, speciesById } from "../src/entities/species";
import { Game } from "../src/game";

function bossActor(overrides: Partial<Actor> = {}): Actor {
  const species = speciesById("fuchiNoNushi");
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
  const width = 12;
  const height = 12;
  return {
    depth: 30,
    width,
    height,
    rooms: [{ id: 0, x: 0, y: 0, w: width, h: height }],
    stairs: { x: 0, y: 0 },
    actors: [],
    items: [],
    traps: [],
    barrels: [],
    goldPiles: [],
    fieldObstacles: [],
    secretPassages: [],
    tiles: Array.from({ length: width * height }, () => ({
      kind: "floor",
      explored: true,
      visible: true,
    })),
  } as unknown as FloorState;
}

describe("entities/species.ts: 淵の主(第五地方ボス)", () => {
  it("野生出現テーブルには乗らない(minFloor: Infinity・weight: 0)", () => {
    const species = speciesById("fuchiNoNushi");
    expect(species.minFloor).toBe(Number.POSITIVE_INFINITY);
    expect(species.weight).toBe(0);
  });

  it("isRegionBossフラグを持ち、大技はsummonTorrent", () => {
    const species = speciesById("fuchiNoNushi");
    expect(species.isRegionBoss).toBe(true);
    expect(species.bossTelegraph?.effect).toBe("summonTorrent");
  });

  it("REGION_BOSS_ORDERの最後に登録されている", () => {
    expect(REGION_BOSS_ORDER[REGION_BOSS_ORDER.length - 1]).toBe("fuchiNoNushi");
  });
});

describe("entities/ai.ts: 淵の主の大技(decideMonsterAction)", () => {
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

  it("予兆済みの次の隣接した手は、隣接攻撃ではなくsummonTorrentになる", () => {
    const rng = new Rng(1);
    const floor = emptyFloor();
    const boss = bossActor({ telegraphCharge: true, telegraphCooldown: 4 });
    const target = player({ x: 6, y: 5 });
    floor.actors = [boss, target];
    const field = new Int32Array(floor.width * floor.height).fill(0);

    const action = decideMonsterAction(rng, floor, boss, target, field);
    expect(action).toEqual({ type: "summonTorrent" });
    expect(boss.telegraphCharge).toBe(false);
  });
});

describe("game.ts: 地方ボスの階(depth 30、表の寝穴)", () => {
  it("淵の主が1体だけ配置される(通常の野生モンスターは湧かない)", () => {
    const game = new Game({ seed: 1, startDepth: 30 });
    const monsters = game.floor.actors.filter((a) => a.kind === "monster");
    expect(monsters).toHaveLength(1);
    expect(monsters[0]!.speciesId).toBe("fuchiNoNushi");
  });

  it("フロアギミックが乗らない", () => {
    const game = new Game({ seed: 1, startDepth: 30 });
    expect(game.floor.gimmick).toBeUndefined();
  });

  it("撃破すると地方限定素材(淵の主のうろこ)を確定ドロップする", () => {
    const game = new Game({ seed: 1, startDepth: 30 });
    const boss = game.floor.actors.find((a) => a.speciesId === "fuchiNoNushi")!;

    const killActor = (
      game as unknown as { killActor: (target: Actor, events: unknown[]) => void }
    ).killActor.bind(game);
    killActor(boss, []);

    const dropped = game.floor.items.some(
      (gi) => gi.item.defId === "fuchiNoNushiNoUroko" && gi.pos.x === boss.pos.x && gi.pos.y === boss.pos.y,
    );
    expect(dropped).toBe(true);
  });
});

describe("game.ts: 大技(summonTorrent)が部屋の外周に一時的な奔流タイルを設置する", () => {
  it("予兆済みのボスに隣接した状態で行動させると、部屋の外周に奔流タイルが現れる", () => {
    const game = new Game({ seed: 1, startDepth: 30 });
    const boss = game.floor.actors.find((a) => a.speciesId === "fuchiNoNushi")!;
    const room = game.floor.rooms.find((r) => roomContains(r, boss.pos))!;
    expect(room).toBeDefined();

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
    expect(spot).toBeDefined();
    if (!spot) return;

    boss.telegraphCharge = true;
    boss.telegraphCooldown = 4;
    game.player.pos = spot;

    const events = game.command({ type: "wait" });

    expect(events.some((e) => e.type === "message" && e.text.includes("奔流を呼び込んだ"))).toBe(true);
    expect(boss.summonedTorrentTiles?.length).toBeGreaterThan(0);
    for (const entry of boss.summonedTorrentTiles ?? []) {
      const tile = game.floor.tiles[entry.pos.y * game.floor.width + entry.pos.x];
      expect(tile?.torrent).toBeDefined();
    }
  });

  it("3ターン経過すると、設置した奔流タイルは自動的に元に戻る", () => {
    const game = new Game({ seed: 1, startDepth: 30 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const boss = { ...bossActor(), pos: { x: 5, y: 5 } };
    const room = { id: 99, x: 3, y: 3, w: 5, h: 5 };
    game.floor.rooms = [room];
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        game.floor.tiles[y * game.floor.width + x]!.kind = 1;
      }
    }
    game.floor.actors.push(boss);
    game.player.pos = { x: 5, y: 4 };
    // 後続のターンでボスの通常攻撃を受けても倒れないようにしておく
    game.player.maxHp = 999;
    game.player.hp = 999;

    boss.telegraphCharge = true;
    boss.telegraphCooldown = 4;
    game.command({ type: "wait" });

    expect(boss.summonedTorrentTiles?.length).toBeGreaterThan(0);
    const sample = boss.summonedTorrentTiles![0]!;

    // すでにここまでで1ターン経過(waitコマンド1回)。あと2回で3ターン目に消える
    game.command({ type: "wait" });
    expect(game.floor.tiles[sample.pos.y * game.floor.width + sample.pos.x]!.torrent).toBeDefined();
    game.command({ type: "wait" });
    expect(game.floor.tiles[sample.pos.y * game.floor.width + sample.pos.x]!.torrent).toBeUndefined();
    expect(boss.summonedTorrentTiles).toHaveLength(0);
  });
});

describe("game.ts: ばくはつタルで大技(予兆)を解除する", () => {
  it("予兆中のボスと同じ部屋でタルを爆発させると、telegraphChargeがfalseに戻る", () => {
    const game = new Game({ seed: 1, startDepth: 30 });
    const boss = game.floor.actors.find((a) => a.speciesId === "fuchiNoNushi")!;
    boss.telegraphCharge = true;
    boss.telegraphCooldown = 4;

    const explode = (
      game as unknown as { explode: (pos: unknown, events: unknown[], throwerId?: number) => void }
    ).explode.bind(game);
    const events: { type: string; text?: string }[] = [];
    explode(boss.pos, events);

    expect(boss.telegraphCharge).toBe(false);
    expect(events.some((e) => e.type === "message" && e.text === "大技の気配が霧散した!")).toBe(true);
  });
});
