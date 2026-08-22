import { describe, expect, it } from "vitest";
import type { AllyActor, MonsterActor, RunSkillId } from "../src/core/types";
import { isFree } from "../src/core/types";
import { rollRunSkillChoices, RUN_SKILLS } from "../src/entities/runSkills";
import { speciesById } from "../src/entities/species";
import { Rng } from "../src/core/rng";
import { Game } from "../src/application/dungeonRun/game";
import { BARREL_RANGE, LIGHT_CARRY_RANGE_BONUS, traceThrow } from "../src/domain/barrel/barrelThrow";
import { access } from "./helpers/access";

/**
 * レベルアップ時のスキル選択(plan/game/archive/run-build-skills.md)。
 */

function newGame(seed = 1) {
  return new Game({ seed });
}

function faceOpenDirection(game: Game) {
  const deltas = [
    { x: 0, y: -1 },
    { x: 1, y: -1 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
    { x: -1, y: 1 },
    { x: -1, y: 0 },
    { x: -1, y: -1 },
  ];
  for (const dir of [2, 6, 4, 0, 1, 3, 5, 7] as const) {
    const d = deltas[dir]!;
    const front = { x: game.player.pos.x + d.x, y: game.player.pos.y + d.y };
    if (isFree(game.floor, front)) {
      game.command({ type: "face", dir });
      return { dir, front };
    }
  }
  return null;
}

function putMonster(
  game: Game,
  pos: { x: number; y: number },
  overrides: Partial<MonsterActor> = {},
): MonsterActor {
  const monster: MonsterActor = {
    id: 8001 + Math.floor(Math.random() * 100000),
    kind: "monster",
    name: "テスト用モンスター",
    speciesId: "gajiri",
    model: "gajiri",
    pos,
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
    ...overrides,
  };
  game.floor.actors.push(monster);
  return monster;
}

function addAlly(game: Game, overrides: Partial<AllyActor> = {}): AllyActor {
  const species = speciesById(overrides.speciesId ?? "gajiri");
  const ally: AllyActor = {
    id: 9001 + Math.floor(Math.random() * 100000),
    kind: "ally",
    name: species.name,
    speciesId: species.id,
    model: species.model,
    pos: { x: game.player.pos.x, y: game.player.pos.y },
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
  game.floor.actors.push(ally);
  game.allies.push(ally);
  return ally;
}

/** 部屋を上書きして、確実に開けた地形でテストする */
function paintRoom(game: Game, room: { id: number; x: number; y: number; w: number; h: number }): void {
  game.floor.rooms = [room];
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      game.floor.tiles[y * game.floor.width + x]!.kind = 1;
    }
  }
}

function give(game: Game, ...ids: RunSkillId[]): void {
  game.runSkills.push(...ids);
}

describe("entities/runSkills.ts: rollRunSkillChoices", () => {
  it("3系統から1つずつ、未習得のものを引く", () => {
    const rng = new Rng(1);
    const choices = rollRunSkillChoices(rng, []);
    expect(choices).toHaveLength(3);
    const categories = new Set(choices.map((id) => RUN_SKILLS[id].category));
    expect(categories.size).toBe(3);
  });

  it("習得済みのスキルは二度と出ない", () => {
    const rng = new Rng(2);
    let known: RunSkillId[] = [];
    for (let i = 0; i < 6; i++) {
      const choices = rollRunSkillChoices(rng, known);
      for (const id of choices) {
        expect(known).not.toContain(id);
        known = [...known, id];
      }
    }
  });

  it("ある系統が全て習得済みなら、その枠は飛ばす", () => {
    const rng = new Rng(3);
    const allAttack = Object.values(RUN_SKILLS)
      .filter((d) => d.category === "attack")
      .map((d) => d.id);
    const choices = rollRunSkillChoices(rng, allAttack);
    expect(choices.length).toBeLessThanOrEqual(2);
    for (const id of choices) {
      expect(RUN_SKILLS[id].category).not.toBe("attack");
    }
  });
});

