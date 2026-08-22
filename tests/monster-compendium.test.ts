import { describe, expect, it } from "vitest";
import { Game } from "../src/game";
import { Rng } from "../src/core/rng";
import type { GameEvent } from "../src/core/events";
import type { OncePerRunTracker } from "../src/core/oncePerRunTracker";
import { mitigateIncomingDamage as domainMitigateIncomingDamage } from "../src/domain/combat/damageModifier";
import { decideMonsterAction, GUARD_COUNTER_BONUS } from "../src/entities/ai";
import { createMonster } from "../src/domain/dungeon/populate";
import { speciesById, speciesForDepth, SPECIES } from "../src/entities/species";
import {
  hasStatus,
  STATUS_CONFUSE,
  STATUS_SEAL,
  type Actor,
  type AllyActor,
  type FloorState,
  type Tile,
} from "../src/core/types";
import {
  initialSave,
  isCompendiumComplete,
  loadSave,
  markSpeciesCaptured,
  markSpeciesSeen,
  type SaveData,
} from "../src/save";
import { withMockedLocalStorage } from "./helpers/localStorage";
import { runActors as runActorsVia } from "./helpers/access";

function makeOpenFloor(): FloorState {
  const width = 9;
  const height = 9;
  const tiles: Tile[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inRoom = x >= 1 && x < width - 1 && y >= 1 && y < height - 1;
      tiles.push({ kind: inRoom ? 1 : 0, roomId: inRoom ? 0 : -1, explored: true, visible: true });
    }
  }
  return {
    depth: 20,
    width,
    height,
    tiles,
    rooms: [{ id: 0, x: 1, y: 1, w: width - 2, h: height - 2 }],
    stairs: { x: 7, y: 7 },
    actors: [],
    items: [],
    traps: [],
    barrels: [],
    goldPiles: [],
    fieldObstacles: [],
    secretPassages: [],
  };
}

function makePlayer(pos = { x: 4, y: 4 }): Actor {
  return {
    id: 1,
    kind: "player",
    name: "プレイヤー",
    model: "garudo",
    pos,
    facing: 4,
    hp: 100,
    maxHp: 100,
    atk: 10,
    def: 0,
    level: 1,
    statuses: [],
    alive: true,
  };
}

describe("entities/species.ts: 地方別の新種", () => {
  it("14種すべてが speciesForDepth 経由で正しい階層から出現しうる", () => {
    const newIds = [
      "moyautsubo",
      "wasuregani",
      "yumekuimogura",
      "horoholocho",
      "yoroimukade",
      "oitekeboshi",
      "shizukuuo",
      "urumiguma",
      "yamabikogitsune",
      "kodamausagi",
      "menkaburikozo",
      "kazaridaruma",
      "yumemayoinokage",
      "yorishironozankyo",
    ];
    for (const id of newIds) {
      const species = speciesById(id);
      expect(speciesForDepth(species.minFloor).some((s) => s.id === id)).toBe(true);
      expect(speciesForDepth(species.minFloor - 1).some((s) => s.id === id)).toBe(false);
    }
  });

  it("ワスレガニ・ヨロイムカデはそれぞれ混乱・封じをinflictsに持つ", () => {
    expect(speciesById("wasuregani").inflicts?.kind).toBe("confuse");
    expect(speciesById("yoroimukade").inflicts?.kind).toBe("seal");
  });
});

describe("entities/ai.ts: ambush・mimic AI", () => {
  it("隣接するまでは何もしない(徘徊もしない)", () => {
    const floor = makeOpenFloor();
    const monster = createMonster(2, speciesById("moyautsubo"), { x: 6, y: 6 });
    const player = makePlayer();
    floor.actors.push(monster, player);
    const action = decideMonsterAction(new Rng(1), floor, monster, player, new Int32Array(floor.width * floor.height).fill(-1));
    expect(action).toEqual({ type: "wait" });
    expect(monster.aware).toBe(false);
  });

  it("隣接すると気づいて攻撃し、ambushReadyが立つ", () => {
    const floor = makeOpenFloor();
    const monster = createMonster(2, speciesById("moyautsubo"), { x: 4, y: 5 });
    const player = makePlayer({ x: 4, y: 4 });
    floor.actors.push(monster, player);
    const action = decideMonsterAction(new Rng(1), floor, monster, player, new Int32Array(floor.width * floor.height).fill(-1));
    expect(action).toEqual({ type: "attack", targetId: player.id });
    expect(monster.aware).toBe(true);
    expect(monster.ambushReady).toBe(true);
  });
});

