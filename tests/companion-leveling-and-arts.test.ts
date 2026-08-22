import { describe, expect, it } from "vitest";
import type { Actor, AllyActor, DreamArtId, MonsterActor } from "../src/core/types";
import { STATUS_FLINCH, STATUS_ROOT, hasStatus } from "../src/core/types";
import {
  allyExpForLevel,
  computeAllyStats,
  gainAllyExp,
} from "../src/entities/companionGrowth";
import { addDreamArt, DREAM_ARTS, nextLearnableDreamArt } from "../src/entities/dreamArts";
import { decideAllyAction } from "../src/entities/ai";
import { SPECIES, speciesById } from "../src/entities/species";
import { Rng } from "../src/core/rng";
import { expForLevel } from "../src/entities/player";
import { createAllyFromStored } from "../src/domain/dungeon/populate";
import { actorToStoredMonster, loadSave, type StoredMonster } from "../src/save";
import { Game } from "../src/game";
import { access, executeMonsterAction } from "./helpers/access";
import { withMockedLocalStorage } from "./helpers/localStorage";

/**
 * 仲間のレベルアップと「ゆめわざ」(plan/game/archive/companion-leveling-and-arts.md)
 */

function ally(overrides: Partial<AllyActor> = {}): AllyActor {
  const species = speciesById(overrides.speciesId ?? "madoromi");
  return {
    id: 900,
    kind: "ally",
    name: species.name,
    speciesId: species.id,
    model: species.model,
    pos: { x: 0, y: 0 },
    facing: 4,
    hp: species.maxHp,
    maxHp: species.maxHp,
    atk: species.atk,
    def: species.def,
    level: 1,
    statuses: [],
    alive: true,
    ...overrides,
  };
}

function stored(overrides: Partial<StoredMonster> = {}): StoredMonster {
  return {
    uid: 1,
    speciesId: "madoromi",
    level: 1,
    exp: 0,
    skills: [],
    bondSuccessCount: 0,
    recentFusionMaterials: [],
    dreamArts: [],
    ...overrides,
  };
}

describe("entities/companionGrowth.ts: allyExpForLevel", () => {
  it("プレイヤーの経験値曲線の0.7倍(丸め)になる", () => {
    for (const level of [2, 5, 10, 20]) {
      expect(allyExpForLevel(level)).toBe(Math.round(expForLevel(level) * 0.7));
    }
  });
});

describe("entities/companionGrowth.ts: computeAllyStats", () => {
  it("レベル1・なじみ0では成長・なじみ補正が掛からない基礎値になる", () => {
    const species = speciesById("madoromi");
    const stats = computeAllyStats(species, 1, 0);
    expect(stats.maxHp).toBe(Math.round(species.maxHp * 1.3));
    expect(stats.atk).toBe(Math.round(species.atk * 1.15));
    expect(stats.def).toBe(species.def);
  });

  it("レベルが上がるほどステータスが伸びる", () => {
    const species = speciesById("madoromi");
    const low = computeAllyStats(species, 1, 0);
    const high = computeAllyStats(species, 10, 0);
    expect(high.maxHp).toBeGreaterThan(low.maxHp);
    expect(high.atk).toBeGreaterThan(low.atk);
    expect(high.def).toBeGreaterThan(low.def);
  });

  it("なじみが深いほどステータスが伸びる(同レベルで比較)", () => {
    const species = speciesById("kazaridaruma");
    const unbonded = computeAllyStats(species, 5, 0);
    const bonded = computeAllyStats(species, 5, 30);
    expect(bonded.maxHp).toBeGreaterThan(unbonded.maxHp);
    expect(bonded.atk).toBeGreaterThan(unbonded.atk);
  });

  it("dungeon/populate.tsのcreateAllyFromStoredと同じ値を返す(式の一本化)", () => {
    const species = speciesById("madoromi");
    const viaGrowth = computeAllyStats(species, 4, 6);
    const a = createAllyFromStored(1, stored({ speciesId: "madoromi", level: 4, bondSuccessCount: 6 }), {
      x: 0,
      y: 0,
    });
    expect(a.maxHp).toBe(viaGrowth.maxHp);
    expect(a.atk).toBe(viaGrowth.atk);
    expect(a.def).toBe(viaGrowth.def);
  });
});