describe("game.ts: レベルアップ時のスキル選択の進行", () => {
  it("レベルアップするとskillChoiceOfferedイベントが出て、選ぶまで他のコマンドが進まない", () => {
    const game = newGame(1);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    game.player.level = 1;
    game.player.exp = 0;
    // ちょうどLv2に上がるだけの経験値(EXP_TABLE[2]=10)。複数レベル一気に
    // 上がらせないことで、この後の「1回だけ選んで通常進行に戻る」確認がしやすくなる
    const monster = putMonster(game, { x: 0, y: 0 }, { exp: 10, hp: 1, maxHp: 1 });

    const killActor = access(game).killActor.bind(game);
    const events: { type: string; candidates?: string[] }[] = [];
    killActor(monster, events);

    expect(game.player.level).toBe(2);
    const offered = events.find((e) => e.type === "skillChoiceOffered");
    expect(offered).toBeDefined();
    expect(offered!.candidates).toHaveLength(3);

    const turnBefore = game.turnCount;
    const blocked = game.command({ type: "wait" });
    expect(blocked).toEqual([]);
    expect(game.turnCount).toBe(turnBefore);

    const chosen = offered!.candidates![0] as RunSkillId;
    const resolveEvents = game.command({ type: "chooseSkill", id: chosen });
    expect(game.runSkills).toContain(chosen);
    expect(resolveEvents.some((e) => e.type === "message")).toBe(true);

    // 選んだあとは通常どおり進む
    const afterTurn = game.turnCount;
    game.command({ type: "wait" });
    expect(game.turnCount).toBe(afterTurn + 1);
  });

  it("候補に無いidは無視される(不正な選択)", () => {
    const game = newGame(1);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const monster = putMonster(game, { x: 0, y: 0 }, { exp: 99999, hp: 1, maxHp: 1 });
    const killActor = access(game).killActor.bind(game);
    killActor(monster, []);

    const pending = access(game).skillChoiceState.pendingSkillChoice!;
    const notOffered = (Object.keys(RUN_SKILLS) as RunSkillId[]).find((id) => !pending.includes(id))!;
    const before = game.runSkills.length;
    game.command({ type: "chooseSkill", id: notOffered });
    expect(game.runSkills.length).toBe(before);
    expect(game.runSkills).not.toContain(notOffered);
  });

  it("1手で複数レベル上がると、選択肢を順番に出す", () => {
    const game = newGame(1);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    game.player.level = 1;
    game.player.exp = 0;
    const monster = putMonster(game, { x: 0, y: 0 }, { exp: 999999999, hp: 1, maxHp: 1 });
    const killActor = access(game).killActor.bind(game);
    const events: { type: string; candidates?: string[] }[] = [];
    killActor(monster, events);
    const levelsGained = game.player.level - 1;
    expect(levelsGained).toBeGreaterThan(1);

    let offeredCount = 0;
    for (let i = 0; i < levelsGained; i++) {
      const pending = access(game).skillChoiceState.pendingSkillChoice;
      if (!pending) break;
      offeredCount++;
      game.command({ type: "chooseSkill", id: pending[0]! });
    }
    expect(offeredCount).toBeGreaterThan(1);
    expect(game.runSkills.length).toBe(offeredCount);
  });
});