describe("entities/ai.ts: guard AI", () => {
  it("敵が見えていても自分からは追わず、その場で待つ", () => {
    const floor = makeOpenFloor();
    const monster = createMonster(2, speciesById("wasuregani"), { x: 3, y: 3 });
    monster.aware = true;
    const player = makePlayer({ x: 6, y: 6 });
    floor.actors.push(monster, player);
    const action = decideMonsterAction(new Rng(1), floor, monster, player, new Int32Array(floor.width * floor.height).fill(-1));
    expect(action).toEqual({ type: "wait" });
  });

  it("隣接されれば通常どおり攻撃を選ぶ", () => {
    const floor = makeOpenFloor();
    const monster = createMonster(2, speciesById("wasuregani"), { x: 4, y: 5 });
    monster.aware = true;
    const player = makePlayer({ x: 4, y: 4 });
    floor.actors.push(monster, player);
    const action = decideMonsterAction(new Rng(1), floor, monster, player, new Int32Array(floor.width * floor.height).fill(-1));
    expect(action).toEqual({ type: "attack", targetId: player.id });
  });
});

describe("entities/ai.ts: burrow AI", () => {
  it("隣接していなければ潜ったまま待ち、タイマーが尽きるとプレイヤー付近に現れる", () => {
    const floor = makeOpenFloor();
    const monster = createMonster(2, speciesById("yumekuimogura"), { x: 2, y: 2 });
    monster.burrowTimer = 0;
    const player = makePlayer({ x: 6, y: 6 });
    floor.actors.push(monster, player);
    const before = { ...monster.pos };
    const action = decideMonsterAction(new Rng(1), floor, monster, player, new Int32Array(floor.width * floor.height).fill(-1));
    expect(action.type).toBe("burrowSurface");
    // 座標の書き換えとteleportイベントの発行は呼び出し側(game.ts)の責務なので、
    // decideMonsterAction自体はmonster.posを変えない(#180: 直接書き換えると
    // 表示側が古い位置のまま取り残され、次に動いたとき遠くへ飛んで見える)
    expect(monster.pos).toEqual(before);
    expect(monster.aware).toBe(true);
    if (action.type === "burrowSurface") {
      expect(action.to).not.toEqual(before);
    }
  });

  it("#180: game.tsのrunActorsは座標を動かすと同時にteleportイベントを出す(表示側の取り残し防止)", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const monster = createMonster(9010, speciesById("yumekuimogura"), {
      x: game.player.pos.x + 5,
      y: game.player.pos.y,
    });
    monster.burrowTimer = 0;
    game.floor.actors.push(monster);
    const before = { ...monster.pos };

    const events: { type: string; actorId?: number; to?: unknown }[] = [];
    runActorsVia(game, events);

    expect(monster.pos).not.toEqual(before);
    expect(events.some((e) => e.type === "teleport" && e.actorId === monster.id)).toBe(true);
  });

  it("隣接していれば潜伏中でも応戦する", () => {
    const floor = makeOpenFloor();
    const monster = createMonster(2, speciesById("yumekuimogura"), { x: 4, y: 5 });
    const player = makePlayer({ x: 4, y: 4 });
    floor.actors.push(monster, player);
    const action = decideMonsterAction(new Rng(1), floor, monster, player, new Int32Array(floor.width * floor.height).fill(-1));
    expect(action).toEqual({ type: "attack", targetId: player.id });
  });
});

