import { describe, expect, it } from "vitest";
import { STORY_CHAPTER_MESSAGES, storyChapter, storyChapterEventId } from "../src/entities/story";
import { visibleVillageNpcs } from "../src/entities/village";

describe("entities/story.ts: storyChapter", () => {
  it("storyClearedがtrueなら常に終章(5)", () => {
    expect(storyChapter(0, true)).toBe(5);
    expect(storyChapter(48, true)).toBe(5);
  });

  it("deepestの閾値どおりに章が進む", () => {
    expect(storyChapter(0, false)).toBe(0);
    expect(storyChapter(5, false)).toBe(0);
    expect(storyChapter(6, false)).toBe(1);
    expect(storyChapter(17, false)).toBe(1);
    expect(storyChapter(18, false)).toBe(2);
    expect(storyChapter(29, false)).toBe(2);
    expect(storyChapter(30, false)).toBe(3);
    expect(storyChapter(41, false)).toBe(3);
    expect(storyChapter(42, false)).toBe(4);
    expect(storyChapter(47, false)).toBe(4);
    expect(storyChapter(48, false)).toBe(4);
  });

  it("章は単調増加する(深く潜るほど章が戻ることはない)", () => {
    let previous = storyChapter(0, false);
    for (let deepest = 1; deepest <= 48; deepest++) {
      const current = storyChapter(deepest, false);
      expect(current).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
  });

  it("序章以外の各章に導入メッセージが用意されている", () => {
    for (const chapter of [1, 2, 3, 4, 5] as const) {
      expect(STORY_CHAPTER_MESSAGES[chapter].length).toBeGreaterThan(0);
    }
  });

  it("storyChapterEventIdは章ごとに一意なidを返す", () => {
    const ids = [0, 1, 2, 3, 4, 5].map((c) => storyChapterEventId(c as 0 | 1 | 2 | 3 | 4 | 5));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("entities/village.ts: 章立てと目覚めたおたまの出現条件の接続", () => {
  it("第一章まではまだ出現しない", () => {
    expect(visibleVillageNpcs(storyChapter(17, false)).some((n) => n.id === "otama")).toBe(false);
  });

  it("第二章に入った瞬間から出現する", () => {
    expect(visibleVillageNpcs(storyChapter(18, false)).some((n) => n.id === "otama")).toBe(true);
  });

  it("storyClearedで終章になっても出現し続ける", () => {
    expect(visibleVillageNpcs(storyChapter(0, true)).some((n) => n.id === "otama")).toBe(true);
  });
});