describe("game.ts: 攻撃系統のスキル効果", () => {
  it("なぎはらいは正面3方向に攻撃が当たる", () => {
    const game = newGame(1);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const room = { id: 1, x: 2, y: 2, w: 8, h: 8 };
    paintRoom(game, room);
    game.player.pos = { x: room.x + 4, y: room.y + 4 };
    give(game, "wideSlash");
    game.command({ type: "face", dir: 4 }); // 南向き
    const left = putMonster(game, { x: game.player.pos.x - 1, y: game.player.pos.y + 1 });
    const front = putMonster(game, { x: game.player.pos.x, y: game.player.pos.y + 1 });
    const right = putMonster(game, { x: game.player.pos.x + 1, y: game.player.pos.y + 1 });

    game.command({ type: "attack" });

    expect(left.hp).toBeLessThan(left.maxHp);
    expect(front.hp).toBeLessThan(front.maxHp);
    expect(right.hp).toBeLessThan(right.maxHp);
  });

  it("ふみこみは間合いが1伸びる", () => {
    const game = newGame(1);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const room = { id: 1, x: 2, y: 2, w: 8, h: 8 };
    paintRoom(game, room);
    game.player.pos = { x: room.x + 4, y: room.y + 4 };
    give(game, "stepIn");
    game.command({ type: "face", dir: 4 });
    const far = putMonster(game, { x: game.player.pos.x, y: game.player.pos.y + 2 });

    game.command({ type: "attack" });

    expect(far.hp).toBeLessThan(far.maxHp);
  });

  it("かちあげは攻撃した敵を1マス吹き飛ばす", () => {
    const game = newGame(1);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const room = { id: 1, x: 2, y: 2, w: 8, h: 8 };
    paintRoom(game, room);
    game.player.pos = { x: room.x + 4, y: room.y + 4 };
    give(game, "launcher");
    game.command({ type: "face", dir: 4 });
    // melee AIは押し出された直後に自分の手番で追いすがってくるため、最終位置ではなく
    // 「攻撃直後に1マス押し出されたこと」をイベントの並びで確かめる
    const target = putMonster(game, { x: game.player.pos.x, y: game.player.pos.y + 1 }, { hp: 999, maxHp: 999 });
    const before = { ...target.pos };

    const events = game.command({ type: "attack" });

    const pushEvent = events.find(
      (e) => e.type === "move" && "actorId" in e && e.actorId === target.id,
    ) as { from: { x: number; y: number }; to: { x: number; y: number } } | undefined;
    expect(pushEvent).toBeDefined();
    expect(pushEvent!.from).toEqual(before);
    expect(pushEvent!.to).not.toEqual(before);
  });

  it("がまんのかまえは足踏み直後の1撃だけ与ダメージが2倍になる", () => {
    const room = { id: 1, x: 2, y: 2, w: 8, h: 8 };

    const without = newGame(1);
    without.floor.actors = without.floor.actors.filter((a) => a.kind === "player");
    paintRoom(without, room);
    without.player.pos = { x: room.x + 4, y: room.y + 4 };
    without.command({ type: "face", dir: 4 });
    const normal = putMonster(without, { x: without.player.pos.x, y: without.player.pos.y + 1 }, { hp: 9999, maxHp: 9999, def: 0 });
    const before1 = normal.hp;
    without.command({ type: "attack" });
    const normalDamage = before1 - normal.hp;

    const game = newGame(1);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    paintRoom(game, room);
    game.player.pos = { x: room.x + 4, y: room.y + 4 };
    game.command({ type: "face", dir: 4 });
    give(game, "braced");
    game.command({ type: "wait" });
    expect(game.player.bracedReady).toBe(true);
    const target = putMonster(game, { x: game.player.pos.x, y: game.player.pos.y + 1 }, { hp: 9999, maxHp: 9999, def: 0 });
    const before2 = target.hp;
    game.command({ type: "attack" });
    const bracedDamage = before2 - target.hp;

    expect(game.player.bracedReady).toBe(false);
    expect(bracedDamage).toBeGreaterThan(normalDamage);
  });

  it("すてみは与ダメージが増える(常時)", () => {
    const withSkill = newGame(1);
    withSkill.floor.actors = withSkill.floor.actors.filter((a) => a.kind === "player");
    const room = { id: 1, x: 2, y: 2, w: 8, h: 8 };
    paintRoom(withSkill, room);
    withSkill.player.pos = { x: room.x + 4, y: room.y + 4 };
    give(withSkill, "allIn");
    withSkill.command({ type: "face", dir: 4 });
    const target1 = putMonster(withSkill, { x: withSkill.player.pos.x, y: withSkill.player.pos.y + 1 }, { hp: 9999, maxHp: 9999, def: 0 });
    const before1 = target1.hp;
    withSkill.command({ type: "attack" });
    const damageWithSkill = before1 - target1.hp;

    const without = newGame(1);
    without.floor.actors = without.floor.actors.filter((a) => a.kind === "player");
    paintRoom(without, room);
    without.player.pos = { x: room.x + 4, y: room.y + 4 };
    without.command({ type: "face", dir: 4 });
    const target2 = putMonster(without, { x: without.player.pos.x, y: without.player.pos.y + 1 }, { hp: 9999, maxHp: 9999, def: 0 });
    const before2 = target2.hp;
    without.command({ type: "attack" });
    const damageWithout = before2 - target2.hp;

    expect(damageWithSkill).toBeGreaterThan(damageWithout);
  });

  it("とどめのさきはHP1/4以下の敵への攻撃が必ず急所に当たる", () => {
    const game = newGame(1);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const room = { id: 1, x: 2, y: 2, w: 8, h: 8 };
    paintRoom(game, room);
    game.player.pos = { x: room.x + 4, y: room.y + 4 };
    give(game, "finisher");
    game.command({ type: "face", dir: 4 });
    putMonster(game, { x: game.player.pos.x, y: game.player.pos.y + 1 }, { hp: 10, maxHp: 100, def: 0 });

    const events = game.command({ type: "attack" });
    expect(events.some((e) => e.type === "message" && e.text === "会心の一撃!")).toBe(true);
  });
});

