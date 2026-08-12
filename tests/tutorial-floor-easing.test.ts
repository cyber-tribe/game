import { describe, expect, it } from "vitest";
import { speciesForDepth } from "../src/entities/species";

describe("entities/species.ts: 最初の階をぷるんだけにする(plan/tutorial-floor-easing.md)", () => {
  it("1階目はぷるんだけが出現する", () => {
    const floor1 = speciesForDepth(1).map((s) => s.id);
    expect(floor1).toContain("purun");
    expect(floor1).not.toContain("gajiri");
  });

  it("ガジリねずみは2階から出現する", () => {
    expect(speciesForDepth(2).map((s) => s.id)).toContain("gajiri");
  });
});
