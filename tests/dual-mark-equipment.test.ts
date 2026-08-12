import { describe, expect, it } from "vitest";
import { Game } from "../src/game";
import { MAX_MARK_SLOTS, MAX_PLUS, OVERLAY_STONE_DEF_ID } from "../src/entities/forging";
import { addItem, createInventory, equip, weaponMarkIds } from "../src/items/inventory";
import { isFree, type Actor } from "../src/core/types";
import { checkAchievements, checkEquipmentCompendium, initialSave, toStored, type SaveData } from "../src/save";
import { itemDef } from "../src/items/catalog";

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
    hp: 10_000_000,
    maxHp: 10_000_000,
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

describe("2つ目の刻印(plan/dual-mark-equipment.md)", () => {
  it("MAX_MARK_SLOTSは2", () => {
    expect(MAX_MARK_SLOTS).toBe(2);
  });

  it("2つの印を持つ武器は、両方の効果が単純に併存する(会心+タルダメージ)", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const game = new Game({ seed });
      const inv = game.player.inventory;
      addItem(inv, { uid: 9999, defId: "hatchet", markIds: ["gajiri", "tsubute"] });
      equip(inv, 9999);
      expect(weaponMarkIds(inv)).toEqual(["gajiri", "tsubute"]);

      game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
      const setup = faceOpenDirection(game);
      if (!setup) continue;
      const monster = putMonster(game, setup.front);
      const events = game.command({ type: "move", dir: setup.dir });
      const damage = events.find(
        (e): e is Extract<(typeof events)[number], { type: "damage" }> =>
          e.type === "damage" && e.actorId === monster.id,
      );
      if (!damage) continue;
      // ガジリねずみの印: そのランの最初の1手は必ず会心
      expect(damage.critical, `seed=${seed}`).toBe(true);

      // ツブテガエルの印: タルを投げたときのダメージ+2は barrelThrowDamage()側で
      // 検証済み(equipment-forging.test.ts)。ここでは両方の印が同時に
      // 保持され続けることだけを確認する
      expect(weaponMarkIds(game.player.inventory)).toEqual(["gajiri", "tsubute"]);
      return;
    }
    throw new Error("開けた方向が見つからなかった");
  });

  it("同じ印を2枠とも持つことも型としては禁止しない(UI側で初期案として禁止するだけ)", () => {
    const inv = createInventory();
    addItem(inv, { uid: 1, defId: "hatchet", markIds: ["gajiri", "gajiri"] });
    equip(inv, 1);
    expect(weaponMarkIds(inv)).toEqual(["gajiri", "gajiri"]);
  });

  it("装備図鑑: 2つ目の印を持っていても、+9であればmasteredのまま(印1つの場合と同じ扱い)", () => {
    const save: SaveData = {
      ...initialSave(),
      storage: [{ defId: "hatchet", plus: MAX_PLUS, markIds: ["gajiri", "tsubute"] }],
    };
    const next = checkEquipmentCompendium(save);
    expect(next.equipmentCompendium["hatchet"]).toBe("mastered");
    expect(next.markCompendium["gajiri"]).toBe("owned");
    expect(next.markCompendium["tsubute"]).toBe("owned");
  });

  it("実績: 2つ目の印だけに含まれる印でも、allMarksForgedの判定に数えられる", () => {
    const save: SaveData = {
      ...initialSave(),
      storage: [{ defId: "hatchet", markIds: ["purun", "gajiri"] }],
    };
    const withOne = checkAchievements(save);
    expect(withOne.achievements["allMarksForged"]).toBeUndefined();

    const withAll: SaveData = {
      ...initialSave(),
      storage: [
        { defId: "hatchet", markIds: ["purun", "gajiri"] },
        { defId: "hatchet", markIds: ["tsubute", "madoromi"] },
        { defId: "hatchet", markIds: ["honegarami"] },
      ],
    };
    const result = checkAchievements(withAll);
    expect(result.achievements["allMarksForged"]).toBeDefined();
  });

  it("toStored: 2つの印を持つアイテムはmarkIdsを2件とも保つ", () => {
    const stored = toStored({ uid: 1, defId: "hatchet", markIds: ["gajiri", "tsubute"] });
    expect(stored).toEqual({ defId: "hatchet", markIds: ["gajiri", "tsubute"] });
  });

  it("重ね刻みの砥石は、ダンジョンの出現テーブルに乗らない(minFloor: Infinity・weight: 0)", () => {
    const def = itemDef(OVERLAY_STONE_DEF_ID);
    expect(def.minFloor).toBe(Number.POSITIVE_INFINITY);
    expect(def.weight).toBe(0);
    expect(def.category).toBe("material");
  });
});
