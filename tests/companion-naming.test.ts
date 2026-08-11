import { describe, expect, it } from "vitest";
import type { Actor } from "../src/core/types";
import { MAX_NICKNAME_LENGTH, displayActorName, sanitizeNickname } from "../src/entities/naming";

function actor(overrides: Partial<Actor> = {}): Actor {
  return {
    id: 1,
    kind: "ally",
    name: "ぷるん",
    model: "purun",
    pos: { x: 0, y: 0 },
    facing: 4,
    hp: 10,
    maxHp: 10,
    atk: 1,
    def: 1,
    level: 1,
    statuses: [],
    alive: true,
    ...overrides,
  };
}

describe("displayActorName", () => {
  it("名前が無ければ種族名をそのまま表示する", () => {
    expect(displayActorName(actor())).toBe("ぷるん");
  });

  it("名前があれば「タロ(ぷるん)」の形にする", () => {
    expect(displayActorName(actor({ nickname: "タロ" }))).toBe("タロ(ぷるん)");
  });
});

describe("sanitizeNickname", () => {
  it("前後の空白を落とす", () => {
    expect(sanitizeNickname("  タロ  ")).toBe("タロ");
  });

  it("空欄はundefined(名付けない)になる", () => {
    expect(sanitizeNickname("")).toBeUndefined();
    expect(sanitizeNickname("   ")).toBeUndefined();
  });

  it(`${MAX_NICKNAME_LENGTH}文字を超える分は切り捨てる`, () => {
    const long = "あ".repeat(MAX_NICKNAME_LENGTH + 5);
    expect(sanitizeNickname(long)).toBe("あ".repeat(MAX_NICKNAME_LENGTH));
  });
});
