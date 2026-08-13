import { describe, expect, it } from "vitest";
import { Game } from "../src/game";
import { withMockedLocalStorage } from "./helpers/localStorage";
import { hokoraDustCost, markDef, MARKS, MARK_STONE_DEF_ID } from "../src/entities/forging";
import {
  addItem,
  createInventory,
  equip,
  shieldBonus,
  shieldMarkIds,
  weaponBonus,
  weaponMarkIds,
} from "../src/items/inventory";
import { STATUS_SLEEP, hasStatus, isFree, type Actor, type MarkId } from "../src/core/types";
import { fromStored, loadSave, toStored, type StoredItem } from "../src/save";

describe("entities/forging.ts", () => {
  it("強化に必要なほこら粉は 2+plus 個", () => {
    expect(hokoraDustCost(0)).toBe(2);
    expect(hokoraDustCost(5)).toBe(7);
  });

  it("5種すべての印が定義されている", () => {
    expect(MARKS).toHaveLength(5);
    for (const m of MARKS) {
      expect(markDef(m.id)).toBe(m);
      expect(MARK_STONE_DEF_ID[m.id]).toMatch(/^markStone/);
    }
  });
});

describe("items/inventory.ts: 強化値・印", () => {
  it("weaponBonus/shieldBonusはplusぶんも加算する(武器+2/plus、盾+1/plus)", () => {
    const inv = createInventory();
    addItem(inv, { uid: 1, defId: "hatchet", plus: 3 });
    equip(inv, 1);
    addItem(inv, { uid: 2, defId: "woodShield", plus: 2 });
    equip(inv, 2);
    // hatchet bonus=4, woodShield bonus=3(catalog.ts参照)
    expect(weaponBonus(inv)).toBe(4 + 3 * 2);
    expect(shieldBonus(inv)).toBe(3 + 2 * 1);
  });

  it("weaponMarkIds/shieldMarkIdsは装備中のアイテムのmarkIdsを返す(plan/dual-mark-equipment.md)", () => {
    const inv = createInventory();
    addItem(inv, { uid: 1, defId: "hatchet", markIds: ["gajiri"] });
    equip(inv, 1);
    expect(weaponMarkIds(inv)).toEqual(["gajiri"]);
    expect(shieldMarkIds(inv)).toEqual([]);
  });

  it("weaponMarkIds/shieldMarkIdsは2つ目の印まで返す(plan/dual-mark-equipment.md)", () => {
    const inv = createInventory();
    addItem(inv, { uid: 1, defId: "hatchet", markIds: ["gajiri", "tsubute"] });
    equip(inv, 1);
    expect(weaponMarkIds(inv)).toEqual(["gajiri", "tsubute"]);
  });
});

describe("save.ts: toStored/fromStoredはplus・markIdsを保つ", () => {
  it("round-tripでplus・markIdsが失われない", () => {
    const stored = toStored({ uid: 9, defId: "hatchet", plus: 4, markIds: ["tsubute"] });
    expect(stored).toEqual({ defId: "hatchet", plus: 4, markIds: ["tsubute"] });
    const item = fromStored(stored, 9);
    expect(item).toEqual({ uid: 9, defId: "hatchet", plus: 4, markIds: ["tsubute"] });
  });

  it("plus・markIdsが無ければキー自体を持たない", () => {
    const stored = toStored({ uid: 1, defId: "healLeaf" });
    expect(stored).toEqual({ defId: "healLeaf" });
  });
});

