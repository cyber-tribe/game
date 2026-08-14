import { describe, expect, it } from "vitest";
import {
  BANNER_LINE_COUNT,
  bannerLinesFor,
  bannerVisible,
  fadeBanner,
  showBanner,
  INITIAL_BANNER_STATE,
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

describe("entities/messageBanner.ts: モーダルと帯の重なり (#461)", () => {
  it("モーダルが開いていなければ、フェード前の帯は見える", () => {
    expect(bannerVisible(showBanner(["装備した。"]), false)).toBe(true);
  });

  it("モーダルが開いているあいだは、新着メッセージでも帯を出さない", () => {
    // 「◯◯を装備した。」はもちものを開いたまま流れる。これがモーダルに
    // 重なって、効果説明・操作ヒントを隠していたのが元の不具合
    expect(bannerVisible(showBanner(["装備した。"]), true)).toBe(false);
  });

  it("モーダルを閉じれば、隠していたメッセージがそのまま帯に出る", () => {
    const state = showBanner(["装備した。"]);
    expect(bannerVisible(state, true)).toBe(false);
    expect(bannerVisible(state, false)).toBe(true);
    // 行は捨てていない(閉じたあとに読める)
    expect(state.lines).toEqual(["装備した。"]);
  });

  it("フェード済みなら、モーダルが閉じていても出さない", () => {
    expect(bannerVisible(fadeBanner(showBanner(["a"])), false)).toBe(false);
  });

  it("行が1つも無ければ出さない(初期状態)", () => {
    expect(bannerVisible(INITIAL_BANNER_STATE, false)).toBe(false);
    expect(bannerVisible({ lines: [], faded: false }, false)).toBe(false);
  });
});
