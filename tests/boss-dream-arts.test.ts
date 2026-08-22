import { describe, expect, it } from "vitest";
import type { Actor, AllyActor, DreamArtId, MonsterActor } from "../src/core/types";
import { TILE_CORRIDOR, TILE_WALL, hasStatus } from "../src/core/types";
import { decideAllyAction } from "../src/entities/ai";
import { allyExpForLevel, gainAllyExp } from "../src/entities/companionGrowth";
import { diggableWallNear, DREAM_ARTS, foesInRoom } from "../src/entities/dreamArts";
import { SPECIES, speciesById } from "../src/entities/species";
import { Rng } from "../src/core/rng";
import { Game } from "../src/game";
import { executeMonsterAction } from "./helpers/access";

/**
 * ぬしのゆめわざ(plan/game/archive/boss-dream-arts.md)。地方ボス種専用の
 * 大技(敵として使ってきた大技の借用)。8体のぬしそれぞれが1件だけ習得する。
 */

const BOSS_SPECIES_IDS = [
  "oonebosuke",
  "nushigaeru",
  "oomadoromi",
  "honezukaNoNushi",
  "fuchiNoNushi",
  "kodamaNoNushi",
  "misemonoNoNushi",
  "horikuiNoNushi",
] as const;

function ally(overrides: Partial<AllyActor> & { speciesId: string }): AllyActor {
  const species = speciesById(overrides.speciesId);
  return {
    id: 900,
    kind: "ally",
    name: species.name,
    model: species.model,
    pos: { x: 0, y: 0 },
    facing: 4,
    hp: species.maxHp,
    maxHp: species.maxHp,
    atk: species.atk,
    def: species.def,
    level: 15,
    statuses: [],
    alive: true,
    ...overrides,
  };
}

describe("entities/species.ts: 8体のぬしがそれぞれ専用のゆめわざを1件だけ習得する", () => {
  it.each(BOSS_SPECIES_IDS)("%s の習得表はLv15・1件のみ", (id) => {
    const species = speciesById(id);
    expect(species.dreamArts).toHaveLength(1);
    expect(species.dreamArts![0]!.level).toBe(15);
  });

  it("8件のぬしのゆめわざそれぞれがisBossExclusiveを持つ", () => {
    for (const id of BOSS_SPECIES_IDS) {
      const artId = speciesById(id).dreamArts![0]!.id;
      expect(DREAM_ARTS[artId].isBossExclusive).toBe(true);
    }
  });

  it("通常種のゆめわざはisBossExclusiveを持たない", () => {
    expect(DREAM_ARTS.nemuriUta.isBossExclusive).toBeUndefined();
  });
});

describe("entities/companionGrowth.ts: ぬしの経験値テーブルは通常種の2倍", () => {
  it("allyExpForLevelはmultiplier引数で必要量を増やせる", () => {
    expect(allyExpForLevel(10, 2)).toBe(allyExpForLevel(10) * 2);
  });

  it("gainAllyExpはisRegionBoss種に自動で2倍の必要量を適用する", () => {
    const boss = ally({ speciesId: "oonebosuke", level: 1, growthExp: 0 });
    const normal = ally({ speciesId: "gajiri", id: 901, level: 1, growthExp: 0 });
    const needed = allyExpForLevel(2);

    gainAllyExp(boss, needed);
    gainAllyExp(normal, needed);

    expect(normal.level).toBe(2);
    expect(boss.level).toBe(1); // 通常種なら上がる量でも、ぬしはまだ上がらない
  });

  it("Lv15に達すると専用のゆめわざを習得する(おおねぼすけ→じびきの寝がえり)", () => {
    const boss = ally({ speciesId: "oonebosuke", level: 1, growthExp: 0 });
    const needed = allyExpForLevel(15, 2);
    const result = gainAllyExp(boss, needed);
    expect(boss.level).toBeGreaterThanOrEqual(15);
    expect(boss.dreamArts).toContain("jibikiNoNegaeri");
    expect(result.learnedDreamArts.some((l) => l.id === "jibikiNoNegaeri")).toBe(true);
  });
});