describe("save.ts: 壊れたセーブデータのplus・markIds", () => {
  it("範囲外のplus・未知のmarkIdは捨てる", () => {
    withMockedLocalStorage(() => {
      localStorage.setItem(
        "garudo-dungeon/v1/slot0",
        JSON.stringify({
          storage: [
            { defId: "hatchet", plus: 3, markIds: ["gajiri"] }, // 正常
            { defId: "hatchet", plus: -1 }, // 範囲外
            { defId: "hatchet", plus: 999 }, // 範囲外
            { defId: "hatchet", markIds: ["みしらぬ印"] }, // 未知
          ],
        }),
      );
      const loaded = loadSave();
      const items = loaded.storage as StoredItem[];
      expect(items).toHaveLength(4);
      expect(items[0]).toEqual({ defId: "hatchet", plus: 3, markIds: ["gajiri"] });
      expect(items[1]).toEqual({ defId: "hatchet" });
      expect(items[2]).toEqual({ defId: "hatchet" });
      expect(items[3]).toEqual({ defId: "hatchet" });
    });
  });

  it("2つを超えるmarkIdsは先頭2件までに切り詰める", () => {
    withMockedLocalStorage(() => {
      localStorage.setItem(
        "garudo-dungeon/v1/slot0",
        JSON.stringify({
          storage: [{ defId: "hatchet", markIds: ["gajiri", "tsubute", "madoromi"] }],
        }),
      );
      const loaded = loadSave();
      const items = loaded.storage as StoredItem[];
      expect(items[0]).toEqual({ defId: "hatchet", markIds: ["gajiri", "tsubute"] });
    });
  });

  it("plan/dual-mark-equipment.md以前の単数形markIdは、markIds: [markId]へ読み替える", () => {
    withMockedLocalStorage(() => {
      localStorage.setItem(
        "garudo-dungeon/v1/slot0",
        JSON.stringify({
          storage: [
            { defId: "hatchet", plus: 9, markId: "gajiri" }, // 旧形式
            { defId: "hatchet", markId: "みしらぬ印" }, // 旧形式・未知
          ],
        }),
      );
      const loaded = loadSave();
      const items = loaded.storage as StoredItem[];
      expect(items[0]).toEqual({ defId: "hatchet", plus: 9, markIds: ["gajiri"] });
      expect(items[1]).toEqual({ defId: "hatchet" });
    });
  });
});

/** プレイヤーの正面が空くように向きを選ぶ。見つかればその方向を向かせる */
function faceOpenDirection(game: Game) {
  for (const dir of [2, 6, 4, 0, 1, 3, 5, 7] as const) {
    const d = [
      { x: 0, y: -1 },
      { x: 1, y: -1 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: -1, y: 1 },
      { x: -1, y: 0 },
      { x: -1, y: -1 },
    ][dir]!;
    const front = { x: game.player.pos.x + d.x, y: game.player.pos.y + d.y };
    if (isFree(game.floor, front)) {
      game.command({ type: "face", dir });
      return { dir, front };
    }
  }
  return null;
}

