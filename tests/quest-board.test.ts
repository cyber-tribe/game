import { describe, expect, it } from "vitest";
import { MAX_ACTIVE_QUESTS, QUESTS, questsForDate } from "../src/entities/quests";
import { abandonQuest, acceptQuest, initialSave, loadSave, recordRun, refreshBoard } from "../src/save";
import { withMockedLocalStorage } from "./helpers/localStorage";

describe("entities/quests.ts: 依頼の抽選", () => {
  it("同じ日付キーなら常に同じ並び順になる", () => {
    const a = questsForDate("2026-08-12").map((q) => q.id);
    const b = questsForDate("2026-08-12").map((q) => q.id);
    expect(a).toEqual(b);
    expect(a).toHaveLength(QUESTS.length);
  });

  it("日付キーが違えば、たいてい違う並び順になる", () => {
    const a = questsForDate("2026-08-12").map((q) => q.id);
    const b = questsForDate("2026-01-01").map((q) => q.id);
    expect(a).not.toEqual(b);
  });
});

describe("save.ts: 依頼板(refreshBoard)", () => {
  it("同じ日付では何度呼んでも貼り出し内容が変わらない", () => {
    let save = initialSave();
    save = refreshBoard(save, "2026-08-12");
    const offers = save.boardOffers;
    save = refreshBoard(save, "2026-08-12");
    expect(save.boardOffers).toEqual(offers);
  });

  it("日付が変わると空いている枠だけ新しい依頼で埋まる", () => {
    let save = initialSave();
    save = refreshBoard(save, "2026-08-12");
    expect(save.boardOffers).toHaveLength(MAX_ACTIVE_QUESTS);

    save = acceptQuest(save, save.boardOffers[0]!);
    expect(save.activeQuests).toHaveLength(1);
    expect(save.boardOffers).toHaveLength(MAX_ACTIVE_QUESTS - 1);

    save = refreshBoard(save, "2026-08-13");
    // 受注中の1件を除いた、残り枠ぶんだけが新しい貼り出しになる
    expect(save.boardOffers).toHaveLength(MAX_ACTIVE_QUESTS - 1);
    const acceptedId = save.activeQuests[0]!.defId;
    expect(save.boardOffers).not.toContain(acceptedId);
  });

  it("達成済みの依頼は再び貼り出されない", () => {
    let save = initialSave();
    save = { ...save, completedQuestIds: QUESTS.slice(0, QUESTS.length - MAX_ACTIVE_QUESTS).map((q) => q.id) };
    save = refreshBoard(save, "2026-08-12");
    for (const id of save.completedQuestIds) {
      expect(save.boardOffers).not.toContain(id);
    }
  });
});

describe("save.ts: 依頼の受注/取り下げ", () => {
  it("受注すると、activeQuestsに加わりboardOffersから消える", () => {
    let save = initialSave();
    save = refreshBoard(save, "2026-08-12");
    const target = save.boardOffers[0]!;
    save = acceptQuest(save, target);
    expect(save.activeQuests).toEqual([{ defId: target, progress: 0 }]);
    expect(save.boardOffers).not.toContain(target);
  });

  it("同時受注は最大 MAX_ACTIVE_QUESTS 件まで", () => {
    let save = initialSave();
    save = refreshBoard(save, "2026-08-12");
    for (const id of save.boardOffers.slice(0, MAX_ACTIVE_QUESTS)) {
      save = acceptQuest(save, id);
    }
    expect(save.activeQuests).toHaveLength(MAX_ACTIVE_QUESTS);

    const before = save.activeQuests;
    save = acceptQuest(save, QUESTS.find((q) => !before.some((a) => a.defId === q.id))!.id);
    expect(save.activeQuests).toBe(before);
  });

  it("同じ依頼を二重受注できない", () => {
    let save = initialSave();
    save = refreshBoard(save, "2026-08-12");
    const target = save.boardOffers[0]!;
    save = acceptQuest(save, target);
    const before = save.activeQuests;
    save = acceptQuest(save, target);
    expect(save.activeQuests).toBe(before);
  });

  it("達成済みの依頼は受注できない", () => {
    let save = initialSave();
    save = { ...save, completedQuestIds: [QUESTS[0]!.id] };
    const before = save.activeQuests;
    save = acceptQuest(save, QUESTS[0]!.id);
    expect(save.activeQuests).toBe(before);
  });

  it("存在しない依頼idは受注できない", () => {
    const save = initialSave();
    const next = acceptQuest(save, "存在しない依頼id");
    expect(next).toBe(save);
  });

  it("取り下げるとactiveQuestsから消える(達成扱いにはならない)", () => {
    let save = initialSave();
    save = refreshBoard(save, "2026-08-12");
    const target = save.boardOffers[0]!;
    save = acceptQuest(save, target);
    save = abandonQuest(save, target);
    expect(save.activeQuests).toEqual([]);
    expect(save.completedQuestIds).toEqual([]);
  });

  it("受注していない依頼を取り下げても何も起きない", () => {
    const save = initialSave();
    const next = abandonQuest(save, "huntGajiri");
    expect(next).toBe(save);
  });
});

