import { describe, expect, it } from "vitest";
import { type Dir, dirDelta } from "../src/core/grid";
import {
  hasStatus,
  STATUS_CONFUSE,
  STATUS_SLEEP,
  TILE_WALL,
  tileAt,
  type Barrel,
  type MonsterActor,
} from "../src/core/types";
import { DREAM_ARTS, knownBarrelArt } from "../src/entities/dreamArts";
import { SPECIES, speciesById } from "../src/entities/species";
import { Game } from "../src/game";

/**
 * 元素タル(plan/game/archive/barrel-arts.md)。
 * 5種の元素タルと、その作成(タルわざ)・投げる/あける/頭上に持つの効果。
 */

function newGame(seed = 1) {
  return new Game({ seed });
}

/** プレイヤーの正面が空くように向きを選ぶ。無理なら null */
function faceOpenDirection(game: Game): Dir | null {
  for (const dir of [2, 6, 4, 0, 1, 3, 5, 7] as Dir[]) {
    const d = dirDelta(dir);
    const front = { x: game.player.pos.x + d.x, y: game.player.pos.y + d.y };
    if (tileAt(game.floor, front)?.kind !== TILE_WALL && !game.floor.actors.some((a) => a.alive && a.pos.x === front.x && a.pos.y === front.y)) {
      game.command({ type: "face", dir });
      return dir;
    }
  }
  return null;
}

function carry(game: Game, kind: Barrel["kind"], enhanced = false): void {
  game.player.carrying = { id: 999, kind, pos: { ...game.player.pos }, enhanced };
}

function putMonsterInFront(game: Game): MonsterActor | null {
  const dir = faceOpenDirection(game);
  if (dir === null) return null;
  const monster = game.floor.actors.find((a): a is MonsterActor => a.kind === "monster" && a.alive);
  if (!monster) return null;
  const d = dirDelta(dir);
  monster.pos = { x: game.player.pos.x + d.x, y: game.player.pos.y + d.y };
  monster.hp = monster.maxHp = 999;
  return monster;
}

describe("entities/species.ts: 5種のタルわざそれぞれに対応する種族が割り当てられている", () => {
  it("5種の元素それぞれに、少なくとも1種族が習得表を持つ", () => {
    const barrelKinds = ["water", "wind", "light", "stone", "sleep"] as const;
    const covered = new Set<string>();
    for (const s of SPECIES) {
      for (const entry of s.dreamArts ?? []) {
        const kind = DREAM_ARTS[entry.id].barrelKind;
        if (kind) covered.add(kind);
      }
    }
    for (const kind of barrelKinds) {
      expect(covered.has(kind)).toBe(true);
    }
  });
});

describe("entities/dreamArts.ts: タルわざは戦闘中に自動発動しない", () => {
  it("5種すべてのtriggerが常にnullを返す", () => {
    const ids = ["waterBarrelArt", "windBarrelArt", "lightBarrelArt", "stoneBarrelArt", "sleepBarrelArt"] as const;
    for (const id of ids) {
      const result = DREAM_ARTS[id].trigger({
        floor: { actors: [], rooms: [] } as never,
        ally: {} as never,
        leader: {} as never,
        adjacentFoe: null,
      });
      expect(result).toBeNull();
    }
  });

  it("knownBarrelArtは習得済みのうちタルわざを1つ返す", () => {
    expect(knownBarrelArt(["nemuriUta", "waterBarrelArt"])?.barrelKind).toBe("water");
    expect(knownBarrelArt(["nemuriUta"])).toBeUndefined();
  });
});

