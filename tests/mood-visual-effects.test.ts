import { describe, expect, it } from "vitest";
import { DEFAULT_MOOD_ID, MOOD_VISUALS, MOODS } from "../src/entities/moods";

describe("entities/moods.ts: MOOD_VISUALS(plan/mood-visual-effects.md)", () => {
  it("すべての気分にMoodVisualが1つずつ対応する", () => {
    for (const mood of MOODS) {
      expect(MOOD_VISUALS[mood.id]).toBeDefined();
    }
    expect(Object.keys(MOOD_VISUALS)).toHaveLength(MOODS.length);
  });

  it("既定の気分(calmSleep)は、src/view/renderer.tsが元々持っていた固定値と同じ", () => {
    const visual = MOOD_VISUALS[DEFAULT_MOOD_ID];
    expect(visual).toEqual({
      fogColor: 0x070912,
      fogNear: 16,
      fogFar: 34,
      ambientColor: 0x6674a0,
      ambientIntensity: 1.7,
    });
  });

  it("Fog・環境光の値はすべて有限の数値", () => {
    for (const visual of Object.values(MOOD_VISUALS)) {
      expect(Number.isFinite(visual.fogColor)).toBe(true);
      expect(Number.isFinite(visual.fogNear)).toBe(true);
      expect(Number.isFinite(visual.fogFar)).toBe(true);
      expect(visual.fogFar).toBeGreaterThan(visual.fogNear);
      expect(Number.isFinite(visual.ambientColor)).toBe(true);
      expect(visual.ambientIntensity).toBeGreaterThan(0);
    }
  });
});
