import { describe, expect, it } from "vitest";
import {
  BANNER_LINE_COUNT,
  bannerLinesFor,
  fadeBanner,
  showBanner,
  type BannerState,
} from "../src/entities/messageBanner";

describe("entities/messageBanner.ts(plan/game/mobile-layout-redesign.md)", () => {
  it("bannerLinesForは直近count件だけを古い→新しい順で返す", () => {
    const history = ["a", "b", "c", "d", "e"];
    expect(bannerLinesFor(history, 3)).toEqual(["c", "d", "e"]);
  });

  it("bannerLinesForは履歴がcount未満なら全件返す", () => {
    expect(bannerLinesFor(["a"], 3)).toEqual(["a"]);
  });

  it("bannerLinesForは既定でBANNER_LINE_COUNT件を使う", () => {
    const history = Array.from({ length: 10 }, (_, i) => String(i));
    expect(bannerLinesFor(history)).toHaveLength(BANNER_LINE_COUNT);
  });

  it("showBannerは直近行を持ちfaded:falseの状態を返す", () => {
    const state = showBanner(["a", "b", "c", "d"]);
    expect(state).toEqual<BannerState>({ lines: ["b", "c", "d"], faded: false });
  });

  it("fadeBannerは行を保ったままfaded:trueにする", () => {
    const shown = showBanner(["a", "b"]);
    const faded = fadeBanner(shown);
    expect(faded.faded).toBe(true);
    expect(faded.lines).toEqual(shown.lines);
  });

  it("fadeBannerはすでにfadedな状態を渡されたら同一参照を返す", () => {
    const shown = showBanner(["a"]);
    const faded = fadeBanner(shown);
    expect(fadeBanner(faded)).toBe(faded);
  });

  it("新しいメッセージが届く(showBannerを呼び直す)とfadedが取り消される", () => {
    const shown = showBanner(["a"]);
    const faded = fadeBanner(shown);
    expect(faded.faded).toBe(true);
    const reshown = showBanner([...faded.lines, "b"]);
    expect(reshown.faded).toBe(false);
    expect(reshown.lines).toEqual(["a", "b"]);
  });
});