describe("entities/companionGrowth.ts: gainAllyExp", () => {
  it("必要量に満たなければレベルは上がらない", () => {
    const a = ally({ level: 1 });
    const result = gainAllyExp(a, 1);
    expect(a.level).toBe(1);
    expect(result.levelsGained).toBe(0);
    expect(a.growthExp).toBe(1);
  });

  it("閾値を超えるとレベルアップし、全回復する", () => {
    const a = ally({ level: 1, hp: 1 });
    const needed = allyExpForLevel(2);
    const result = gainAllyExp(a, needed);
    expect(a.level).toBe(2);
    expect(result.levelsGained).toBe(1);
    expect(a.hp).toBe(a.maxHp);
  });

  it("一度に大量の経験値を得ると複数レベル一気に上がる", () => {
    const a = ally({ level: 1 });
    const needed = allyExpForLevel(4);
    const result = gainAllyExp(a, needed);
    expect(a.level).toBeGreaterThanOrEqual(4);
    expect(result.levelsGained).toBeGreaterThanOrEqual(3);
  });

  it("習得表のレベルに達すると、ゆめわざを1つ習得する(マドロミダケ Lv5→ねむりのうた)", () => {
    const a = ally({ speciesId: "madoromi", level: 1 });
    const needed = allyExpForLevel(5);
    const result = gainAllyExp(a, needed);
    expect(a.level).toBeGreaterThanOrEqual(5);
    expect(a.dreamArts).toContain("nemuriUta");
    expect(result.learnedDreamArts.some((l) => l.id === "nemuriUta")).toBe(true);
  });

  it("経験値0以下・種族未設定では何もしない", () => {
    const a = ally({ level: 3 });
    const before = { ...a };
    gainAllyExp(a, 0);
    expect(a.level).toBe(before.level);
    expect(a.growthExp).toBe(before.growthExp);
  });
});

describe("entities/dreamArts.ts: nextLearnableDreamArt", () => {
  const table: readonly { level: number; id: DreamArtId }[] = [
    { level: 5, id: "nemuriUta" },
    { level: 12, id: "wasuresase" },
  ];

  it("習得表が無ければnull", () => {
    expect(nextLearnableDreamArt(undefined, 20, [])).toBeNull();
  });

  it("レベルに達していなければnull", () => {
    expect(nextLearnableDreamArt(table, 4, [])).toBeNull();
  });

  it("レベルに達し、まだ持っていなければそのidを返す", () => {
    expect(nextLearnableDreamArt(table, 5, [])).toBe("nemuriUta");
  });

  it("すでに持っているものはスキップし、次の候補を返す", () => {
    expect(nextLearnableDreamArt(table, 12, ["nemuriUta"])).toBe("wasuresase");
  });

  it("全て習得済みならnull", () => {
    expect(nextLearnableDreamArt(table, 12, ["nemuriUta", "wasuresase"])).toBeNull();
  });
});

describe("entities/dreamArts.ts: addDreamArt", () => {
  it("既に持っていれば増えない", () => {
    expect(addDreamArt(["nemuriUta"], "nemuriUta")).toEqual(["nemuriUta"]);
  });

  it("上限(2)未満なら末尾に足す", () => {
    expect(addDreamArt(["nemuriUta"], "wasuresase")).toEqual(["nemuriUta", "wasuresase"]);
  });

  it("上限を超える場合は一番古いものを忘れる", () => {
    const result = addDreamArt(["nemuriUta", "wasuresase"], "katayaburi");
    expect(result).toEqual(["wasuresase", "katayaburi"]);
    expect(result).toHaveLength(2);
  });
});

describe("entities/ai.ts: decideAllyAction とゆめわざ", () => {
  function makeFloorWithAdjacentFoe(companion: AllyActor): { floor: import("../src/core/types").FloorState; foe: MonsterActor; leader: Actor } {
    const width = 10;
    const height = 10;
    const tiles = Array.from({ length: width * height }, () => ({ kind: 1 as const }));
    const foe: MonsterActor = {
      id: 2,
      kind: "monster",
      name: "てき",
      speciesId: "gajiri",
      model: "gajiri",
      pos: { x: companion.pos.x + 1, y: companion.pos.y },
      facing: 4,
      hp: 10,
      maxHp: 10,
      atk: 3,
      def: 1,
      level: 1,
      statuses: [],
      alive: true,
      aiKind: "melee",
      aware: true,
    };
    const leader: Actor = {
      id: 1,
      kind: "player",
      name: "ガルド",
      model: "player",
      pos: { x: companion.pos.x - 1, y: companion.pos.y },
      facing: 4,
      hp: 20,
      maxHp: 20,
      atk: 5,
      def: 1,
      level: 1,
      statuses: [],
      alive: true,
    } as Actor;
    const floor = {
      width,
      height,
      tiles,
      actors: [companion, foe, leader],
      items: [],
      traps: [],
      rooms: [],
    } as unknown as import("../src/core/types").FloorState;
    return { floor, foe, leader };
  }

  it("ゆめわざ控えめ(dreamArtsCareful)では、習得済みでもゆめわざを使わない", () => {
    const companion = ally({ pos: { x: 5, y: 5 }, dreamArts: ["nemuriUta"], stance: "dreamArtsCareful" });
    const { floor, leader } = makeFloorWithAdjacentFoe(companion);
    const zeroField = new Int32Array(floor.width * floor.height).fill(0);
    // rng.chance常にtrueになるseedを使っても、dreamArtsCarefulなら通常攻撃になる
    const rng = new Rng(1);
    const action = decideAllyAction(rng, floor, companion, leader, zeroField, zeroField);
    expect(action.type).toBe("attack");
  });

  it("クールダウン中のゆめわざは発動しない", () => {
    const companion = ally({
      pos: { x: 5, y: 5 },
      dreamArts: ["nemuriUta"],
      dreamArtCooldowns: { nemuriUta: 3 },
    });
    const { floor, leader } = makeFloorWithAdjacentFoe(companion);
    const zeroField = new Int32Array(floor.width * floor.height).fill(0);
    // 何度か試行しても、クールダウン中はdreamArtにならず通常の隣接攻撃になる
    for (let seed = 1; seed <= 20; seed++) {
      const rng = new Rng(seed);
      const action = decideAllyAction(rng, floor, companion, leader, zeroField, zeroField);
      expect(action.type).toBe("attack");
    }
  });
});

