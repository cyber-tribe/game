import { describe, expect, it } from "vitest";
import { Rng } from "../src/core/rng";
import type { FloorState, MonsterActor, PlayerActor } from "../src/core/types";
import { decideMonsterAction } from "../src/entities/ai";
import { REGION_BOSS_ORDER, speciesById } from "../src/entities/species";
import { Game } from "../src/game";
import { REGION_DUNGEON_IDS, REGION_SIZE } from "../src/entities/dungeons";
const bossRegionDungeonId = REGION_DUNGEON_IDS[2]!;
import { access, explode } from "./helpers/access";
import { makeEmptyFloor } from "./helpers/floor";
import { roomContains } from "../src/core/types";

function bossActor(overrides: Partial<MonsterActor> = {}): MonsterActor {
  const species = speciesById("oomadoromi");
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

function player(pos = { x: 5, y: 6 }): PlayerActor {
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
  return makeEmptyFloor({ depth: 18, rooms: [{ id: 0, x: 0, y: 0, w: 12, h: 12 }] });
}

describe("entities/species.ts: オオマドロミ(第三地方ボス)", () => {
  it("野生出現テーブルには乗らない(minFloor: Infinity・weight: 0)", () => {
    const species = speciesById("oomadoromi");
    expect(species.minFloor).toBe(Number.POSITIVE_INFINITY);
    expect(species.weight).toBe(0);
  });

  it("isRegionBossフラグを持ち、大技はaoeSleep", () => {
    const species = speciesById("oomadoromi");
    expect(species.isRegionBoss).toBe(true);
    expect(species.bossTelegraph?.effect).toBe("aoeSleep");
  });

  it("REGION_BOSS_ORDERに、おおねぼすけ・ヌシガエルに続いて登録されている", () => {
    expect(REGION_BOSS_ORDER.indexOf("oomadoromi")).toBe(REGION_BOSS_ORDER.indexOf("nushigaeru") + 1);
  });
});

describe("entities/ai.ts: オオマドロミの大技(decideMonsterAction)", () => {
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

  it("予兆済みの次の隣接した手は、隣接攻撃ではなくaoeSleepになる", () => {
    const rng = new Rng(1);
    const floor = emptyFloor();
    const boss = bossActor({ telegraphCharge: true, telegraphCooldown: 4 });
    const target = player({ x: 6, y: 5 });
    floor.actors = [boss, target];
    const field = new Int32Array(floor.width * floor.height).fill(0);

    const action = decideMonsterAction(rng, floor, boss, target, field);
    expect(action).toEqual({ type: "bossMove", moveId: "aoeSleep" });
    expect(boss.telegraphCharge).toBe(false);
  });
});

describe("game.ts: 地方ボスの階(depth 18、表の寝穴)", () => {
  it("オオマドロミが1体だけ配置され、通常の野生モンスターは湧かない", () => {
    const game = new Game({ seed: 1, dungeonId: bossRegionDungeonId, startDepth: REGION_SIZE });
    const monsters = game.floor.actors.filter((a) => a.kind === "monster");
    expect(monsters).toHaveLength(1);
    expect(monsters[0]!.speciesId).toBe("oomadoromi");
  });

  it("フロアギミックが乗らない", () => {
    const game = new Game({ seed: 1, dungeonId: bossRegionDungeonId, startDepth: REGION_SIZE });
    expect(game.floor.gimmick).toBeUndefined();
  });

  it("撃破すると地方限定素材(オオマドロミの胞子玉)を確定ドロップする", () => {
    const game = new Game({ seed: 1, dungeonId: bossRegionDungeonId, startDepth: REGION_SIZE });
    const boss = game.floor.actors.find(
      (a): a is MonsterActor => a.kind === "monster" && a.speciesId === "oomadoromi",
    )!;

    const killActor = access(game).killActor.bind(game);
    killActor(boss, []);

    const dropped = game.floor.items.some(
      (gi) => gi.item.defId === "oomadoromiHoushi" && gi.pos.x === boss.pos.x && gi.pos.y === boss.pos.y,
    );
    expect(dropped).toBe(true);
  });
});

describe("game.ts: 大技(aoeSleep)が部屋全体を眠らせることがある", () => {
  it("予兆済みのボスに隣接した状態で行動させると、プレイヤーが眠らされることがある", () => {
    let slept = false;
    for (let seed = 1; seed <= 30 && !slept; seed++) {
      const game = new Game({ seed, dungeonId: bossRegionDungeonId, startDepth: REGION_SIZE });
      const boss = game.floor.actors.find(
        (a): a is MonsterActor => a.kind === "monster" && a.speciesId === "oomadoromi",
      );
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
      boss.telegraphCooldown = 4;
      game.player.pos = spot;

      const events = game.command({ type: "wait" });
      expect(events.some((e) => e.type === "message" && e.text.includes("胞子をまき散らした"))).toBe(true);
      slept = game.player.statuses.some((s) => s.kind === "sleep");
    }
    expect(slept).toBe(true);
  });
});

describe("game.ts: ばくはつタルで大技(予兆)を解除する", () => {
  it("予兆中のボスと同じ部屋でタルを爆発させると、telegraphChargeがfalseに戻る", () => {
    const game = new Game({ seed: 1, dungeonId: bossRegionDungeonId, startDepth: REGION_SIZE });
    const boss = game.floor.actors.find(
      (a): a is MonsterActor => a.kind === "monster" && a.speciesId === "oomadoromi",
    )!;
    boss.telegraphCharge = true;
    boss.telegraphCooldown = 4;

    const events: { type: string; text?: string }[] = [];
    explode(game, boss.pos, events);

    expect(boss.telegraphCharge).toBe(false);
    expect(events.some((e) => e.type === "message" && e.text === "大技の気配が霧散した!")).toBe(true);
  });
});