describe("entities/ai.ts: adjacentFoe の avoidDisguised", () => {
  it("みをかくす持ちの仲間より、他に候補がいればそちらを狙う", () => {
    const floor = makeOpenFloor();
    const monster = createMonster(2, speciesById("wasuregani"), { x: 4, y: 4 });
    const disguised: Actor = {
      id: 10,
      kind: "ally",
      name: "みをかくす持ち",
      model: "purun",
      pos: { x: 5, y: 4 },
      facing: 4,
      hp: 10,
      maxHp: 10,
      atk: 1,
      def: 0,
      level: 1,
      statuses: [],
      alive: true,
      skills: ["disguise"],
    };
    const player = makePlayer({ x: 3, y: 4 });
    floor.actors.push(monster, disguised, player);
    monster.aware = true;
    const action = decideMonsterAction(new Rng(1), floor, monster, player, new Int32Array(floor.width * floor.height).fill(-1));
    expect(action).toEqual({ type: "attack", targetId: player.id });
  });
});

describe("game.ts: guardの反撃力補正", () => {
  it("GUARD_COUNTER_BONUSは1より大きい", () => {
    expect(GUARD_COUNTER_BONUS).toBeGreaterThan(1);
  });
});

describe("game.ts: オイテケボシ(drainsSatiety)", () => {
  it("被弾者のHPではなく満腹度を削る", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    game.player.satiety = 100;
    const hpBefore = game.player.hp;
    const oitekeboshi = createMonster(9001, speciesById("oitekeboshi"), {
      x: game.player.pos.x + 1,
      y: game.player.pos.y,
    });
    game.floor.actors.push(oitekeboshi);

    const attack = (
      game as unknown as {
        attack: (attacker: Actor, target: Actor, attackPower: number, events: unknown[]) => void;
      }
    ).attack.bind(game);
    const events: { type: string; text?: string }[] = [];
    attack(oitekeboshi, game.player, oitekeboshi.atk, events);

    expect(game.player.hp).toBe(hpBefore);
    expect(game.player.satiety).toBeLessThan(100);
    expect(events.some((e) => e.type === "message" && e.text?.includes("満腹度が"))).toBe(true);
  });
});

describe("game.ts: 夢あわせで得た付与系特技(みだしのつめ・ふうじのキバ)", () => {
  function alliedAttacker(skills: AllyActor["skills"]): AllyActor {
    return {
      id: 50,
      kind: "ally",
      name: "テスト仲間",
      model: "purun",
      pos: { x: 0, y: 0 },
      facing: 4,
      hp: 100,
      maxHp: 100,
      atk: 5,
      def: 0,
      level: 1,
      statuses: [],
      alive: true,
      skills,
    };
  }

  it("みだしのつめ持ちの仲間は、素のinflictsが無くても混乱を狙える", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const game = new Game({ seed });
      game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
      const attacker = alliedAttacker(["confusingClaw"]);
      const target: Actor = { ...makePlayer(), id: 99, kind: "monster", hp: 1_000_000, maxHp: 1_000_000 };
      const attack = (
        game as unknown as {
          attack: (a: Actor, t: Actor, p: number, e: unknown[]) => void;
        }
      ).attack.bind(game);
      const events: { type: string; text?: string }[] = [];
      attack(attacker, target, attacker.atk, events);
      if (!hasStatus(target, STATUS_CONFUSE)) continue;
      expect(hasStatus(target, STATUS_CONFUSE)).toBe(true);
      return;
    }
    throw new Error("混乱が観測できるseedが見つからなかった");
  });

  it("ふうじのキバ持ちの仲間は、素のinflictsが無くても封じを狙える", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const game = new Game({ seed });
      game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
      const attacker = alliedAttacker(["sealBite"]);
      const target: Actor = { ...makePlayer(), id: 99, kind: "monster", hp: 1_000_000, maxHp: 1_000_000 };
      const attack = (
        game as unknown as {
          attack: (a: Actor, t: Actor, p: number, e: unknown[]) => void;
        }
      ).attack.bind(game);
      const events: { type: string; text?: string }[] = [];
      attack(attacker, target, attacker.atk, events);
      if (!hasStatus(target, STATUS_SEAL)) continue;
      expect(hasStatus(target, STATUS_SEAL)).toBe(true);
      return;
    }
    throw new Error("封じが観測できるseedが見つからなかった");
  });

  it("特技「ふいのいちげき」はそのランの最初の1撃だけダメージ+50%になる", () => {
    const makeTarget = (): Actor => ({
      ...makePlayer(),
      id: 99,
      kind: "monster",
      def: 0,
      hp: 1_000_000,
      maxHp: 1_000_000,
    });

    // 会心やRNGの揺らぎを避けるため、同条件で複数回平均を取って比較する
    const trials = 60;
    let firstHitTotal = 0;
    let laterHitsTotal = 0;
    for (let i = 0; i < trials; i++) {
      const g = new Game({ seed: i + 1 });
      const a = alliedAttacker(["ambushStrike"]);
      const boundAttack = (
        g as unknown as { attack: (a: Actor, t: Actor, p: number, e: unknown[]) => void }
      ).attack.bind(g);
      const t1 = makeTarget();
      const e1: { type: string; amount?: number }[] = [];
      boundAttack(a, t1, a.atk, e1);
      firstHitTotal += e1.find((e) => e.type === "damage")?.amount ?? 0;
      const t2 = makeTarget();
      const e2: { type: string; amount?: number }[] = [];
      boundAttack(a, t2, a.atk, e2);
      laterHitsTotal += e2.find((e) => e.type === "damage")?.amount ?? 0;
    }
    expect(firstHitTotal).toBeGreaterThan(laterHitsTotal);
  });
});

