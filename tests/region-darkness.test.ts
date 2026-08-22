import { describe, expect, it } from "vitest";
import { Rng } from "../src/core/rng";
import { pickFloorGimmick } from "../src/domain/dungeon/gimmicks";
import { Game } from "../src/game";
import { itemDef } from "../src/entities/itemCatalog";

describe("dungeon/gimmicks.ts: 暗さを地方の個性にする(plan/region-darkness.md)", () => {
  it("地方ダンジョンの第一〜第三地方では、くらやみの階が一切選ばれない", () => {
    for (const regionIndex of [1, 2, 3]) {
      for (let seed = 1; seed <= 300; seed++) {
        const rng = new Rng(seed);
        for (let depth = 2; depth <= 6; depth++) {
          expect(pickFloorGimmick(rng, depth, undefined, 1, regionIndex)).not.toBe("darkness");
        }
      }
    }
  });

  it("地方の概念を持たないダンジョンでは、低い階でもくらやみの階が選ばれうる(従来どおり)", () => {
    let sawDarkness = false;
    for (let seed = 1; seed <= 500 && !sawDarkness; seed++) {
      const rng = new Rng(seed);
      if (pickFloorGimmick(rng, 5, undefined, 1, undefined) === "darkness") sawDarkness = true;
    }
    expect(sawDarkness).toBe(true);
  });

  it("地方ダンジョンの第四地方以降では、くらやみの階が選ばれうる", () => {
    let sawDarkness = false;
    for (let seed = 1; seed <= 500 && !sawDarkness; seed++) {
      const rng = new Rng(seed);
      if (pickFloorGimmick(rng, 5, undefined, 1, 4) === "darkness") sawDarkness = true;
    }
    expect(sawDarkness).toBe(true);
  });

  it("地方ダンジョンの第四地方以降は、くらやみの階の出現重みが地方の概念を持たないダンジョンより高い", () => {
    let regionDark = 0;
    let regionTotal = 0;
    let otherDark = 0;
    let otherTotal = 0;
    const trials = 3000;
    for (let i = 0; i < trials; i++) {
      const gRegion = pickFloorGimmick(new Rng(i + 1), 5, undefined, 1, 4);
      if (gRegion !== undefined) {
        regionTotal++;
        if (gRegion === "darkness") regionDark++;
      }
      const gOther = pickFloorGimmick(new Rng(i + 1), 5, undefined, 1, undefined);
      if (gOther !== undefined) {
        otherTotal++;
        if (gOther === "darkness") otherDark++;
      }
    }
    expect(regionDark / regionTotal).toBeGreaterThan(otherDark / otherTotal);
  });

  it("直前の階と同じギミック(くらやみ含む)は連続で選ばれない", () => {
    const rng = new Rng(11);
    let previous: ReturnType<typeof pickFloorGimmick>;
    for (let depth = 2; depth <= 2000; depth++) {
      const gimmick = pickFloorGimmick(rng, depth, previous, 1, 4);
      if (gimmick !== undefined && previous !== undefined) {
        expect(gimmick).not.toBe(previous);
      }
      previous = gimmick;
    }
  });
});

describe("items/catalog.ts: 松明(plan/region-darkness.md)", () => {
  it("道具カテゴリとして定義されている", () => {
    expect(itemDef("torch").category).toBe("tool");
  });
});

describe("game.ts: 松明の効果(plan/region-darkness.md)", () => {
  it("使うと、くらやみの階でも見えるタイル数が増える", () => {
    const game = new Game({ seed: 9 });
    game.floor.gimmick = "darkness";
    game.command({ type: "wait" });
    const baseline = game.floor.tiles.filter((t) => t.visible).length;

    const torch = game.giveItem("torch")!;
    game.command({ type: "use", uid: torch.uid });
    const withTorch = game.floor.tiles.filter((t) => t.visible).length;

    expect(withTorch).toBeGreaterThan(baseline);
  });

  it("使うと持ち物から消える", () => {
    const game = new Game({ seed: 9 });
    const torch = game.giveItem("torch")!;
    game.command({ type: "use", uid: torch.uid });
    expect(game.player.inventory.items.find((i) => i.uid === torch.uid)).toBeUndefined();
  });

  it("20ターン経つと効果が切れ、専用メッセージが流れる", () => {
    const game = new Game({ seed: 9 });
    const torch = game.giveItem("torch")!;
    game.command({ type: "use", uid: torch.uid }); // 使った瞬間に1ターン経過ぶん消費される(残り19)
    let lastEvents: ReturnType<typeof game.command> = [];
    for (let i = 0; i < 19; i++) {
      lastEvents = game.command({ type: "wait" });
    }
    expect(lastEvents.some((e) => e.type === "message" && e.text === "松明の火が消えた。")).toBe(true);
  });

  it("効果が切れる前に使い直すと、残りターンが更新される(延長)", () => {
    const game = new Game({ seed: 9 });
    const torch1 = game.giveItem("torch")!;
    game.command({ type: "use", uid: torch1.uid }); // 残り19
    for (let i = 0; i < 15; i++) game.command({ type: "wait" }); // 残り4

    const torch2 = game.giveItem("torch")!;
    game.command({ type: "use", uid: torch2.uid }); // 残り19に戻る

    for (let i = 0; i < 15; i++) {
      const events = game.command({ type: "wait" });
      expect(events.some((e) => e.type === "message" && e.text === "松明の火が消えた。")).toBe(false);
    }
  });

  it("くらやみの階でなくても使える(視界拡張の効果は変わらず得られる)", () => {
    const game = new Game({ seed: 9 });
    game.command({ type: "wait" });
    const baseline = game.floor.tiles.filter((t) => t.visible).length;

    const torch = game.giveItem("torch")!;
    const events = game.command({ type: "use", uid: torch.uid });
    expect(events.some((e) => e.type === "message" && e.text.includes("松明"))).toBe(true);
    const withTorch = game.floor.tiles.filter((t) => t.visible).length;
    expect(withTorch).toBeGreaterThanOrEqual(baseline);
  });
});