describe("game.ts: タルわざ(castBarrelArt)で空のタルを元素タルに変える", () => {
  it("からのタルを抱えていないと頼めない", () => {
    const game = newGame(1);
    carry(game, "bomb");
    const events = game.command({ type: "castBarrelArt", allyId: 12345 });
    expect(events.some((e) => e.type === "message" && e.text.includes("からのタルを持っていない"))).toBe(true);
    expect(game.player.carrying?.kind).toBe("bomb");
  });

  it("水タルわざ持ちの仲間に頼むと、抱えたタルが水タルに変わる", () => {
    const game = newGame(1);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const species = speciesById("kirimizuchi");
    const ally = {
      id: 900,
      kind: "ally" as const,
      name: species.name,
      speciesId: species.id,
      model: species.model,
      pos: { x: game.player.pos.x, y: game.player.pos.y },
      facing: 4 as const,
      hp: species.maxHp,
      maxHp: species.maxHp,
      atk: species.atk,
      def: species.def,
      level: 1,
      statuses: [],
      alive: true,
      dreamArts: ["waterBarrelArt" as const],
      bondSuccessCount: 0,
    };
    game.floor.actors.push(ally);
    game.allies.push(ally);
    carry(game, "empty");

    const events = game.command({ type: "castBarrelArt", allyId: ally.id });

    expect(game.player.carrying?.kind).toBe("water");
    expect(game.player.carrying?.enhanced).toBe(false);
    expect(events.some((e) => e.type === "message" && e.text.includes("水タルわざ"))).toBe(true);
    // タルわざ注入の音(plan/sound/archive/village-soundscape.md)
    expect(events.some((e) => e.type === "barrelArtCast" && e.allyId === ally.id && e.kind === "water")).toBe(true);
  });

  it("なじみが「すっかりなじんだ」段階以上だと強化版(enhanced)になる", () => {
    const game = newGame(1);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const species = speciesById("kirimizuchi");
    const ally = {
      id: 900,
      kind: "ally" as const,
      name: species.name,
      speciesId: species.id,
      model: species.model,
      pos: { x: game.player.pos.x, y: game.player.pos.y },
      facing: 4 as const,
      hp: species.maxHp,
      maxHp: species.maxHp,
      atk: species.atk,
      def: species.def,
      level: 1,
      statuses: [],
      alive: true,
      dreamArts: ["waterBarrelArt" as const],
      bondSuccessCount: 15, // "close" 段階
    };
    game.floor.actors.push(ally);
    game.allies.push(ally);
    carry(game, "empty");

    game.command({ type: "castBarrelArt", allyId: ally.id });

    expect(game.player.carrying?.enhanced).toBe(true);
  });
});

describe("game.ts: 元素タルを投げる", () => {
  it("水タルは命中した敵にダメージを与える", () => {
    const game = newGame(2);
    const monster = putMonsterInFront(game);
    expect(monster).not.toBeNull();
    if (!monster) return;
    carry(game, "water");
    const before = monster.hp;
    game.command({ type: "throwBarrel" });
    expect(monster.hp).toBeLessThan(before);
    expect(game.player.carrying).toBeNull();
  });

  it("風タルは命中した敵を押し出す", () => {
    const game = newGame(3);
    const monster = putMonsterInFront(game);
    expect(monster).not.toBeNull();
    if (!monster) return;
    const before = { ...monster.pos };
    carry(game, "wind");
    game.command({ type: "throwBarrel" });
    expect(monster.pos).not.toEqual(before);
  });

  it("光タルは命中した敵を混乱させる", () => {
    const game = newGame(4);
    const monster = putMonsterInFront(game);
    expect(monster).not.toBeNull();
    if (!monster) return;
    carry(game, "light");
    game.command({ type: "throwBarrel" });
    expect(hasStatus(monster, STATUS_CONFUSE)).toBe(true);
  });

  it("石タルは命中した敵に(水タルより重い)ダメージを与える", () => {
    const game = newGame(5);
    const monster = putMonsterInFront(game);
    expect(monster).not.toBeNull();
    if (!monster) return;
    carry(game, "stone");
    const before = monster.hp;
    game.command({ type: "throwBarrel" });
    expect(monster.hp).toBeLessThan(before);
  });

  it("ねむタルは命中した敵を眠らせる", () => {
    const game = newGame(6);
    const monster = putMonsterInFront(game);
    expect(monster).not.toBeNull();
    if (!monster) return;
    carry(game, "sleep");
    game.command({ type: "throwBarrel" });
    expect(hasStatus(monster, STATUS_SLEEP)).toBe(true);
  });
});

