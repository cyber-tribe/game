import { describe, expect, it } from "vitest";
import { STORY_CHAPTER_MESSAGES, storyChapter, storyChapterEventId } from "../src/entities/story";
import { visibleVillageNpcs } from "../src/entities/village";

describe("entities/story.ts: storyChapter", () => {
  it("storyClearedがtrueなら常に終章(5)", () => {
    expect(storyChapter(0, true)).toBe(5);
    expect(storyChapter(8, true)).toBe(5);
  });

  it("撃破済み地方ボス数の閾値どおりに章が進む", () => {
    expect(storyChapter(0, false)).toBe(0);
    expect(storyChapter(0, false)).toBe(0);
    expect(storyChapter(1, false)).toBe(1);
    expect(storyChapter(2, false)).toBe(1);
    expect(storyChapter(3, false)).toBe(2);
    expect(storyChapter(4, false)).toBe(2);
    expect(storyChapter(5, false)).toBe(3);
    expect(storyChapter(6, false)).toBe(3);
    expect(storyChapter(7, false)).toBe(4);
    expect(storyChapter(8, false)).toBe(4);
  });

  it("章は単調増加する(地方ボスを倒すほど章が戻ることはない)", () => {
    let previous = storyChapter(0, false);
    for (let count = 1; count <= 8; count++) {
      const current = storyChapter(count, false);
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
    expect(visibleVillageNpcs(storyChapter(2, false)).some((n) => n.id === "otama")).toBe(false);
  });

  it("第二章に入った瞬間から出現する", () => {
    expect(visibleVillageNpcs(storyChapter(3, false)).some((n) => n.id === "otama")).toBe(true);
  });

  it("storyClearedで終章になっても出現し続ける", () => {
    expect(visibleVillageNpcs(storyChapter(0, true)).some((n) => n.id === "otama")).toBe(true);
  });
});