describe("game.ts: 支援系統のスキル効果", () => {
  it("わけあう手は隣接する仲間にも半分の回復が及ぶ", () => {
    const game = newGame(1);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    give(game, "sharingHand");
    const ally = addAlly(game, { hp: 1, maxHp: 20, pos: { x: game.player.pos.x + 1, y: game.player.pos.y } });
    game.player.hp = 1;
    game.player.maxHp = 100;
    const item = game.giveItem("healLeaf")!;

    game.command({ type: "use", uid: item.uid });

    expect(game.player.hp).toBeGreaterThan(1);
    expect(ally.hp).toBeGreaterThan(1);
  });

  it("ねぎらいは敵を倒すたび仲間全員のHPが1回復する", () => {
    const game = newGame(1);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    give(game, "appreciation");
    const ally = addAlly(game, { hp: 5, maxHp: 20, pos: { x: 50, y: 50 } });
    const monster = putMonster(game, { x: 0, y: 0 }, { hp: 1, maxHp: 1, exp: 1 });

    const killActor = access(game).killActor.bind(game);
    killActor(monster, []);

    expect(ally.hp).toBe(6);
  });

  it("つれさりの心得は空のタルでの捕獲成功率を上げる(統計的に確認)", () => {
    const trial = (withSkill: boolean): number => {
      let successes = 0;
      const trials = 60;
      for (let seed = 1; seed <= trials; seed++) {
        const game = newGame(seed);
        game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
        if (withSkill) give(game, "captureMastery");
        const { front } = faceOpenDirection(game)!;
        putMonster(game, front, { hp: 5, maxHp: 5, def: 0, speciesId: "gajiri" });
        game.player.carrying = { id: 1, kind: "empty", pos: game.player.pos };
        const events = game.command({ type: "throwBarrel" });
        if (events.some((e) => e.type === "capture")) successes++;
      }
      return successes;
    };
    expect(trial(true)).toBeGreaterThanOrEqual(trial(false));
  });

  it("目覚めのいのりは仲間が倒れる一撃をそのダイブで一度だけHP1で耐えさせる", () => {
    const game = newGame(1);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    give(game, "wakingPrayer");
    const ally = addAlly(game, { hp: 5, maxHp: 20, pos: { x: 0, y: 0 } });

    const damageActor = (
      game as unknown as { damageActor: (target: AllyActor, damage: number, critical: boolean, events: unknown[]) => void }
    ).damageActor.bind(game);
    damageActor(ally, 999, false, []);

    expect(ally.alive).toBe(true);
    expect(ally.hp).toBe(1);

    // 1ラン1回だけ。2回目は普通に倒れる
    const ally2 = addAlly(game, { hp: 5, maxHp: 20, pos: { x: 1, y: 1 } });
    damageActor(ally2, 999, false, []);
    expect(ally2.alive).toBe(false);
  });

  it("かばいあいは隣接する仲間・自分への攻撃を代わりに受けることがある", () => {
    let redirected = false;
    for (let seed = 1; seed <= 40 && !redirected; seed++) {
      const game = newGame(seed);
      game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
      give(game, "mutualGuard");
      const ally = addAlly(game, {
        hp: 9999,
        maxHp: 9999,
        def: 0,
        pos: { x: game.player.pos.x + 1, y: game.player.pos.y },
      });
      const attackerMonster = putMonster(game, { x: game.player.pos.x - 1, y: game.player.pos.y }, { atk: 5, def: 0 });

      const attack = (
        game as unknown as {
          attack: (attacker: unknown, target: unknown, power: number, events: unknown[]) => void;
        }
      ).attack.bind(game);
      const playerHpBefore = game.player.hp;
      attack(attackerMonster, game.player, attackerMonster.atk, []);
      if (game.player.hp === playerHpBefore && ally.hp < ally.maxHp) {
        redirected = true;
      }
    }
    expect(redirected).toBe(true);
  });
});