describe("game.ts: あける(openBarrel)", () => {
  it("からのタルをあけても何も起きず、ターンを消費しない", () => {
    const game = newGame(7);
    carry(game, "empty");
    const turnBefore = game.turnCount;
    const events = game.command({ type: "openBarrel" });
    expect(game.turnCount).toBe(turnBefore);
    expect(game.player.carrying?.kind).toBe("empty");
    expect(events.some((e) => e.type === "barrelOpen")).toBe(false);
  });

  it("水タルをあけると、周囲が水びたし(quagmire)になり、空のタルに戻る。あける音(barrelOpen)が出る(plan/sound/archive/village-soundscape.md)", () => {
    const game = newGame(8);
    faceOpenDirection(game);
    carry(game, "water");
    const events = game.command({ type: "openBarrel" });
    expect(game.player.carrying?.kind).toBe("empty");
    expect(events.some((e) => e.type === "barrelOpen" && e.kind === "water")).toBe(true);
    const nearby = game.floor.tiles.some(
      (t, i) =>
        t.quagmire &&
        Math.abs((i % game.floor.width) - game.player.pos.x) <= 2 &&
        Math.abs(Math.floor(i / game.floor.width) - game.player.pos.y) <= 2,
    );
    expect(nearby).toBe(true);
  });

  it("風タルをあけると、隣接する敵全員が押し出される", () => {
    const game = newGame(9);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const room = { id: 99, x: 2, y: 2, w: 8, h: 8 };
    game.floor.rooms = [room];
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        game.floor.tiles[y * game.floor.width + x]!.kind = 1;
      }
    }
    game.player.pos = { x: room.x + 4, y: room.y + 4 };
    const monster: MonsterActor = {
      id: 950,
      kind: "monster",
      name: "てき",
      speciesId: "gajiri",
      model: "gajiri",
      pos: { x: room.x + 5, y: room.y + 4 },
      facing: 4,
      hp: 999,
      maxHp: 999,
      atk: 0,
      def: 0,
      level: 1,
      statuses: [],
      alive: true,
      aiKind: "melee",
      aware: true,
    };
    game.floor.actors.push(monster);
    const before = { ...monster.pos };
    carry(game, "wind");
    game.command({ type: "openBarrel" });
    expect(monster.pos).not.toEqual(before);
    expect(game.player.carrying?.kind).toBe("empty");
  });

  it("光タルをあけると視界が広がり、空のタルに戻る", () => {
    const game = newGame(10);
    const baseline = (game as unknown as { visionExtraRange: () => number }).visionExtraRange();
    carry(game, "light");
    game.command({ type: "openBarrel" });
    expect(game.player.carrying?.kind).toBe("empty");
    const visionAfter = (game as unknown as { visionExtraRange: () => number }).visionExtraRange();
    expect(visionAfter).toBeGreaterThan(baseline);
  });

  it("石タルをあけると正面に壁ができる", () => {
    const game = newGame(11);
    const dir = faceOpenDirection(game);
    expect(dir).not.toBeNull();
    if (dir === null) return;
    const d = dirDelta(dir);
    const front = { x: game.player.pos.x + d.x, y: game.player.pos.y + d.y };
    carry(game, "stone");
    game.command({ type: "openBarrel" });
    expect(tileAt(game.floor, front)?.kind).toBe(TILE_WALL);
    expect(game.player.carrying?.kind).toBe("empty");
  });

  it("ねむタルをあけると周囲1マスの敵が眠る", () => {
    const game = newGame(12);
    const monster = putMonsterInFront(game);
    expect(monster).not.toBeNull();
    if (!monster) return;
    carry(game, "sleep");
    game.command({ type: "openBarrel" });
    expect(hasStatus(monster, STATUS_SLEEP)).toBe(true);
    expect(game.player.carrying?.kind).toBe("empty");
  });

  it("ばくはつタルをあけると自爆する。barrelOpenは出ない(既存のexplosion/barrelBreakが担う)", () => {
    const game = newGame(13);
    carry(game, "bomb");
    const before = game.player.hp;
    const events = game.command({ type: "openBarrel" });
    expect(game.player.hp).toBeLessThan(before);
    expect(game.player.carrying).toBeNull();
    expect(events.some((e) => e.type === "barrelOpen")).toBe(false);
  });
});

describe("game.ts: 元素タルの頭上に持つ(パッシブ)", () => {
  it("光タルを持っているだけで視界が広がる", () => {
    const game = newGame(14);
    const before = (game as unknown as { visionExtraRange: () => number }).visionExtraRange();
    carry(game, "light");
    const after = (game as unknown as { visionExtraRange: () => number }).visionExtraRange();
    expect(after).toBeGreaterThan(before);
  });

  it("風タルを持っていると、罠を踏んでも確率で発動しない", () => {
    let suppressed = false;
    for (let seed = 1; seed <= 40 && !suppressed; seed++) {
      const game = newGame(seed);
      game.floor.traps = [];
      const dir = faceOpenDirection(game);
      if (dir === null) continue;
      const d = dirDelta(dir);
      const front = { x: game.player.pos.x + d.x, y: game.player.pos.y + d.y };
      if (tileAt(game.floor, front) === undefined) continue;
      game.floor.traps.push({ pos: front, kind: "poison", revealed: false });
      carry(game, "wind");
      const events = game.command({ type: "move", dir });
      if (events.some((e) => e.type === "trap") && !events.some((e) => e.type === "status")) {
        suppressed = true;
      }
    }
    expect(suppressed).toBe(true);
  });
});