describe("entities/dreamArts.ts: foesInRoom / diggableWallNear", () => {
  it("foesInRoomは同じ部屋にいる敵対アクターだけを返す", () => {
    const room = { id: 0, x: 0, y: 0, w: 6, h: 6 };
    const tiles = Array.from({ length: 100 }, () => ({ kind: 1 as const, roomId: 0, explored: true, visible: true }));
    const self: AllyActor = ally({ speciesId: "oonebosuke", pos: { x: 2, y: 2 } });
    const inRoom: MonsterActor = {
      id: 1,
      kind: "monster",
      name: "近くの敵",
      speciesId: "gajiri",
      model: "gajiri",
      pos: { x: 3, y: 3 },
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
    const outOfRoom: MonsterActor = { ...inRoom, id: 2, pos: { x: 50, y: 50 } };
    const floor = {
      width: 10,
      height: 10,
      tiles,
      actors: [self, inRoom, outOfRoom],
      items: [],
      traps: [],
      rooms: [room],
    } as unknown as import("../src/core/types").FloorState;

    const found = foesInRoom(floor, self);
    expect(found.map((a) => a.id)).toEqual([1]);
  });

  it("diggableWallNearはフロア外周を除外する", () => {
    const width = 5;
    const height = 5;
    const tiles = Array.from({ length: width * height }, () => ({
      kind: TILE_WALL,
      roomId: -1,
      explored: false,
      visible: false,
    }));
    const floor = { width, height, tiles } as unknown as import("../src/core/types").FloorState;

    // (0,0)の右隣(1,0)は外周(y=0)なので対象外、下隣(0,1)も外周(x=0)なので対象外
    expect(diggableWallNear(floor, { x: 0, y: 0 })).toBeNull();

    // 内側(2,2)からなら、隣接する壁が掘れる
    expect(diggableWallNear(floor, { x: 2, y: 2 })).not.toBeNull();
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

  function monster(overrides: Partial<MonsterActor> = {}): MonsterActor {
    return {
      id: 950,
      kind: "monster",
      name: "てき",
      speciesId: "gajiri",
      model: "gajiri",
      pos: { x: 0, y: 0 },
      facing: 4,
      hp: 999,
      maxHp: 999,
      atk: 1,
      def: 1,
      level: 1,
      statuses: [],
      alive: true,
      aiKind: "melee",
      aware: true,
      ...overrides,
    };
  }

  it("じびきの寝がえりは周囲2マスの敵にダメージと怯みを与える", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const boss = ally({ speciesId: "oonebosuke", pos: { x: game.player.pos.x, y: game.player.pos.y } });
    const near = monster({ id: 950, pos: { x: boss.pos.x + 2, y: boss.pos.y } });
    const far = monster({ id: 951, pos: { x: boss.pos.x + 5, y: boss.pos.y } });
    game.floor.actors.push(boss, near, far);

    const execute = withExecuteMonsterAction(game);
    execute(boss, { type: "dreamArt", id: "jibikiNoNegaeri" }, []);

    expect(near.hp).toBeLessThan(near.maxHp);
    expect(near.statuses.some((s) => s.kind === "flinch")).toBe(true);
    expect(far.hp).toBe(far.maxHp);
  });

  it("おおまるのみは隣接する対象を封じ、ダメージを与える", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const boss = ally({ speciesId: "nushigaeru", pos: { x: game.player.pos.x, y: game.player.pos.y } });
    const foe = monster({ pos: { x: boss.pos.x + 1, y: boss.pos.y } });
    game.floor.actors.push(boss, foe);

    const execute = withExecuteMonsterAction(game);
    execute(boss, { type: "dreamArt", id: "oomarunomi", targetId: foe.id }, []);

    expect(hasStatus(foe, "seal")).toBe(true);
    expect(foe.hp).toBeLessThan(foe.maxHp);
  });

  /** 部屋の形が確実にわかるよう、部屋を上書きしてから使う */
  function paintRoom(game: Game, room: { id: number; x: number; y: number; w: number; h: number }): void {
    game.floor.rooms = [room];
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        game.floor.tiles[y * game.floor.width + x]!.kind = 1;
      }
    }
  }

  it("ふかいまどろみは同じ部屋の敵全員を眠らせる(自陣は対象外)", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const room = { id: 99, x: 2, y: 2, w: 6, h: 6 };
    paintRoom(game, room);
    const boss = ally({ speciesId: "oomadoromi", pos: { x: room.x + 1, y: room.y + 1 } });
    const foe = monster({ pos: { x: room.x + 3, y: room.y + 3 } });
    game.floor.actors.push(boss, foe);
    game.player.pos = { x: room.x + 4, y: room.y + 4 };

    const execute = withExecuteMonsterAction(game);
    execute(boss, { type: "dreamArt", id: "fukaiMadoromi" }, []);

    expect(hasStatus(foe, "sleep")).toBe(true);
    expect(hasStatus(game.player, "sleep")).toBe(false);
  });

  it("ホネのとりでは自分の周囲に最大3枚まで一時的な壁を生成し、時間経過で元に戻る", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const boss = ally({ speciesId: "honezukaNoNushi", pos: { x: game.player.pos.x, y: game.player.pos.y } });
    game.floor.actors.push(boss);

    const execute = withExecuteMonsterAction(game);
    execute(boss, { type: "dreamArt", id: "honeNoToride" }, []);

    expect(boss.boneWallTiles).toBeDefined();
    expect(boss.boneWallTiles!.length).toBeGreaterThan(0);
    expect(boss.boneWallTiles!.length).toBeLessThanOrEqual(3);
    const sample = boss.boneWallTiles![0]!;
    expect(game.floor.tiles[sample.pos.y * game.floor.width + sample.pos.x]!.kind).toBe(TILE_WALL);

    // sample.expiresInはtickBoneWallsが同じオブジェクトを直接書き換えるので、
    // ループの前に必要なターン数を固定値として取り出しておく
    const turnsUntilRevert = sample.expiresIn;
    const originalKind = sample.originalKind;
    for (let i = 0; i < turnsUntilRevert; i++) game.command({ type: "wait" });
    expect(game.floor.tiles[sample.pos.y * game.floor.width + sample.pos.x]!.kind).toBe(originalKind);
  });

  it("うずのさそいは同じ部屋の敵をボス側へ引き寄せる", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const room = { id: 99, x: 2, y: 2, w: 6, h: 6 };
    paintRoom(game, room);
    const boss = ally({ speciesId: "fuchiNoNushi", pos: { x: room.x + 1, y: room.y + 3 } });
    const foe = monster({ pos: { x: room.x + 4, y: room.y + 3 } });
    game.floor.actors.push(boss, foe);
    const before = { ...foe.pos };

    const execute = withExecuteMonsterAction(game);
    execute(boss, { type: "dreamArt", id: "uzuNoSasoi" }, []);

    const distBefore = Math.abs(before.x - boss.pos.x);
    const distAfter = Math.abs(foe.pos.x - boss.pos.x);
    expect(distAfter).toBeLessThan(distBefore);
  });

  it("こだまのおたけびは3ターンの間、仲間の攻撃に半減ダメージの追加1撃を保証する", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const boss = ally({ speciesId: "kodamaNoNushi", pos: { x: game.player.pos.x, y: game.player.pos.y } });
    const striker = ally({ speciesId: "gajiri", id: 902, pos: { x: boss.pos.x + 1, y: boss.pos.y } });
    const foe = monster({ pos: { x: striker.pos.x + 1, y: striker.pos.y }, hp: 999, maxHp: 999, def: 0 });
    game.floor.actors.push(boss, striker, foe);

    const execute = withExecuteMonsterAction(game);
    execute(boss, { type: "dreamArt", id: "kodamaNoOtakebi" }, []);

    const attack = (
      game as unknown as {
        attack: (attacker: unknown, target: unknown, power: number, events: unknown[]) => void;
      }
    ).attack.bind(game);
    const before = foe.hp;
    const events: { type: string; text?: string }[] = [];
    attack(striker, foe, striker.atk, events);

    // 通常の1撃ぶんだけでなく、保証された反響(半減ダメージ)ぶんも減っている
    expect(before - foe.hp).toBeGreaterThan(striker.atk);
    expect(events.some((e) => e.type === "message" && e.text?.includes("こうげきがこだました"))).toBe(true);
  });

  it("まぼろしの口上は同じ部屋の敵全員を混乱させる", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const room = { id: 99, x: 2, y: 2, w: 6, h: 6 };
    paintRoom(game, room);
    const boss = ally({ speciesId: "misemonoNoNushi", pos: { x: room.x + 1, y: room.y + 1 } });
    const foe = monster({ pos: { x: room.x + 3, y: room.y + 3 } });
    game.floor.actors.push(boss, foe);

    const execute = withExecuteMonsterAction(game);
    execute(boss, { type: "dreamArt", id: "maboroshiNoKoujou" }, []);

    expect(hasStatus(foe, "confuse")).toBe(true);
  });

  it("つらぬき掘りは隣接する壁を通路に変える", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const boss = ally({ speciesId: "horikuiNoNushi", pos: { x: game.player.pos.x, y: game.player.pos.y } });
    game.floor.actors.push(boss);
    const dig = diggableWallNear(game.floor, boss.pos);
    expect(dig).not.toBeNull();

    const execute = withExecuteMonsterAction(game);
    execute(boss, { type: "dreamArt", id: "tsuranukiBori" }, []);

    if (dig) expect(game.floor.tiles[dig.y * game.floor.width + dig.x]!.kind).toBe(TILE_CORRIDOR);
  });

  it("なじみ最高段階のぬしは専用ゆめわざのクールダウンが2割短縮される", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const boss = ally({ speciesId: "oonebosuke", pos: { x: game.player.pos.x, y: game.player.pos.y }, bondSuccessCount: 30 });
    game.floor.actors.push(boss);

    const execute = withExecuteMonsterAction(game);
    execute(boss, { type: "dreamArt", id: "jibikiNoNegaeri" }, []);

    const fullCooldown = DREAM_ARTS.jibikiNoNegaeri.cooldownTurns;
    expect(boss.dreamArtCooldowns?.jibikiNoNegaeri).toBe(Math.round(fullCooldown * 0.8));
  });

  it("なじみが浅いぬしは短縮されない", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const boss = ally({ speciesId: "oonebosuke", pos: { x: game.player.pos.x, y: game.player.pos.y }, bondSuccessCount: 0 });
    game.floor.actors.push(boss);

    const execute = withExecuteMonsterAction(game);
    execute(boss, { type: "dreamArt", id: "jibikiNoNegaeri" }, []);

    expect(boss.dreamArtCooldowns?.jibikiNoNegaeri).toBe(DREAM_ARTS.jibikiNoNegaeri.cooldownTurns);
  });
});

