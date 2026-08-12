import { describe, expect, it } from "vitest";
import { fingerprint, normalizeMessage, topStackFrame } from "../tools/fingerprint.mjs";

describe("tools/fingerprint.mjs: normalizeMessage", () => {
  it("UUIDを<UUID>に置き換える", () => {
    expect(normalizeMessage("actor 3f8a1c2e-1234-5678-9abc-def012345678 not found")).toBe(
      "actor <UUID> not found",
    );
  });

  it("16進数を<HEX>に置き換える", () => {
    expect(normalizeMessage("pointer 0xDEADBEEF invalid")).toBe("pointer <HEX> invalid");
  });

  it("素朴な数値(整数・小数)を<N>に置き換える", () => {
    expect(normalizeMessage("depth 12, hp 45.5")).toBe("depth <N>, hp <N>");
  });

  it("UUID・16進数の中の数字がバラバラに壊れない(先にUUID/HEXを潰してから数値を潰す順序)", () => {
    const msg = "id 3f8a1c2e-1234-5678-9abc-def012345678 at 0x1a2b, count 3";
    expect(normalizeMessage(msg)).toBe("id <UUID> at <HEX>, count <N>");
  });
});

describe("tools/fingerprint.mjs: topStackFrame", () => {
  it("関数名@ファイル名の形にし、行番号は含めない", () => {
    const stack = "TypeError: x is not a function\n    at damageActor (src/game.ts:1234:10)\n    at Game.command (src/game.ts:500:5)";
    expect(topStackFrame(stack)).toBe("damageActor@src/game.ts");
  });

  it("行番号だけが違うスタックは同じ結果になる", () => {
    const a = "Error\n    at foo (src/a.ts:10:1)";
    const b = "Error\n    at foo (src/a.ts:99:1)";
    expect(topStackFrame(a)).toBe(topStackFrame(b));
  });

  it("スタックが無ければ空文字", () => {
    expect(topStackFrame(undefined)).toBe("");
    expect(topStackFrame("")).toBe("");
  });
});

describe("tools/fingerprint.mjs: fingerprint", () => {
  it("同じ入力からは同じフィンガープリントになる", async () => {
    const a = await fingerprint({ screen: "dungeon", message: "actor 42 not found", topFrame: "foo@bar.ts" });
    const b = await fingerprint({ screen: "dungeon", message: "actor 999 not found", topFrame: "foo@bar.ts" });
    expect(a).toBe(b); // 数値部分は正規化されて同じフィンガープリントになる
  });

  it("発生場所が違えば別のフィンガープリントになる", async () => {
    const a = await fingerprint({ screen: "town", message: "boom", topFrame: "foo@bar.ts" });
    const b = await fingerprint({ screen: "dungeon", message: "boom", topFrame: "foo@bar.ts" });
    expect(a).not.toBe(b);
  });

  it("64桁の16進文字列(SHA-256)になる", async () => {
    const fp = await fingerprint({ screen: "town", message: "boom" });
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });
});
