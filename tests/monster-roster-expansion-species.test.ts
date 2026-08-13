import { describe, expect, it } from "vitest";
import { Rng } from "../src/core/rng";
import { Game } from "../src/game";
import { createMonster } from "../src/dungeon/populate";
import { decideMonsterAction, effectiveRangedRange } from "../src/entities/ai";
import { NATIVE_SKILL_BY_SPECIES } from "../src/entities/skills";
import { REGIONS } from "../src/entities/regions";
import { SPECIES, speciesById, speciesForDepth } from "../src/entities/species";
import { STATUS_SLEEP, type Actor, type FloorState, type Tile } from "../src/core/types";

const NEW_SPECIES_IDS = [
  "akubitokage",
  "mabutamushi",
  "kirimizuchi",
  "nukarumigani",
  "ashiatodori",
  "wasuremizuchi",
  "kinokootoko",
  "houshitobi",
  "madoromigumo",
  "nebosukegaeru",
  "honedatami",
  "wasurebone",
  "katakunagani",
  "honezukanotsukai",
  "nadakaze",
  "shioresakura",
  "mizukagami",
  "nakimushi",
  "kodamagumo",
  "yamabikooni",
  "kaerukodama",
  "nedayamabiko",
  "kageboushi",
  "wataamenoobake",
  "yaguramori",
  "chouchinokuri",
  "subetenopurun",
  "mazarinezumi",
  "yoseatsume",
  "mouhitotsunokage",
];

// akubitokage は plan/archive/model-akubitokage.md で専用モデルを新規に作った
// (このロースター拡張が前提としていた「新規3Dモデルは作らず既存5種を流用する」
// の唯一の例外)。それ以外は今なお既存5種の流用のまま。
const KNOWN_MODEL_IDS = new Set(["purun", "gajiri", "tsubute", "madoromi", "honegarami", "akubitokage"]);

