import { describe, expect, it } from "vitest";
import { bondStage } from "../src/entities/companionBond";
import { VILLAGE_NPCS, visibleVillageNpcs } from "../src/entities/village";
import { acceptQuest, giftMaterial, initialSave, markVillageEventSeen, raiseBond, recordRun } from "../src/save";

describe("entities/village.ts: 村のNPC一覧", () => {
  it("目覚めたおたま以外は最初から表示される", () => {
    const visible = visibleVillageNpcs(0).map((n) => n.id);
    expect(visible).toEqual(["mogurababa", "gendo", "otone", "okiyo", "pochi"]);
  });

  it("目覚めたおたまは第二章到達(storyChapter>=2)で表示される(plan/story-chapters.md)", () => {
    expect(visibleVillageNpcs(1).some((n) => n.id === "otama")).toBe(false);
    expect(visibleVillageNpcs(2).some((n) => n.id === "otama")).toBe(true);
  });

  it("NPCは全て一意なidを持つ", () => {
    const ids = VILLAGE_NPCS.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("save.ts: raiseBond", () => {
  it("絆レベルが上がる", () => {
    let save = initialSave();
    save = raiseBond(save, "mogurababa");
    expect(save.bonds.mogurababa).toBe(1);
    save = raiseBond(save, "mogurababa", 4);
    expect(save.bonds.mogurababa).toBe(5);
  });

  it("段階(BondStage)は仲間のなじみと同じ関数・閾値を再利用する", () => {
    let save = initialSave();
    save = raiseBond(save, "gendo", 5);
    expect(bondStage(save.bonds.gendo ?? 0)).toBe("familiar");
    save = raiseBond(save, "gendo", 10); // 合計15
    expect(bondStage(save.bonds.gendo ?? 0)).toBe("close");
  });

  it("未知のNPCidは無視される", () => {
    const save = initialSave();
    // @ts-expect-error 未知のidを意図的に渡す
    const next = raiseBond(save, "みしらぬNPC", 1);
    expect(next).toBe(save);
  });
});

describe("save.ts: markVillageEventSeen", () => {
  it("初めてのidは記録される", () => {
    let save = initialSave();
    save = markVillageEventSeen(save, "bond:mogurababa:familiar");
    expect(save.seenVillageEvents).toEqual(["bond:mogurababa:familiar"]);
  });

  it("同じidを重複して積まない", () => {
    let save = initialSave();
    save = markVillageEventSeen(save, "bond:mogurababa:familiar");
    save = markVillageEventSeen(save, "bond:mogurababa:familiar");
    expect(save.seenVillageEvents).toEqual(["bond:mogurababa:familiar"]);
  });
});

describe("save.ts: giftMaterial(素材の献上)", () => {
  it("倉庫の素材を1個消費して絆を+1する", () => {
    let save = initialSave();
    save = { ...save, storage: [...save.storage, { defId: "hokoraDust" }] };
    save = giftMaterial(save, "gendo", "hokoraDust");
    expect(save.bonds.gendo).toBe(1);
    expect(save.storage.filter((i) => i.defId === "hokoraDust")).toHaveLength(0);
  });

  it("持っていない素材は渡せない(何も変わらない)", () => {
    const save = initialSave();
    const next = giftMaterial(save, "gendo", "hokoraDust");
    expect(next).toBe(save);
  });

  it("同じNPCには1日1回までしか渡せない", () => {
    let save = initialSave();
    save = {
      ...save,
      storage: [...save.storage, { defId: "hokoraDust" }, { defId: "hokoraDust" }],
    };
    save = giftMaterial(save, "gendo", "hokoraDust");
    expect(save.bonds.gendo).toBe(1);
    const before = save;
    save = giftMaterial(save, "gendo", "hokoraDust");
    // 同じ日に2回目を渡そうとしても失敗する。素材は消費されず、絆も上がらない
    expect(save).toBe(before);
    expect(save.bonds.gendo).toBe(1);
  });

  it("別のNPCになら同じ日でも渡せる", () => {
    let save = initialSave();
    save = {
      ...save,
      storage: [...save.storage, { defId: "hokoraDust" }, { defId: "hokoraDust" }],
    };
    save = giftMaterial(save, "gendo", "hokoraDust");
    save = giftMaterial(save, "otone", "hokoraDust");
    expect(save.bonds.gendo).toBe(1);
    expect(save.bonds.otone).toBe(1);
  });
});

describe("save.ts: recordRunは依頼達成でオトネの絆を上げる", () => {
  it("依頼を1件達成すると、オトネの絆が+1される", () => {
    let save = initialSave();
    save = acceptQuest(save, "explore5");
    save = recordRun(save, {
      depth: 5,
      level: 3,
      cleared: false,
      broughtBack: [],
      reachedDepths: [5],
    });
    expect(save.completedQuestIds).toContain("explore5");
    expect(save.bonds.otone).toBe(1);
  });

  it("依頼を達成しなかった場合はオトネの絆が上がらない", () => {
    let save = initialSave();
    save = acceptQuest(save, "explore5");
    save = recordRun(save, {
      depth: 3,
      level: 3,
      cleared: false,
      broughtBack: [],
      reachedDepths: [3],
    });
    expect(save.bonds.otone ?? 0).toBe(0);
  });
});
