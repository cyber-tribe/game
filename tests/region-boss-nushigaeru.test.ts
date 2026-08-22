import { describe, expect, it } from "vitest";
import { Rng } from "../src/core/rng";
import type { Actor, FloorState, MonsterActor, PlayerActor } from "../src/core/types";
import { decideMonsterAction } from "../src/entities/ai";
import { dirFromDelta } from "../src/core/grid";
import { REGION_BOSS_ORDER, speciesById } from "../src/entities/species";
import { Game } from "../src/application/dungeonRun/game";
import { REGION_DUNGEON_IDS, REGION_SIZE } from "../src/entities/dungeons";
const bossRegionDungeonId = REGION_DUNGEON_IDS[1]!;
import { access } from "./helpers/access";
import { makeEmptyFloor } from "./helpers/floor";

function bossActor(overrides: Partial<MonsterActor> = {}): MonsterActor {
  const species = speciesById("nushigaeru");
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
  return makeEmptyFloor({ depth: 12 });
}

describe("entities/species.ts: ヌシガエル(第二地方ボス)", () => {
  it("野生出現テーブルには乗らない(minFloor: Infinity・weight: 0)", () => {
    const species = speciesById("nushigaeru");
    expect(species.minFloor).toBe(Number.POSITIVE_INFINITY);
    expect(species.weight).toBe(0);
  });

  it("isRegionBoss・hidesInQuagmireフラグを持つ", () => {
    const species = speciesById("nushigaeru");
    expect(species.isRegionBoss).toBe(true);
    expect(species.hidesInQuagmire).toBe(true);
  });

  it("bossTelegraphはHP50%以下でだけ有効になる(activateBelowHpRatio)", () => {
    expect(speciesById("nushigaeru").bossTelegraph?.activateBelowHpRatio).toBe(0.5);
  });

  it("REGION_BOSS_ORDERに、おおねぼすけに続いて登録されている", () => {
    expect(REGION_BOSS_ORDER.indexOf("nushigaeru")).toBe(REGION_BOSS_ORDER.indexOf("oonebosuke") + 1);
  });
});

describe("entities/ai.ts: ヌシガエルの2フェーズ(decideMonsterAction)", () => {
  it("フェーズ1(HP>50%)では、隣接しても予兆に入らず通常攻撃する", () => {
    const rng = new Rng(1);
    const floor = emptyFloor();
    const boss = bossActor({ hp: bossActor().maxHp }); // 満タン(>50%)
    const target = player({ x: 6, y: 5 });
    floor.actors = [boss, target];
    const field = new Int32Array(floor.width * floor.height).fill(0);

    const action = decideMonsterAction(rng, floor, boss, target, field);
    expect(action).toEqual({ type: "attack", targetId: target.id });
  });

  it("フェーズ2(HP<=50%)に入ると、隣接した最初の手は予兆になる", () => {
    const rng = new Rng(1);
    const floor = emptyFloor();
    const boss = bossActor({ hp: Math.floor(bossActor().maxHp * 0.5) }); // ちょうど50%
    const target = player({ x: 6, y: 5 });
    floor.actors = [boss, target];
    const field = new Int32Array(floor.width * floor.height).fill(0);

    const action = decideMonsterAction(rng, floor, boss, target, field);
    expect(action.type).toBe("telegraph");
  });

  it("HPが51%(閾値のすぐ上)では、まだ通常攻撃のまま", () => {
    const rng = new Rng(1);
    const floor = emptyFloor();
    const maxHp = bossActor().maxHp;
    const boss = bossActor({ hp: Math.ceil(maxHp * 0.51) });
    const target = player({ x: 6, y: 5 });
    floor.actors = [boss, target];
    const field = new Int32Array(floor.width * floor.height).fill(0);

    const action = decideMonsterAction(rng, floor, boss, target, field);
    expect(action).toEqual({ type: "attack", targetId: target.id });
  });
});

