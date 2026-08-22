import { describe, expect, it } from "vitest";
import type { Actor } from "../src/core/types";
import { COSTUMES } from "../src/entities/costumes";
import { SIDE_STORIES, sideStoryFor } from "../src/entities/sideStories";
import { SPECIES } from "../src/entities/species";
import { Game } from "../src/game";
import { itemDef } from "../src/entities/itemCatalog";
import { addItem } from "../src/domain/item/inventory";
import { initialSave, refreshUnlockedCostumes, talkToNpc } from "../src/save";
import type { SaveData } from "../src/save";

function withBond(save: SaveData, npcId: string, level: number): SaveData {
  return { ...save, bonds: { ...save.bonds, [npcId]: level } };
}

function fullCompendium(): Record<string, "captured"> {
  const compendium: Record<string, "captured"> = {};
  for (const s of SPECIES) {
    if (s.id === "hajimeNoYume") continue;
    compendium[s.id] = "captured";
  }
  return compendium;
}

describe("entities/sideStories.ts: 第2弾(オトネ・おキヨ・ポチ)", () => {
  it("オトネ・おキヨ・ポチが登録されている", () => {
    expect(sideStoryFor("otone")).toBeDefined();
    expect(sideStoryFor("okiyo")).toBeDefined();
    expect(sideStoryFor("pochi")).toBeDefined();
  });

  it("SIDE_STORIESは第1弾・第2弾あわせて5人ぶん", () => {
    expect(SIDE_STORIES).toHaveLength(5);
  });
});

describe("items/catalog.ts: サイドストーリー第2弾の専用道具", () => {
  it("ダンジョンでは拾えない(minFloor: Infinity・weight: 0)", () => {
    for (const id of ["otoneMemoBook", "okiyoSketchMap"]) {
      const def = itemDef(id);
      expect(def.minFloor).toBe(Number.POSITIVE_INFINITY);
      expect(def.weight).toBe(0);
      expect(def.category).toBe("tool");
    }
  });
});

describe("game.ts: 専用道具は既存品と同じ効果を持つ", () => {
  it("オトネの覚え帳は望郷の綱と同じくはぐれた仲間を呼び寄せる", () => {
    const game = new Game({ seed: 1, bringAllies: [] });
    const ally: Actor = {
      id: 7001,
      kind: "ally",
      name: "はぐれ仲間",
      speciesId: "gajiri",
      model: "gajiri",
      pos: { x: 0, y: 0 },
      facing: 4,
      hp: 10,
      maxHp: 10,
      atk: 1,
      def: 0,
      level: 1,
      statuses: [],
      alive: true,
    };
    game.allies.push(ally);
    game.floor.actors.push(ally);
    addItem(game.player.inventory, { uid: 9002, defId: "otoneMemoBook" });
    const events = game.command({ type: "use", uid: 9002 });
    expect(events.some((e) => e.type === "message" && e.text.includes("呼び寄せた"))).toBe(true);
  });
});

describe("save.ts: talkToNpc第2弾(オトネ)", () => {
  it("絆・高だけでは依頼達成数が足りず沈黙する", () => {
    let save = withBond(initialSave(), "otone", 5);
    save = talkToNpc(save, "otone").save;
    save = withBond(save, "otone", 20);
    const { message } = talkToNpc(save, "otone");
    expect(message).toBeUndefined();
  });

  it("絆・高+依頼達成10件で第2段が解放される", () => {
    let save = withBond(initialSave(), "otone", 5);
    save = talkToNpc(save, "otone").save;
    save = {
      ...withBond(save, "otone", 20),
      completedQuestIds: Array.from({ length: 10 }, (_, i) => `quest${i}`),
    };
    const { message } = talkToNpc(save, "otone");
    expect(message).toContain("継がせようとした若いの");
  });

  it("絆・最高+村段階3で第3段が解放され、専用道具を譲り受ける", () => {
    const save = {
      ...withBond(initialSave(), "otone", 30),
      completedQuestIds: Array.from({ length: 10 }, (_, i) => `quest${i}`),
      villageStage: 3 as const,
    };
    const { message, save: next } = talkToNpc(save, "otone");
    expect(message).toContain("樽守りの方が向いてる");
    expect(next.storage.some((i) => i.defId === "otoneMemoBook")).toBe(true);
  });
});

describe("save.ts: talkToNpc第2弾(おキヨ)", () => {
  it("絆・高だけでは図鑑が半分未満だと沈黙する", () => {
    let save = withBond(initialSave(), "okiyo", 5);
    save = talkToNpc(save, "okiyo").save;
    save = withBond(save, "okiyo", 20);
    const { message } = talkToNpc(save, "okiyo");
    expect(message).toBeUndefined();
  });

  it("絆・最高+図鑑コンプリートで第3段が解放され、専用道具を譲り受ける", () => {
    const save = { ...withBond(initialSave(), "okiyo", 30), compendium: fullCompendium() };
    const { message, save: next } = talkToNpc(save, "okiyo");
    expect(message).toContain("どこかに載っているはず");
    expect(next.storage.some((i) => i.defId === "okiyoSketchMap")).toBe(true);
  });
});

describe("save.ts: talkToNpc第2弾(ポチ)", () => {
  it("絆・最高+物語クリアで第4段が解放され、専用衣装を譲り受ける", () => {
    const save = { ...withBond(initialSave(), "pochi", 30), deepest: 48, storyCleared: true, villageStage: 4 as const };
    const { message, save: next } = talkToNpc(save, "pochi");
    expect(message).toContain("見習いになる番だ");
    expect(next.unlockedCostumes).toContain("pochiHandMeDownHappi");
  });

  it("物語クリア前は最終段が解放されない", () => {
    const save = { ...withBond(initialSave(), "pochi", 30), deepest: 48, storyCleared: false, villageStage: 4 as const };
    const { save: next } = talkToNpc(save, "pochi");
    expect(next.unlockedCostumes).not.toContain("pochiHandMeDownHappi");
  });
});

describe("entities/costumes.ts + save.ts: ポチのおさがり半纏", () => {
  it("COSTUMESに登録されている(unlock: npcSideStory)", () => {
    const costume = COSTUMES.find((c) => c.id === "pochiHandMeDownHappi");
    expect(costume).toBeDefined();
    expect(costume?.unlock).toEqual({ kind: "npcSideStory" });
  });

  it("refreshUnlockedCostumesでは自動解放されない(NPCと話す必要がある)", () => {
    const save = { ...initialSave(), compendium: fullCompendium(), villageStage: 4 as const, nightlyDreamBestDepth: 999 };
    const next = refreshUnlockedCostumes(save);
    expect(next.unlockedCostumes).not.toContain("pochiHandMeDownHappi");
  });
});