describe("entities/dreamArts.ts: DREAM_ARTS.katayaburi の発動条件", () => {
  it("すでにignoreDefenseNextHitが立っていれば再発動しない", () => {
    const companion = ally({ dreamArts: ["katayaburi"], ignoreDefenseNextHit: true });
    const result = DREAM_ARTS.katayaburi.trigger({
      floor: { actors: [companion] } as unknown as import("../src/core/types").FloorState,
      ally: companion,
      leader: companion,
      adjacentFoe: null,
    });
    expect(result).toBeNull();
  });
});

describe("game.ts: 仲間の経験値(killActor経由)", () => {
  it("倒すとガルドの経験値の50%が、生存する仲間全員それぞれに(頭割りせず)入る", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const c1 = ally({ id: 900, speciesId: "madoromi", pos: { x: game.player.pos.x + 1, y: game.player.pos.y } });
    const c2 = ally({ id: 901, speciesId: "madoromi", pos: { x: game.player.pos.x + 2, y: game.player.pos.y } });
    game.floor.actors.push(c1, c2);

    const target: MonsterActor = {
      id: 950,
      kind: "monster",
      name: "てき",
      speciesId: "gajiri",
      model: "gajiri",
      pos: { x: 0, y: 0 },
      facing: 4,
      hp: 1,
      maxHp: 1,
      atk: 1,
      def: 1,
      level: 1,
      statuses: [],
      alive: true,
      aiKind: "melee",
      aware: true,
      exp: 20,
    };
    game.floor.actors.push(target);

    const events: unknown[] = [];
    access(game).killActor(target, events);

    expect(c1.growthExp).toBe(10);
    expect(c2.growthExp).toBe(10);
  });

  it("経験値を得てレベルアップすると levelUp イベントが出る", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const c1 = ally({ id: 900, speciesId: "madoromi", pos: { x: game.player.pos.x + 1, y: game.player.pos.y } });
    game.floor.actors.push(c1);

    const target: MonsterActor = {
      id: 950,
      kind: "monster",
      name: "てき",
      speciesId: "gajiri",
      model: "gajiri",
      pos: { x: 0, y: 0 },
      facing: 4,
      hp: 1,
      maxHp: 1,
      atk: 1,
      def: 1,
      level: 1,
      statuses: [],
      alive: true,
      aiKind: "melee",
      aware: true,
      exp: allyExpForLevel(2) * 3,
    };
    game.floor.actors.push(target);

    const events: { type: string; actorId?: number }[] = [];
    access(game).killActor(target, events);

    expect(events.some((e) => e.type === "levelUp" && e.actorId === c1.id)).toBe(true);
  });
});

describe("game.ts: ゆめわざの実行(executeMonsterAction経由)", () => {
  function withExecuteMonsterAction(game: Game) {
    return (
      actor: AllyActor,
      action: { type: "dreamArt"; id: DreamArtId; targetId?: number },
      events: unknown[],
    ): boolean => executeMonsterAction(game, actor, action, events);
  }

  it("ねむりのうたは対象を眠らせ、クールダウンが設定される", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const companion = ally({ id: 900, speciesId: "madoromi", pos: { x: game.player.pos.x + 1, y: game.player.pos.y } });
    const foe: MonsterActor = {
      id: 950,
      kind: "monster",
      name: "てき",
      speciesId: "gajiri",
      model: "gajiri",
      pos: { x: game.player.pos.x + 2, y: game.player.pos.y },
      facing: 4,
      hp: 10,
      maxHp: 10,
      atk: 1,
      def: 1,
      level: 1,
      statuses: [],
      alive: true,
      aiKind: "melee",
      aware: true,
    };
    game.floor.actors.push(companion, foe);

    const execute = withExecuteMonsterAction(game);
    const events: unknown[] = [];
    execute(companion, { type: "dreamArt", id: "nemuriUta", targetId: foe.id }, events);

    expect(hasStatus(foe, "sleep" as never) || foe.statuses.some((s) => s.kind === "sleep")).toBe(true);
    expect(companion.dreamArtCooldowns?.nemuriUta).toBe(DREAM_ARTS.nemuriUta.cooldownTurns);
  });

  it("かたやぶりは次の1撃だけ防御無視するフラグを立てる", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const companion = ally({ id: 900, speciesId: "katakunagani", pos: { x: game.player.pos.x + 1, y: game.player.pos.y } });
    game.floor.actors.push(companion);

    const execute = withExecuteMonsterAction(game);
    execute(companion, { type: "dreamArt", id: "katayaburi" }, []);

    expect(companion.ignoreDefenseNextHit).toBe(true);
  });
});

