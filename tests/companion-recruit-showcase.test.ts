import { describe, expect, it } from "vitest";
import type { GameEvent } from "../src/core/events";
import { splitEventsAtRecruits } from "../src/core/events";

function move(actorId: number): GameEvent {
  return { type: "move", actorId, from: { x: 0, y: 0 }, to: { x: 1, y: 0 } };
}

function recruit(actorId: number, name: string): GameEvent {
  return { type: "recruit", actorId, name };
}

function message(text: string): GameEvent {
  return { type: "message", text };
}

describe("splitEventsAtRecruits", () => {
  it("recruitが無ければ全体を1つの区切りとして返す", () => {
    const events = [move(1), message("たいあたり!")];
    expect(splitEventsAtRecruits(events)).toEqual([events]);
  });

  it("recruitの直後で区切る。区切りの末尾は必ずrecruit", () => {
    const events = [move(1), recruit(2, "ぷるん"), message("ぷるんが仲間になった!")];
    const segments = splitEventsAtRecruits(events);
    expect(segments).toEqual([
      [move(1), recruit(2, "ぷるん")],
      [message("ぷるんが仲間になった!")],
    ]);
  });

  it("recruitが最後のイベントなら、後ろの区切りは生まれない", () => {
    const events = [move(1), recruit(2, "ぷるん")];
    expect(splitEventsAtRecruits(events)).toEqual([[move(1), recruit(2, "ぷるん")]]);
  });

  it("1ターンに複数体が仲間になった場合、recruitごとに区切りを作る(1体ずつ順番に見せるため)", () => {
    const events = [recruit(1, "ぷるん"), recruit(2, "がじり"), message("2体仲間になった!")];
    const segments = splitEventsAtRecruits(events);
    expect(segments).toEqual([[recruit(1, "ぷるん")], [recruit(2, "がじり")], [message("2体仲間になった!")]]);
  });

  it("空配列を渡すと空配列を返す", () => {
    expect(splitEventsAtRecruits([])).toEqual([]);
  });
});
