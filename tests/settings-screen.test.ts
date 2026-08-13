import { describe, expect, it } from "vitest";
import { KEY_REFERENCE, MESSAGE_DELAY_MS, MESSAGE_SPEEDS, messageSpeedScale } from "../src/entities/settings";
import { initialSave, setMessageSpeed } from "../src/save";

describe("entities/settings.ts(plan/settings-screen.md)", () => {
  it("MESSAGE_SPEEDSの全idにMESSAGE_DELAY_MSが定義されている", () => {
    for (const speed of MESSAGE_SPEEDS) {
      expect(typeof MESSAGE_DELAY_MS[speed]).toBe("number");
    }
  });

  it("messageSpeedScaleはnormalを基準の1倍にする", () => {
    expect(messageSpeedScale("normal")).toBe(1);
  });

  it("messageSpeedScaleはslowで間延びさせ、fastで詰める", () => {
    expect(messageSpeedScale("slow")).toBeGreaterThan(1);
    expect(messageSpeedScale("fast")).toBeLessThan(1);
  });

  it("KEY_REFERENCEは空でない", () => {
    expect(KEY_REFERENCE.length).toBeGreaterThan(0);
  });
});

describe("save.ts: messageSpeed(plan/settings-screen.md)", () => {
  it("既定値はnormal", () => {
    expect(initialSave().messageSpeed).toBe("normal");
  });

  it("setMessageSpeedは値を切り替える", () => {
    const save = initialSave();
    const slow = setMessageSpeed(save, "slow");
    expect(slow.messageSpeed).toBe("slow");
    expect(setMessageSpeed(slow, "slow")).toBe(slow); // 変化が無ければ同一参照を返す
  });
});