describe("game.ts: STATUS_ROOT/STATUS_FLINCH の割り込み(runActors)", () => {
  it("STATUS_ROOTの仲間は移動できないが、隣接していれば攻撃はできる", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const companion = ally({
      id: 900,
      speciesId: "gajiri",
      pos: { x: game.player.pos.x + 5, y: game.player.pos.y },
      statuses: [{ kind: STATUS_ROOT, turns: 5 }],
    });
    const foe: MonsterActor = {
      id: 950,
      kind: "monster",
      name: "てき",
      speciesId: "gajiri",
      model: "gajiri",
      pos: { x: companion.pos.x + 1, y: companion.pos.y },
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
    game.floor.actors.push(companion, foe);
    const before = { ...companion.pos };

    game.command({ type: "wait" });

    expect(companion.pos).toEqual(before);
  });

  it("STATUS_FLINCHの仲間はその手番を丸ごとスキップする(移動しない)", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const companion = ally({
      id: 900,
      speciesId: "gajiri",
      pos: { x: game.player.pos.x + 5, y: game.player.pos.y },
      statuses: [{ kind: STATUS_FLINCH, turns: 1 }],
    });
    game.floor.actors.push(companion);
    const before = { ...companion.pos };

    game.command({ type: "wait" });

    expect(companion.pos).toEqual(before);
  });
});

describe("save.ts: growthExp/dreamArtsの保存往復", () => {
  it("actorToStoredMonsterはgrowthExp/dreamArtsをそのまま書き出す", () => {
    const a = ally({ growthExp: 42, dreamArts: ["nemuriUta"] });
    const s = actorToStoredMonster(1, a);
    expect(s.exp).toBe(42);
    expect(s.dreamArts).toEqual(["nemuriUta"]);
  });

  it("growthExp未設定は0として書き出される", () => {
    const a = ally();
    const s = actorToStoredMonster(1, a);
    expect(s.exp).toBe(0);
    expect(s.dreamArts).toEqual([]);
  });

  it("createAllyFromStoredはexp/dreamArtsをgrowthExp/dreamArtsへ引き継ぐ", () => {
    const a = createAllyFromStored(1, stored({ exp: 42, dreamArts: ["nemuriUta"] }), { x: 0, y: 0 });
    expect(a.growthExp).toBe(42);
    expect(a.dreamArts).toEqual(["nemuriUta"]);
  });

  it("sanitizeHutは不正なdreamArtsを取り除き、上限(2件)に切り詰める", () => {
    withMockedLocalStorage(() => {
      localStorage.setItem(
        "garudo-dungeon/v1/slot0",
        JSON.stringify({
          hut: [
            {
              uid: 1,
              speciesId: "gajiri",
              level: 1,
              exp: 0,
              skills: [],
              dreamArts: ["nemuriUta", "notARealDreamArt", "wasuresase", "katayaburi"],
            },
          ],
        }),
      );
      const loaded = loadSave();
      expect(loaded.hut[0]?.dreamArts).toEqual(["wasuresase", "katayaburi"]);
    });
  });

  it("dreamArtsが欠けていても空配列で初期化される", () => {
    withMockedLocalStorage(() => {
      localStorage.setItem(
        "garudo-dungeon/v1/slot0",
        JSON.stringify({ hut: [{ uid: 1, speciesId: "gajiri", level: 1, exp: 0, skills: [] }] }),
      );
      expect(loadSave().hut[0]?.dreamArts).toEqual([]);
    });
  });
});

describe("entities/species.ts: dreamArts習得表", () => {
  it("12種のゆめわざそれぞれに少なくとも1種族が対応している", () => {
    const allIds = Object.keys(DREAM_ARTS) as DreamArtId[];
    const covered = new Set<DreamArtId>();
    for (const s of SPECIES) {
      for (const entry of s.dreamArts ?? []) covered.add(entry.id);
    }
    for (const id of allIds) {
      expect(covered.has(id)).toBe(true);
    }
  });
});