describe("save.ts: recordRunによる依頼達成判定(resolveQuests)", () => {
  it("討伐依頼(hunt): 目標数を倒すと達成し、金を得て受注から外れる", () => {
    let save = initialSave();
    save = acceptQuest(save, "huntGajiri");
    save = recordRun(save, {
      depth: 1,
      level: 1,
      cleared: true,
      broughtBack: [],
      huntKills: { gajiri: 3 },
    });
    expect(save.completedQuestIds).toContain("huntGajiri");
    expect(save.activeQuests).toEqual([]);
    expect(save.gold).toBe(30);
  });

  it("討伐依頼: 目標数に届かなければ受注したまま残る", () => {
    let save = initialSave();
    save = acceptQuest(save, "huntGajiri");
    save = recordRun(save, {
      depth: 1,
      level: 1,
      cleared: true,
      broughtBack: [],
      huntKills: { gajiri: 2 },
    });
    expect(save.activeQuests).toEqual([{ defId: "huntGajiri", progress: 0 }]);
    expect(save.gold).toBe(0);
  });

  it("採取依頼(gather): 対象アイテムを目標数持ち帰ると達成する", () => {
    let save = initialSave();
    save = acceptQuest(save, "gatherHokoraDust");
    save = recordRun(save, {
      depth: 1,
      level: 1,
      cleared: true,
      broughtBack: [{ defId: "hokoraDust" }, { defId: "hokoraDust" }, { defId: "healLeaf" }] as never,
    });
    expect(save.completedQuestIds).toContain("gatherHokoraDust");
    expect(save.gold).toBe(40);
    // 持ち帰った品はそのまま倉庫にも積まれる(依頼の消費アイテムではない)
    expect(save.storage.filter((s) => s.defId === "hokoraDust")).toHaveLength(2);
  });

  it("探索依頼(explore): 対象の階のめざめの階段に到達すると達成する", () => {
    let save = initialSave();
    save = acceptQuest(save, "explore5");
    save = recordRun(save, {
      depth: 5,
      level: 1,
      cleared: false,
      broughtBack: [],
      reachedDepths: [1, 5],
    });
    expect(save.completedQuestIds).toContain("explore5");
    expect(save.gold).toBe(50);
  });

  it("図鑑依頼(compendium): 新たに見た種族数が目標に届くと達成する", () => {
    let save = initialSave();
    save = acceptQuest(save, "compendium1");
    save = recordRun(save, {
      depth: 1,
      level: 1,
      cleared: true,
      broughtBack: [],
      newlySeenCount: 1,
    });
    expect(save.completedQuestIds).toContain("compendium1");
    expect(save.gold).toBe(20);
  });

  it("全滅すると持ち物が空になり、採取依頼は自然に不達成のままになる", () => {
    let save = initialSave();
    save = acceptQuest(save, "gatherHokoraDust");
    save = recordRun(save, {
      depth: 1,
      level: 1,
      cleared: false,
      broughtBack: [],
    });
    expect(save.activeQuests).toEqual([{ defId: "gatherHokoraDust", progress: 0 }]);
  });

  it("複数の依頼を同時に受注していても、それぞれ独立に判定される", () => {
    let save = initialSave();
    save = acceptQuest(save, "huntGajiri");
    save = acceptQuest(save, "huntPurun");
    save = recordRun(save, {
      depth: 1,
      level: 1,
      cleared: true,
      broughtBack: [],
      huntKills: { gajiri: 3, purun: 1 },
    });
    expect(save.completedQuestIds).toEqual(["huntGajiri"]);
    expect(save.activeQuests).toEqual([{ defId: "huntPurun", progress: 0 }]);
    expect(save.gold).toBe(30);
  });
});

describe("save.ts: 所持金(gold)の永続化", () => {
  it("初期状態は0G", () => {
    expect(initialSave().gold).toBe(0);
  });

  it("踏破時にgoldBroughtBackがgoldへ積み上がる", () => {
    let save = initialSave();
    save = recordRun(save, { depth: 1, level: 1, cleared: true, broughtBack: [], goldBroughtBack: 120 });
    expect(save.gold).toBe(120);
    save = recordRun(save, { depth: 2, level: 1, cleared: true, broughtBack: [], goldBroughtBack: 50 });
    expect(save.gold).toBe(170);
  });

  it("goldBroughtBackを省略しても0として扱う", () => {
    let save = initialSave();
    save = recordRun(save, { depth: 1, level: 1, cleared: true, broughtBack: [] });
    expect(save.gold).toBe(0);
  });
});

describe("save.ts: 壊れたセーブデータの依頼板・所持金", () => {
  it("フィールド自体が無くても初期値で読み込める", () => {
    withMockedLocalStorage(() => {
      localStorage.setItem("garudo-dungeon/v1/slot0", JSON.stringify({}));
      const loaded = loadSave();
      expect(loaded.gold).toBe(0);
      expect(loaded.boardDate).toBe("");
      expect(loaded.boardOffers).toEqual([]);
      expect(loaded.activeQuests).toEqual([]);
      expect(loaded.completedQuestIds).toEqual([]);
    });
  });

  it("goldが負値・不正値でも0以上に丸められる", () => {
    withMockedLocalStorage(() => {
      localStorage.setItem("garudo-dungeon/v1/slot0", JSON.stringify({ gold: -50 }));
      expect(loadSave().gold).toBe(0);
      localStorage.setItem("garudo-dungeon/v1/slot0", JSON.stringify({ gold: "abc" }));
      expect(loadSave().gold).toBe(0);
    });
  });

  it("存在しない依頼idや壊れた形は、貼り出し・受注一覧から取り除かれる", () => {
    withMockedLocalStorage(() => {
      localStorage.setItem(
        "garudo-dungeon/v1/slot0",
        JSON.stringify({
          boardOffers: ["huntGajiri", "存在しないid", 42],
          activeQuests: [{ defId: "huntPurun", progress: 0 }, { defId: "存在しないid" }, "壊れた形"],
          completedQuestIds: ["compendium1", "存在しないid"],
        }),
      );
      const loaded = loadSave();
      expect(loaded.boardOffers).toEqual(["huntGajiri"]);
      expect(loaded.activeQuests).toEqual([{ defId: "huntPurun", progress: 0 }]);
      expect(loaded.completedQuestIds).toEqual(["compendium1"]);
    });
  });
});