describe("game.ts: 地方ボスの階(depth 12、表の寝穴)", () => {
  it("ヌシガエルが1体だけ配置され、通常の野生モンスターは湧かない", () => {
    const game = new Game({ seed: 1, dungeonId: bossRegionDungeonId, startDepth: REGION_SIZE });
    const monsters = game.floor.actors.filter((a) => a.kind === "monster");
    expect(monsters).toHaveLength(1);
    expect(monsters[0]!.speciesId).toBe("nushigaeru");
  });

  it("フロアギミックが乗らない", () => {
    const game = new Game({ seed: 1, dungeonId: bossRegionDungeonId, startDepth: REGION_SIZE });
    expect(game.floor.gimmick).toBeUndefined();
  });

  it("撃破すると地方限定素材(ヌシガエルのうろこ)を確定ドロップする", () => {
    const game = new Game({ seed: 1, dungeonId: bossRegionDungeonId, startDepth: REGION_SIZE });
    const boss = game.floor.actors.find(
      (a): a is MonsterActor => a.kind === "monster" && a.speciesId === "nushigaeru",
    )!;

    const killActor = access(game).killActor.bind(game);
    killActor(boss, []);

    const dropped = game.floor.items.some(
      (gi) => gi.item.defId === "nushigaeruUroko" && gi.pos.x === boss.pos.x && gi.pos.y === boss.pos.y,
    );
    expect(dropped).toBe(true);
  });
});

describe("game.ts: 深みタイルでの潜伏(STATUS_INVISIBLE)", () => {
  it("深みタイルの上で隣接して行動すると、モンスターにSTATUS_INVISIBLEが付与される", () => {
    // プレイヤーをボスの隣に置いて「その場で攻撃する」行動を取らせ、
    // ボスが移動して深みタイルから外れてしまわないようにする
    let game: Game | undefined;
    let boss: Actor | undefined;
    let from: { x: number; y: number } | undefined;

    for (let seed = 1; seed <= 20 && !game; seed++) {
      const candidate = new Game({ seed, dungeonId: bossRegionDungeonId, startDepth: REGION_SIZE });
      const b = candidate.floor.actors.find(
        (a): a is MonsterActor => a.kind === "monster" && a.speciesId === "nushigaeru",
      );
      if (!b) continue;
      const neighbors = [
        { x: b.pos.x - 1, y: b.pos.y },
        { x: b.pos.x + 1, y: b.pos.y },
        { x: b.pos.x, y: b.pos.y - 1 },
        { x: b.pos.x, y: b.pos.y + 1 },
      ];
      const walkable = neighbors.find((n) => {
        const t = candidate.floor.tiles[n.y * candidate.floor.width + n.x];
        return t && t.kind !== 0;
      });
      if (walkable) {
        game = candidate;
        boss = b;
        from = walkable;
      }
    }

    expect(game).toBeDefined();
    expect(boss).toBeDefined();
    expect(from).toBeDefined();
    if (!game || !boss || !from) return;

    const tile = game.floor.tiles[boss.pos.y * game.floor.width + boss.pos.x]!;
    tile.quagmire = true;
    game.player.pos = from;

    game.command({ type: "wait" });

    const invisible = boss.statuses.find((s) => s.kind === "invisible");
    expect(invisible).toBeDefined();
  });

  it("近接攻撃は、深みに隠れている相手には空振りする", () => {
    let game: Game | undefined;
    let boss: Actor | undefined;
    let from: { x: number; y: number } | undefined;

    for (let seed = 1; seed <= 20 && !game; seed++) {
      const candidate = new Game({ seed, dungeonId: bossRegionDungeonId, startDepth: REGION_SIZE });
      const b = candidate.floor.actors.find(
        (a): a is MonsterActor => a.kind === "monster" && a.speciesId === "nushigaeru",
      );
      if (!b) continue;
      const neighbors = [
        { x: b.pos.x - 1, y: b.pos.y },
        { x: b.pos.x + 1, y: b.pos.y },
        { x: b.pos.x, y: b.pos.y - 1 },
        { x: b.pos.x, y: b.pos.y + 1 },
      ];
      const walkable = neighbors.find((n) => {
        const t = candidate.floor.tiles[n.y * candidate.floor.width + n.x];
        return t && t.kind !== 0;
      });
      if (walkable) {
        game = candidate;
        boss = b;
        from = walkable;
      }
    }

    expect(game).toBeDefined();
    expect(boss).toBeDefined();
    expect(from).toBeDefined();
    if (!game || !boss || !from) return;

    const tile = game.floor.tiles[boss.pos.y * game.floor.width + boss.pos.x]!;
    tile.quagmire = true;
    boss.statuses.push({ kind: "invisible", turns: 5 });
    const beforeHp = boss.hp;

    game.player.pos = from;
    const dir = dirFromDelta(boss.pos.x - from.x, boss.pos.y - from.y);
    game.command({ type: "face", dir });
    game.command({ type: "attack" });

    expect(boss.hp).toBe(beforeHp);
  });
});
