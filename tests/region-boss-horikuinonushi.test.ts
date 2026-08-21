import { describe, expect, it } from "vitest";
import { Rng } from "../src/core/rng";
import type { FloorState, MonsterActor, PlayerActor } from "../src/core/types";
import { roomContains } from "../src/core/types";
import { decideMonsterAction } from "../src/entities/ai";
import { REGION_BOSS_ORDER, speciesById } from "../src/entities/species";
import { Game } from "../src/game";
import { REGION_DUNGEON_IDS, REGION_SIZE } from "../src/entities/dungeons";
const bossRegionDungeonId = REGION_DUNGEON_IDS[7]!;
import { access } from "./helpers/access";
import { makeEmptyFloor } from "./helpers/floor";

function bossActor(overrides: Partial<MonsterActor> = {}): MonsterActor {
  const species = speciesById("horikuiNoNushi");
  return {
    // プレイヤー(id: 1固定、src/game.tsのcreatePlayer(1))との衝突を避ける
    id: 100,
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
    hp: 200,
    maxHp: 200,
    atk: 5,
    def: 1,
    level: 1,
    statuses: [],
    alive: true,
  };
}

function emptyFloor(): FloorState {
  return makeEmptyFloor({ depth: 48, rooms: [{ id: 0, x: 0, y: 0, w: 12, h: 12 }], tileKind: 1 });
}

describe("entities/species.ts: 掘り杭の主(第八地方ボス)", () => {
  it("野生出現テーブルには乗らない(minFloor: Infinity・weight: 0)", () => {
    const species = speciesById("horikuiNoNushi");
    expect(species.minFloor).toBe(Number.POSITIVE_INFINITY);
    expect(species.weight).toBe(0);
  });

  it("isRegionBossフラグを持ち、大技はgroundSpikes", () => {
    const species = speciesById("horikuiNoNushi");
    expect(species.isRegionBoss).toBe(true);
    expect(species.bossTelegraph?.effect).toBe("groundSpikes");
  });

  it("表の寝穴・全8地方ボスの中で最高のステータスを持つ", () => {
    const species = speciesById("horikuiNoNushi");
    for (const otherId of REGION_BOSS_ORDER) {
      if (otherId === species.id) continue;
      const other = speciesById(otherId);
      expect(species.maxHp).toBeGreaterThan(other.maxHp);
    }
  });

  it("REGION_BOSS_ORDERの最後に登録されている", () => {
    expect(REGION_BOSS_ORDER[REGION_BOSS_ORDER.length - 1]).toBe("horikuiNoNushi");
  });
});

describe("entities/ai.ts: 掘り杭の主の大技(decideMonsterAction)", () => {
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

  it("予兆済みの次の隣接した手は、隣接攻撃ではなくgroundSpikesになる", () => {
    const rng = new Rng(1);
    const floor = emptyFloor();
    const boss = bossActor({ telegraphCharge: true, telegraphCooldown: 4 });
    const target = player({ x: 6, y: 5 });
    floor.actors = [boss, target];
    const field = new Int32Array(floor.width * floor.height).fill(0);

    const action = decideMonsterAction(rng, floor, boss, target, field);
    expect(action).toEqual({ type: "bossMove", moveId: "groundSpikes" });
    expect(boss.telegraphCharge).toBe(false);
  });
});

describe("game.ts: 地方ボスの階(depth 48、表の寝穴)", () => {
  it("掘り杭の主が1体だけ配置される(通常の野生モンスターは湧かない)", () => {
    const game = new Game({ seed: 1, dungeonId: bossRegionDungeonId, startDepth: REGION_SIZE });
    const monsters = game.floor.actors.filter((a) => a.kind === "monster");
    expect(monsters).toHaveLength(1);
    expect(monsters[0]!.speciesId).toBe("horikuiNoNushi");
  });

  it("フロアギミックが乗らない", () => {
    const game = new Game({ seed: 1, dungeonId: bossRegionDungeonId, startDepth: REGION_SIZE });
    expect(game.floor.gimmick).toBeUndefined();
  });

  it("撃破すると地方限定素材(掘り杭の杭先)を確定ドロップする", () => {
    const game = new Game({ seed: 1, dungeonId: bossRegionDungeonId, startDepth: REGION_SIZE });
    const boss = game.floor.actors.find(
      (a): a is MonsterActor => a.kind === "monster" && a.speciesId === "horikuiNoNushi",
    )!;

    const killActor = access(game).killActor.bind(game);
    killActor(boss, []);

    const dropped = game.floor.items.some(
      (gi) => gi.item.defId === "horikuiNoKuiSaki" && gi.pos.x === boss.pos.x && gi.pos.y === boss.pos.y,
    );
    expect(dropped).toBe(true);
  });
});