function makeOpenFloor(): FloorState {
  const width = 9;
  const height = 9;
  const tiles: Tile[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inRoom = x >= 1 && x < width - 1 && y >= 1 && y < height - 1;
      const tile: Tile = { kind: inRoom ? 1 : 0, roomId: inRoom ? 0 : -1, explored: true, visible: true };
      tiles.push(tile);
    }
  }
  const floor: FloorState = {
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
  return floor;
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

describe("entities/species.ts: 60種化・追加種族(plan/monster-roster-expansion-species.md)", () => {
  it("SPECIES配列がちょうど30件増えている(本文書実装前の基準38件→68件)", () => {
    expect(SPECIES.length).toBe(38 + 30);
  });

  it("新規30種すべてがSPECIESに存在する", () => {
    for (const id of NEW_SPECIES_IDS) {
      expect(SPECIES.some((s) => s.id === id)).toBe(true);
    }
    expect(NEW_SPECIES_IDS.length).toBe(30);
  });

  it("idが1件も重複していない", () => {
    const ids = SPECIES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("30種すべてが既存のpublic/models/*.glbを参照している", () => {
    for (const id of NEW_SPECIES_IDS) {
      expect(KNOWN_MODEL_IDS.has(speciesById(id).model)).toBe(true);
    }
  });

  it("30種すべてがspeciesForDepth経由で正しい階層から出現しうる", () => {
    for (const id of NEW_SPECIES_IDS) {
      const species = speciesById(id);
      expect(speciesForDepth(species.minFloor).some((s) => s.id === id)).toBe(true);
      expect(speciesForDepth(species.minFloor - 1).some((s) => s.id === id)).toBe(false);
    }
  });

  it("各新種のminFloor/maxFloorが、意図した地方(design/regions.md)の階範囲に収まる", () => {
    const regionOf: Record<string, number> = {
      akubitokage: 1,
      mabutamushi: 1,
      kirimizuchi: 2,
      nukarumigani: 2,
      ashiatodori: 2,
      wasuremizuchi: 2,
      kinokootoko: 3,
      houshitobi: 3,
      madoromigumo: 3,
      nebosukegaeru: 3,
      honedatami: 4,
      wasurebone: 4,
      katakunagani: 4,
      honezukanotsukai: 4,
      nadakaze: 5,
      shioresakura: 5,
      mizukagami: 5,
      nakimushi: 5,
      kodamagumo: 6,
      yamabikooni: 6,
      kaerukodama: 6,
      nedayamabiko: 6,
      kageboushi: 7,
      wataamenoobake: 7,
      yaguramori: 7,
      chouchinokuri: 7,
      subetenopurun: 8,
      mazarinezumi: 8,
      yoseatsume: 8,
      mouhitotsunokage: 8,
    };
    for (const [id, regionIndex] of Object.entries(regionOf)) {
      const region = REGIONS.find((r) => r.index === regionIndex);
      expect(region).toBeDefined();
      const species = speciesById(id);
      const [start, end] = region!.floors;
      expect(species.minFloor).toBeGreaterThanOrEqual(start);
      expect(species.minFloor).toBeLessThanOrEqual(end);
      if (species.maxFloor !== undefined) {
        expect(species.maxFloor).toBeGreaterThanOrEqual(species.minFloor);
        expect(species.maxFloor).toBeLessThanOrEqual(end);
      }
    }
  });

  it("第一地方の2種(あくびとかげ・まぶたむし)は1階目には出現しない(plan/archive/tutorial-floor-easing.md)", () => {
    expect(speciesForDepth(1).some((s) => s.id === "akubitokage")).toBe(false);
    expect(speciesForDepth(1).some((s) => s.id === "mabutamushi")).toBe(false);
  });

  it("swarm系4種(まぶたむし・あしあとどり・なきむし・こだまぐも・ちょうちんおくり・よせあつめ)はswarmSizeを持つ", () => {
    for (const id of [
      "mabutamushi",
      "ashiatodori",
      "nakimushi",
      "kodamagumo",
      "chouchinokuri",
      "yoseatsume",
    ]) {
      const s = speciesById(id);
      expect(s.ai).toBe("swarm");
      expect(s.swarmSize).toBeDefined();
    }
  });

  it("まどろみぐもはモヤウツボと同系統のambushStrikeを持つ(NATIVE_SKILL_BY_SPECIES)", () => {
    expect(NATIVE_SKILL_BY_SPECIES["madoromigumo"]).toBe("ambushStrike");
    expect(NATIVE_SKILL_BY_SPECIES["moyautsubo"]).toBe("ambushStrike");
  });

  it("ほうしとび・かげぼうしは攻撃にinflictsで状態異常を付与する", () => {
    expect(speciesById("houshitobi").inflicts?.kind).toBe("sleep");
    expect(speciesById("kageboushi").inflicts?.kind).toBe("sleep");
  });

  it("ホネヅカのつかいはオイテケボシと同じdrainsSatietyを持ち、射程はより短い", () => {
    const tsukai = speciesById("honezukanotsukai");
    const oitekeboshi = speciesById("oitekeboshi");
    expect(tsukai.drainsSatiety).toBe(true);
    expect(tsukai.range).toBeLessThan(oitekeboshi.range!);
  });

  it("みずかがみ・もうひとつのかげはmimic AIで、タルではなくアイテムに擬態する(mimicAs)", () => {
    expect(speciesById("mizukagami").ai).toBe("mimic");
    expect(speciesById("mizukagami").mimicAs).toBe("item");
    expect(speciesById("mouhitotsunokage").ai).toBe("mimic");
    expect(speciesById("mouhitotsunokage").mimicAs).toBe("item");
  });
});

describe("entities/ai.ts: effectiveRangedRange(きりみずち・なだかぜの地形連動射程)", () => {
  it("きりみずちは深みタイルの上にいると射程が伸びる", () => {
    const floor = makeOpenFloor();
    const monster = createMonster(2, speciesById("kirimizuchi"), { x: 4, y: 4 });
    const baseRange = monster.rangedRange!;
    expect(effectiveRangedRange(floor, monster)).toBe(baseRange);

    floor.tiles[4 * floor.width + 4]!.quagmire = true;
    expect(effectiveRangedRange(floor, monster)).toBeGreaterThan(baseRange);
  });

  it("なだかぜは奔流タイルの近く(自分のマスまたは隣接マス)にいると射程が伸びる", () => {
    const floor = makeOpenFloor();
    const monster = createMonster(2, speciesById("nadakaze"), { x: 4, y: 4 });
    const baseRange = monster.rangedRange!;
    expect(effectiveRangedRange(floor, monster)).toBe(baseRange);

    // 隣接マス(斜め)に奔流タイルを置く
    floor.tiles[3 * floor.width + 3]!.torrent = 6;
    expect(effectiveRangedRange(floor, monster)).toBeGreaterThan(baseRange);
  });

  it("きりみずちは深みタイルの上にいると、素の射程では届かない距離からも遠隔攻撃を選ぶ", () => {
    const floor = makeOpenFloor();
    const species = speciesById("kirimizuchi");
    const monster = createMonster(2, species, { x: 2, y: 4 });
    monster.aware = true;
    floor.tiles[4 * floor.width + 2]!.quagmire = true;
    // プレイヤーを素の射程より1マス遠くに置く
    const player = makePlayer({ x: 2 + species.range! + 1, y: 4 });
    floor.actors.push(monster, player);
    const action = decideMonsterAction(
      new Rng(1),
      floor,
      monster,
      player,
      new Int32Array(floor.width * floor.height).fill(-1),
    );
    expect(action.type).toBe("ranged");
  });
});

describe("game.ts: きのこおとこ(atkMulInSporedRoom)", () => {
  it("胞子部屋(Room.spored)にいる間、攻撃力に倍率が乗る", () => {
    const game = new Game({ seed: 1 });
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const kinoko = createMonster(9001, speciesById("kinokootoko"), {
      x: game.player.pos.x + 1,
      y: game.player.pos.y,
    });
    game.floor.actors.push(kinoko);
    const attack = (
      game as unknown as {
        attack: (attacker: Actor, target: Actor, attackPower: number, events: unknown[]) => void;
      }
    ).attack.bind(game);

    const target = (): Actor => ({ ...makePlayer(), id: 99, kind: "monster", def: 0, hp: 1_000_000, maxHp: 1_000_000 });

    const room = game.floor.rooms.find((r) => {
      const idx = r.y * game.floor.width + r.x;
      return game.floor.tiles[idx] !== undefined;
    });
    expect(room).toBeDefined();
    // roomOf(floor, kinoko.pos)がroomを解決できるよう、同じ部屋に配置し直す
    kinoko.pos = { x: room!.x, y: room!.y };
    game.player.pos = { x: room!.x + (room!.w > 1 ? 1 : 0), y: room!.y };

    room!.spored = false;
    const t1 = target();
    const e1: { type: string; amount?: number }[] = [];
    attack(kinoko, t1, kinoko.atk, e1);
    const dmgWithout = e1.find((e) => e.type === "damage")?.amount ?? 0;

    room!.spored = true;
    const t2 = target();
    const e2: { type: string; amount?: number }[] = [];
    attack(kinoko, t2, kinoko.atk, e2);
    const dmgWith = e2.find((e) => e.type === "damage")?.amount ?? 0;

    expect(dmgWith).toBeGreaterThan(dmgWithout);
  });
});

describe("entities/ai.ts: ねぼすけがえる・かえるこだま(counterDamageRatioの再利用)", () => {
  it("両種ともcounterDamageRatioを持つ(ヨロイオイテケと同じ仕組みの流用)", () => {
    expect(speciesById("nebosukegaeru").counterDamageRatio).toBeGreaterThan(0);
    expect(speciesById("kaerukodama").counterDamageRatio).toBeGreaterThan(0);
  });
});

describe("entities/ai.ts: かたくなガニ(thief AIの流用)", () => {
  it("盗んだ後は戦わず逃げるだけになる(スリガラスと同じ挙動)", () => {
    const floor = makeOpenFloor();
    const monster = createMonster(2, speciesById("katakunagani"), { x: 4, y: 5 });
    monster.stolenGold = 10;
    const player = makePlayer({ x: 4, y: 4 });
    floor.actors.push(monster, player);
    const action = decideMonsterAction(
      new Rng(1),
      floor,
      monster,
      player,
      new Int32Array(floor.width * floor.height).fill(-1),
    );
    expect(action.type).toBe("move");
  });
});

describe("entities/ai.ts: すべてのぷるん(眠り付与+瀕死atkバフの薄い併せ持ち)", () => {
  it("inflicts(sleep)とlowHpAtkBonusMaxの両方を持つ", () => {
    const s = speciesById("subetenopurun");
    expect(s.inflicts?.kind).toBe(STATUS_SLEEP);
    expect(s.lowHpAtkBonusMax).toBeGreaterThan(0);
  });
});