describe("game.ts: はねひらり・とんずら", () => {
  it("はねひらり持ちの仲間は、確率で被弾を完全に無効化する", () => {
    const mitigate = (game: Game, target: Actor, damage: number, events: unknown[]) => {
      const internals = game as unknown as { oncePerRun: OncePerRunTracker; partyGuardTurns: number };
      return domainMitigateIncomingDamage({
        target,
        damage,
        events: events as GameEvent[],
        rng: game.rng,
        runSkills: game.runSkills,
        player: game.player,
        oncePerRun: internals.oncePerRun,
        partyGuardTurns: internals.partyGuardTurns,
      });
    };

    for (let seed = 1; seed <= 60; seed++) {
      const game = new Game({ seed });
      const target: Actor = {
        id: 50,
        kind: "ally",
        name: "はねひらり",
        model: "purun",
        pos: { x: 0, y: 0 },
        facing: 4,
        hp: 100,
        maxHp: 100,
        atk: 1,
        def: 0,
        level: 1,
        statuses: [],
        alive: true,
        skills: ["flutterDodge"],
      };
      const events: unknown[] = [];
      const result = mitigate(game, target, 50, events);
      if (result !== 0) continue;
      expect(result).toBe(0);
      return;
    }
    throw new Error("回避が観測できるseedが見つからなかった");
  });

  it("とんずら持ちの仲間は、瀕死になる一撃を1ラン1回だけ避ける", () => {
    const game = new Game({ seed: 1 });
    const target: Actor = {
      id: 50,
      kind: "ally",
      name: "とんずら",
      model: "purun",
      pos: { x: 0, y: 0 },
      facing: 4,
      hp: 100,
      maxHp: 100,
      atk: 1,
      def: 0,
      level: 1,
      statuses: [],
      alive: true,
      skills: ["burrowEscape"],
    };
    const internals = game as unknown as { oncePerRun: OncePerRunTracker; partyGuardTurns: number };
    const mitigate = (t: Actor, d: number, e: unknown[]) =>
      domainMitigateIncomingDamage({
        target: t,
        damage: d,
        events: e as GameEvent[],
        rng: game.rng,
        runSkills: game.runSkills,
        player: game.player,
        oncePerRun: internals.oncePerRun,
        partyGuardTurns: internals.partyGuardTurns,
      });

    // maxHpの3割を大きく超える一撃で「瀕死」を発生させる
    const events1: unknown[] = [];
    expect(mitigate(target, 90, events1)).toBe(0);

    // 1ラン1回だけなので、2回目は通常どおりダメージが通る
    const events2: unknown[] = [];
    expect(mitigate(target, 90, events2)).toBe(90);
  });
});