function putMonster(game: Game, pos: { x: number; y: number }, overrides: Partial<Actor> = {}): Actor {
  const monster: Actor = {
    id: 9001 + Math.floor(Math.random() * 100000),
    kind: "monster",
    name: "テスト用モンスター",
    speciesId: "gajiri",
    model: "gajiri",
    pos,
    facing: 4,
    hp: 100000,
    maxHp: 100000,
    atk: 1,
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

/** 新しいGameを作り、プレイヤーに印つきの武器/盾を装備させる */
function newGameWithMark(seed: number, defId: "hatchet" | "woodShield", markId?: MarkId): Game {
  const game = new Game({ seed });
  if (markId) {
    const inv = game.player.inventory;
    addItem(inv, { uid: 9999, defId, markIds: [markId] });
    equip(inv, 9999);
  }
  return game;
}

describe("印の戦闘効果", () => {
  it("ガジリねずみの印: そのランの最初の1手は必ず会心になる", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const game = newGameWithMark(seed, "hatchet", "gajiri");
      game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
      const setup = faceOpenDirection(game);
      if (!setup) continue;
      const monster = putMonster(game, setup.front);
      const events = game.command({ type: "attack" });
      const damage = events.find(
        (e): e is Extract<(typeof events)[number], { type: "damage" }> =>
          e.type === "damage" && e.actorId === monster.id,
      );
      if (!damage) continue;
      expect(damage.critical, `seed=${seed}`).toBe(true);
      return;
    }
    throw new Error("開けた方向が見つからなかった");
  });

  /** 遠く・頑丈なモンスターに向けて何度もタルを投げ、平均ダメージを求める */
  function averageThrowDamage(seed: number, markId?: MarkId): number | null {
    const game = newGameWithMark(seed, "hatchet", markId);
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    // モンスターの反撃で400回の試行中に力尽きないよう、HPを大きくしておく
    game.player.hp = 1_000_000;
    game.player.maxHp = 1_000_000;
    const setup = faceOpenDirection(game);
    if (!setup) return null;
    // speciesIdを持たせないと「仲間にできるのはモンスターだけ」の判定で弾かれ、
    // からのタルに吸い込まれて盤面から消えることがなくなる(捕獲抽選の影響を排除する)
    const monster = putMonster(game, setup.front, {
      def: 0,
      hp: 10_000_000,
      maxHp: 10_000_000,
      speciesId: undefined,
    });
    const trials = 400;
    let total = 0;
    for (let i = 0; i < trials; i++) {
      game.player.carrying = { id: 1, kind: "empty", pos: game.player.pos };
      const before = monster.hp;
      game.command({ type: "throwBarrel" });
      total += before - monster.hp;
    }
    return total / trials;
  }

  it("ツブテガエルの印: タルを投げたときのダメージ+2(多数試行の平均で検証)", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const plainAvg = averageThrowDamage(seed);
      const markedAvg = averageThrowDamage(seed, "tsubute");
      if (plainAvg === null || markedAvg === null) continue;
      expect(markedAvg - plainAvg, `seed=${seed}`).toBeGreaterThan(1.7);
      expect(markedAvg - plainAvg, `seed=${seed}`).toBeLessThan(2.3);
      return;
    }
    throw new Error("開けた方向が見つかるseedがなかった");
  });

  it("マドロミダケの印: 通常攻撃に眠り付与の確率+10%が乗る", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const game = newGameWithMark(seed, "hatchet", "madoromi");
      game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
      const setup = faceOpenDirection(game);
      if (!setup) continue;
      const monster = putMonster(game, setup.front, { hp: 10_000_000, maxHp: 10_000_000, aware: true });
      let slept = false;
      for (let i = 0; i < 60 && !slept; i++) {
        game.command({ type: "attack" });
        if (hasStatus(monster, STATUS_SLEEP)) slept = true;
      }
      if (!slept) continue; // このseedでは60回でも眠らなかった。念のため別seedで試す
      expect(slept).toBe(true);
      return;
    }
    throw new Error("眠りが観測できるseedが見つからなかった");
  });

  it("ぷるんの印: 被弾時に確率5割で1割軽減のメッセージが出る", () => {
    // "wait"コマンドは呼ぶたびにguarding(身構え)をtrueへ戻し、被弾時に
    // ぷるんの印より常に優先されてしまう(身構えは被弾で消費されるまで
    // 何度でも再武装されるため)。印の分岐を実際に届かせるため、
    // モンスターのattackを直接呼び出してguardingを経由しない
    for (let seed = 1; seed <= 20; seed++) {
      const game = newGameWithMark(seed, "woodShield", "purun");
      game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
      game.player.hp = 1_000_000;
      game.player.maxHp = 1_000_000;
      const setup = faceOpenDirection(game);
      if (!setup) continue;
      const monster = putMonster(game, setup.front, { atk: 20, def: 0 });
      const attack = (
        game as unknown as {
          attack: (attacker: Actor, target: Actor, attackPower: number, events: unknown[]) => void;
        }
      ).attack.bind(game);
      let reduced = false;
      for (let i = 0; i < 60 && !reduced; i++) {
        const events: { type: string; text?: string }[] = [];
        attack(monster, game.player, monster.atk, events);
        if (events.some((e) => e.type === "message" && e.text === "印の力で衝撃をやわらげた!")) {
          reduced = true;
        }
      }
      if (!reduced) continue;
      expect(reduced).toBe(true);
      return;
    }
    throw new Error("軽減が観測できるseedが見つからなかった");
  });

  it("ホネガラミの印: HPが1残っていれば、致死ダメージを1回だけ耐える(1ラン1回)", () => {
    const game = newGameWithMark(1, "woodShield", "honegarami");
    game.player.hp = 1;
    game.player.maxHp = 999;

    const damageActor = (
      game as unknown as {
        damageActor: (target: Actor, damage: number, critical: boolean, events: unknown[]) => void;
      }
    ).damageActor.bind(game);

    const events1: unknown[] = [];
    damageActor(game.player, 500, false, events1);
    expect(game.player.hp).toBe(1);
    expect(game.status).toBe("playing");
    expect(
      (events1 as { type: string; text?: string }[]).some(
        (e) => e.type === "message" && e.text?.includes("ふんばりこらえた"),
      ),
    ).toBe(true);

    // 1ラン1回だけなので、2回目の致死ダメージは耐えられない
    game.player.hp = 1;
    const events2: unknown[] = [];
    damageActor(game.player, 500, false, events2);
    expect(game.status).toBe("dead");
  });
});
