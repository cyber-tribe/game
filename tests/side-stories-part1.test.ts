import { describe, expect, it } from "vitest";
import { OTAMA_VISIT_STORY, SIDE_STORIES, sideStoryFor } from "../src/entities/sideStories";
import { itemDef } from "../src/items/catalog";
import { initialSave, talkToNpc } from "../src/save";
import type { SaveData } from "../src/save";

function withBond(save: SaveData, npcId: string, level: number): SaveData {
  return { ...save, bonds: { ...save.bonds, [npcId]: level } };
}

describe("entities/sideStories.ts", () => {
  it("モグラ婆・ゲンドのサイドストーリーが登録されている", () => {
    expect(sideStoryFor("mogurababa")).toBeDefined();
    expect(sideStoryFor("gendo")).toBeDefined();
  });

  it("各段は絆段階の厳しさの昇順で並んでいる", () => {
    const rank = ["none", "familiar", "close", "irreplaceable"];
    for (const story of SIDE_STORIES) {
      for (let i = 1; i < story.stages.length; i++) {
        expect(rank.indexOf(story.stages[i]!.minBondStage)).toBeGreaterThanOrEqual(
          rank.indexOf(story.stages[i - 1]!.minBondStage),
        );
      }
    }
  });
});

describe("items/catalog.ts: サイドストーリー報酬武器", () => {
  it("ダンジョンでは拾えない(minFloor: Infinity・weight: 0)", () => {
    for (const id of ["mogurababaKeepsakeHatchet", "gendoPhantomBillhook"]) {
      const def = itemDef(id);
      expect(def.minFloor).toBe(Number.POSITIVE_INFINITY);
      expect(def.weight).toBe(0);
      expect(def.category).toBe("weapon");
    }
  });
});

describe("save.ts: talkToNpc(plan/side-stories-part1.md)", () => {
  it("絆・中未満では何も起きない", () => {
    const save = initialSave();
    const { save: next, message } = talkToNpc(save, "mogurababa");
    expect(message).toBeUndefined();
    expect(next).toBe(save);
  });

  it("絆・中に達すると第1段の一言が1回だけ流れる", () => {
    const save = withBond(initialSave(), "mogurababa", 5);
    const first = talkToNpc(save, "mogurababa");
    expect(first.message).toContain("モグラ婆");
    expect(first.save.seenVillageEvents).toContain("sideStory:mogurababa:0");

    const second = talkToNpc(first.save, "mogurababa");
    expect(second.message).toBeUndefined();
  });

  it("絆・高だけではdeepest不足なら第1段のまま(第2段の追加条件が未達)", () => {
    let save = withBond(initialSave(), "mogurababa", 5);
    save = talkToNpc(save, "mogurababa").save; // 第1段を消化
    save = withBond(save, "mogurababa", 20); // 絆・高
    const { message } = talkToNpc(save, "mogurababa");
    expect(message).toBeUndefined();
  });

  it("絆・高+deepest>=12で第2段が解放される", () => {
    let save = withBond(initialSave(), "mogurababa", 5);
    save = talkToNpc(save, "mogurababa").save;
    save = { ...withBond(save, "mogurababa", 20), deepest: 12 };
    const { message, save: next } = talkToNpc(save, "mogurababa");
    expect(message).toContain("相棒");
    expect(next.seenVillageEvents).toContain("sideStory:mogurababa:1");
  });

  it("絆・最高+deepest>=18で第3段が解放され、専用武器を譲り受ける", () => {
    let save = { ...withBond(initialSave(), "mogurababa", 30), deepest: 18 };
    const { message, save: next } = talkToNpc(save, "mogurababa");
    expect(message).toContain("形見");
    expect(next.storage.some((i) => i.defId === "mogurababaKeepsakeHatchet")).toBe(true);
  });

  it("ゲンドの第3段は必要な素材が無いと解放されない(第2段のまま)", () => {
    const save = withBond(initialSave(), "gendo", 30);
    const { message, save: next } = talkToNpc(save, "gendo");
    expect(message).toContain("持ってきてくれるか");
    expect(next.seenVillageEvents).toContain("sideStory:gendo:1");
  });

  it("ゲンドの第3段は素材がそろうと解放され、消費して専用武器を譲り受ける", () => {
    const save = {
      ...withBond(initialSave(), "gendo", 30),
      storage: [{ defId: "hokoraDust" }, { defId: "markStoneGajiri" }, { defId: "healLeaf" }],
    };
    const { message, save: next } = talkToNpc(save, "gendo");
    expect(message).toContain("打ってやる");
    expect(next.storage.some((i) => i.defId === "gendoPhantomBillhook")).toBe(true);
    expect(next.storage.some((i) => i.defId === "hokoraDust")).toBe(false);
    expect(next.storage.some((i) => i.defId === "markStoneGajiri")).toBe(false);
    // 無関係の持ち物は消費されない
    expect(next.storage.some((i) => i.defId === "healLeaf")).toBe(true);
  });

});

describe("save.ts: talkToNpc(目覚めたおたま、会うたびに進む)", () => {
  it("会うたびに1段ずつ、絆と無関係に一言が流れる", () => {
    const save = initialSave();
    const first = talkToNpc(save, "otama");
    expect(first.message).toBe(OTAMA_VISIT_STORY[0]!.text);

    const second = talkToNpc(first.save, "otama");
    expect(second.message).toBe(OTAMA_VISIT_STORY[1]!.text);

    const third = talkToNpc(second.save, "otama");
    expect(third.message).toBe(OTAMA_VISIT_STORY[2]!.text);
  });

  it("第4段は storyChapter===3(deepest 30〜41)の間だけ解放される", () => {
    let save = initialSave();
    for (let i = 0; i < 3; i++) save = talkToNpc(save, "otama").save;

    const tooEarly = talkToNpc({ ...save, deepest: 18 }, "otama");
    expect(tooEarly.message).toBeUndefined();

    const inChapter3 = talkToNpc({ ...save, deepest: 30 }, "otama");
    expect(inChapter3.message).toBe(OTAMA_VISIT_STORY[3]!.text);
  });

  it("4段すべて消化すると、以後は沈黙する", () => {
    let save = initialSave();
    for (let i = 0; i < 3; i++) save = talkToNpc(save, "otama").save;
    save = talkToNpc({ ...save, deepest: 30 }, "otama").save;
    const { message } = talkToNpc({ ...save, deepest: 30 }, "otama");
    expect(message).toBeUndefined();
  });
});