describe("game.ts: regenIfUnhit・しずけさのいやし", () => {
  it("被弾しなかったターンにHPが少し回復する", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const urumiguma = createMonster(9001, speciesById("urumiguma"), {
      x: game.player.pos.x + 3,
      y: game.player.pos.y,
    });
    urumiguma.hp = urumiguma.maxHp - 10;
    game.floor.actors.push(urumiguma);
    const hpBefore = urumiguma.hp;
    game.command({ type: "wait" });
    expect(urumiguma.hp).toBeGreaterThan(hpBefore);
  });
});

describe("game.ts: やまびこぎつね(alertsFloorOnSight)", () => {
  it("初めて視認した瞬間、フロア中の他のモンスターにも気づかせる", () => {
    const floor = makeOpenFloor();
    const yamabiko = createMonster(2, speciesById("yamabikogitsune"), { x: 2, y: 2 });
    const bystander = createMonster(3, speciesById("wasuregani"), { x: 7, y: 7 });
    const player = makePlayer({ x: 3, y: 2 });
    floor.actors.push(yamabiko, bystander, player);
    expect(bystander.aware).toBe(false);
    decideMonsterAction(new Rng(1), floor, yamabiko, player, new Int32Array(floor.width * floor.height).fill(-1));
    expect(yamabiko.aware).toBe(true);
    expect(bystander.aware).toBe(true);
  });
});

describe("save.ts: モンスター図鑑", () => {
  it("markSpeciesSeen/markSpeciesCapturedが正しく状態遷移する", () => {
    withMockedLocalStorage(() => {
      let save: SaveData = initialSave();
      expect(save.compendium["purun"]).toBeUndefined();

      save = markSpeciesSeen(save, "purun");
      expect(save.compendium["purun"]).toBe("seen");

      // 既に"seen"以上なら、再度seenにしても状態は変わらない(上書きしない)
      save = markSpeciesCaptured(save, "purun");
      expect(save.compendium["purun"]).toBe("captured");
      save = markSpeciesSeen(save, "purun");
      expect(save.compendium["purun"]).toBe("captured");
    });
  });

  it("isCompendiumCompleteは全種捕まえて初めてtrueになる", () => {
    withMockedLocalStorage(() => {
      let save: SaveData = initialSave();
      expect(isCompendiumComplete(save)).toBe(false);
      for (const s of SPECIES) {
        save = markSpeciesCaptured(save, s.id);
      }
      expect(isCompendiumComplete(save)).toBe(true);
    });
  });

  it("壊れたセーブデータのcompendiumは未知の種族id・不正なstatusを捨てる", () => {
    withMockedLocalStorage(() => {
      localStorage.setItem(
        "garudo-dungeon/v1/slot0",
        JSON.stringify({
          compendium: { purun: "captured", みしらぬ種族: "captured", gajiri: "こわれたstatus" },
        }),
      );
      const loaded = loadSave();
      expect(loaded.compendium).toEqual({ purun: "captured" });
    });
  });
});

describe("game.ts: モンスター図鑑の「見た」イベント", () => {
  it("視界に入った野生モンスターの種族について、ダイブ中1回だけmonsterSightedを発生させる", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const monster = createMonster(9001, speciesById("purun"), { x: game.player.pos.x, y: game.player.pos.y });
    // updateVisibilityの計算に乗るよう、プレイヤーと同じ部屋の可視範囲に置く
    game.floor.actors.push(monster);

    const events = game.command({ type: "wait" });
    const sighted = events.filter(
      (e): e is Extract<(typeof events)[number], { type: "monsterSighted" }> => e.type === "monsterSighted",
    );
    expect(sighted).toHaveLength(1);
    expect(sighted[0]?.speciesId).toBe("purun");

    // 同じ種族を2回通知しない
    const events2 = game.command({ type: "wait" });
    expect(events2.some((e) => e.type === "monsterSighted")).toBe(false);
  });
});