describe("entities/ai.ts: 「ゆめわざ控えめ」の構えはぬしのゆめわざも止める", () => {
  it("dreamArtsCareful構えでは、習得済みでも発動しない", () => {
    const width = 10;
    const height = 10;
    const tiles = Array.from({ length: width * height }, () => ({
      kind: 1 as const,
      roomId: 0,
      explored: true,
      visible: true,
    }));
    const boss = ally({
      speciesId: "oonebosuke",
      pos: { x: 5, y: 5 },
      dreamArts: ["jibikiNoNegaeri"],
      stance: "dreamArtsCareful",
    });
    const foe: MonsterActor = {
      id: 2,
      kind: "monster",
      name: "てき",
      speciesId: "gajiri",
      model: "gajiri",
      pos: { x: boss.pos.x + 1, y: boss.pos.y },
      facing: 4,
      hp: 10,
      maxHp: 10,
      atk: 0,
      def: 1,
      level: 1,
      statuses: [],
      alive: true,
      aiKind: "melee",
      aware: true,
    };
    const leader: Actor = {
      id: 1,
      kind: "player" as const,
      name: "ガルド",
      model: "player",
      pos: { x: boss.pos.x - 1, y: boss.pos.y },
      facing: 4,
      hp: 20,
      maxHp: 20,
      atk: 5,
      def: 1,
      level: 1,
      statuses: [],
      alive: true,
    };
    const floor = {
      width,
      height,
      tiles,
      actors: [boss, foe, leader],
      items: [],
      traps: [],
      rooms: [{ id: 0, x: 0, y: 0, w: width, h: height }],
    } as unknown as import("../src/core/types").FloorState;
    const zeroField = new Int32Array(width * height).fill(0);

    const action = decideAllyAction(new Rng(1), floor, boss, leader, zeroField, zeroField);
    expect(action.type).toBe("attack");
  });
});

describe("entities/species.ts: SPECIES全体の整合性", () => {
  it("ぬし以外の種族はisBossExclusiveなゆめわざを持たない", () => {
    for (const s of SPECIES) {
      if (s.isRegionBoss) continue;
      for (const entry of s.dreamArts ?? []) {
        expect(DREAM_ARTS[entry.id].isBossExclusive).toBeFalsy();
      }
    }
  });
});