describe("game.ts: タル系統のスキル効果", () => {
  it("かるがるはタルの投げ射程を延ばす", () => {
    const game = newGame(1);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const room = { id: 1, x: 2, y: 2, w: 15, h: 15 };
    paintRoom(game, room);
    game.player.pos = { x: room.x + 1, y: room.y + 7 };
    game.command({ type: "face", dir: 2 }); // 東向き

    const withoutSkill = newGame(2);
    withoutSkill.floor.actors = withoutSkill.floor.actors.filter((a) => a.kind === "player");
    paintRoom(withoutSkill, room);
    withoutSkill.player.pos = { x: room.x + 1, y: room.y + 7 };
    withoutSkill.command({ type: "face", dir: 2 });

    give(game, "lightCarry");
    const traceWith = traceThrow(
      game.floor,
      game.player.pos,
      game.player.facing,
      BARREL_RANGE + LIGHT_CARRY_RANGE_BONUS,
      false,
      game.player.id,
    );
    const traceWithout = traceThrow(
      withoutSkill.floor,
      withoutSkill.player.pos,
      withoutSkill.player.facing,
      BARREL_RANGE,
      false,
      withoutSkill.player.id,
    );

    expect(traceWith.landing.x - game.player.pos.x).toBeGreaterThan(
      traceWithout.landing.x - withoutSkill.player.pos.x,
    );
  });

  it("いたわり投げは空のタルで捕獲を狙うと必ずHP1で止める", () => {
    const game = newGame(1);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    give(game, "gentleThrow");
    const { front } = faceOpenDirection(game)!;
    const target = putMonster(game, front, { hp: 50, maxHp: 50, def: 0 });
    game.player.carrying = { id: 1, kind: "empty", pos: game.player.pos };

    game.command({ type: "throwBarrel" });

    if (target.alive) {
      expect(target.hp).toBe(1);
    }
  });

  it("つぎたしはあけた元素タルがもう1回ぶん中身を残す", () => {
    const game = newGame(1);
    faceOpenDirection(game);
    give(game, "refillBarrel");
    game.player.carrying = { id: 1, kind: "water", pos: game.player.pos };

    game.command({ type: "openBarrel" });
    expect(game.player.carrying?.kind).toBe("water");
    expect(game.player.carrying?.refillUsed).toBe(true);

    game.command({ type: "openBarrel" });
    expect(game.player.carrying?.kind).toBe("empty");
  });

  it("タルやぶりは正面に置かれたタルを攻撃で割れる", () => {
    const game = newGame(1);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    game.floor.barrels = [];
    give(game, "barrelBurst");
    const { front } = faceOpenDirection(game)!;
    game.floor.barrels.push({ id: 555, kind: "bomb", pos: front });

    const before = game.player.hp;
    game.command({ type: "attack" });

    expect(game.floor.barrels.some((b) => b.id === 555)).toBe(false);
    expect(game.player.hp).toBeLessThan(before);
  });

  it("かつぎばしりはタルを抱えている間、気づかれにくくなる", () => {
    let suppressed = false;
    for (let seed = 1; seed <= 60 && !suppressed; seed++) {
      const game = newGame(seed);
      give(game, "stealthCarry");
      game.player.carrying = { id: 1, kind: "empty", pos: game.player.pos };
      game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
      const monster = putMonster(game, { x: game.player.pos.x + 1, y: game.player.pos.y }, { aware: false });
      game.command({ type: "wait" });
      if (!monster.aware) suppressed = true;
    }
    expect(suppressed).toBe(true);
  });
});

describe("save.ts/mid-dive-autosave: runSkillsの往復", () => {
  it("toSnapshotで書き出したrunSkillsが復元後も保たれる", () => {
    const game = newGame(1);
    give(game, "wideSlash", "sharingHand");
    const snapshot = game.toSnapshot();
    const restored = new Game({ seed: 1, resume: snapshot });
    expect(restored.runSkills).toEqual(["wideSlash", "sharingHand"]);
  });

  it("runSkillsが欠けたスナップショットでも壊れない(導入前の互換性)", () => {
    const game = newGame(1);
    const snapshot = game.toSnapshot();
    const legacy = { ...snapshot, runSkills: undefined, pendingSkillChoice: undefined, pendingLevelUpChoices: undefined } as unknown as ReturnType<Game["toSnapshot"]>;
    const restored = new Game({ seed: 1, resume: legacy });
    expect(restored.runSkills).toEqual([]);
  });
});