describe("game.ts: 予兆ターンでcrackWarningを可視化し、発動ターンでダメージが入る", () => {
  it("予兆した瞬間、対象を中心とした十字型のマスにcrackWarningが立ち、crackWarningイベントが出る", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const boss = bossActor({ pos: { x: 6, y: 5 } });
    game.floor.actors.push(boss);
    game.player.pos = { x: 5, y: 5 };
    // 十字型のマークが部屋タイルとして成立するよう、周辺を部屋タイルにしておく
    for (const p of [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 6, y: 5 },
      { x: 5, y: 4 },
      { x: 5, y: 6 },
    ]) {
      game.floor.tiles[p.y * game.floor.width + p.x]!.kind = 1;
    }

    const events = game.command({ type: "wait" });

    const marked = game.floor.tiles.filter((t) => t.crackWarning);
    expect(marked.length).toBeGreaterThan(0);
    expect(marked.length).toBeLessThanOrEqual(5);
    expect(events.some((e) => e.type === "crackWarning")).toBe(true);
    expect(boss.telegraphCharge).toBe(true);
  });

  it("発動ターンで、crackWarningの立つマスにいたプレイヤーがダメージを受け、crackWarningが解除される", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const boss = bossActor({ pos: { x: 6, y: 5 }, telegraphCharge: true, telegraphCooldown: 4 });
    game.floor.actors.push(boss);
    game.player.pos = { x: 5, y: 5 };
    // 発動ターンの判定はboss.pos隣接のtargetを中心にした位置ではなく、
    // 予兆時にすでに立っているcrackWarningのマスを見るだけなので、
    // 事前にプレイヤーの位置へ直接立てておく
    const tile = game.floor.tiles[game.player.pos.y * game.floor.width + game.player.pos.x]!;
    tile.crackWarning = true;
    const hpBefore = game.player.hp;

    game.command({ type: "wait" });

    expect(game.player.hp).toBeLessThan(hpBefore);
    expect(tile.crackWarning).toBe(false);
  });

  it("crackWarningのマスに誰もいなければ、何も起こらない(回避できる)", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const boss = bossActor({ pos: { x: 6, y: 5 }, telegraphCharge: true, telegraphCooldown: 4 });
    game.floor.actors.push(boss);
    game.player.pos = { x: 5, y: 5 }; // ボスと隣接させ、groundSpikesが発動する状況にする
    // crackWarningは離れたマス(誰もいない)に立てておく
    const tile = game.floor.tiles[3 * game.floor.width + 3]!;
    tile.crackWarning = true;
    const hpBefore = game.player.hp;

    game.command({ type: "wait" });

    expect(game.player.hp).toBe(hpBefore);
    expect(tile.crackWarning).toBe(false);
  });
});

describe("game.ts: ばくはつタルで大技(予兆)を解除すると、crackWarningも一緒に消える", () => {
  it("予兆中のボスと同じ部屋でタルを爆発させると、telegraphChargeとcrackWarningの両方が解除される", () => {
    const game = new Game({ seed: 1, dungeonId: bossRegionDungeonId, startDepth: REGION_SIZE });
    const boss = game.floor.actors.find(
      (a): a is MonsterActor => a.kind === "monster" && a.speciesId === "horikuiNoNushi",
    )!;
    const room = game.floor.rooms.find((r) => roomContains(r, boss.pos))!;
    boss.telegraphCharge = true;
    boss.telegraphCooldown = 4;
    const warnedPos = { x: boss.pos.x, y: boss.pos.y };
    const tile = game.floor.tiles[warnedPos.y * game.floor.width + warnedPos.x]!;
    tile.crackWarning = true;

    const explode = access(game).explode.bind(game);
    const events: { type: string; text?: string }[] = [];
    explode(boss.pos, events);

    expect(boss.telegraphCharge).toBe(false);
    expect(tile.crackWarning).toBe(false);
    void room;
  });
});
