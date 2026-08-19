import { describe, expect, it } from "vitest";
import { Game } from "../src/game";
import { moveStairsCursor, stairsChoices } from "../src/ui/stairs-confirm";

/**
 * めざめの階段の確認モーダルの3択化(plan/game/checkpoint-stairs-menu.md)。
 * モーダルのDOM本体はnode環境では起こせないので、選択肢の構成・カーソル
 * 移動の純関数と、チェックポイント階の判定を検査する。
 */

describe("ui/stairs-confirm.ts: stairsChoices", () => {
  it("通常の階段は従来どおり「降りる/やめる」の2択", () => {
    const choices = stairsChoices(false);
    expect(choices.map((c) => c.key)).toEqual(["descend", "cancel"]);
  });

  it("めざめの階段では「降りる/区切って持ち帰る/やめる」の3択", () => {
    const choices = stairsChoices(true);
    expect(choices.map((c) => c.key)).toEqual(["descend", "bank", "cancel"]);
    // 初めて仕組みに触れるプレイヤーへの説明を兼ねるため、3択には
    // それぞれ1行の説明が付く
    for (const c of choices) expect(c.desc.length).toBeGreaterThan(0);
    expect(choices[1].label).toContain("区切って持ち帰る");
  });

  it("「やめる」は必ず末尾(既定カーソル=末尾の誤操作防止方針)", () => {
    expect(stairsChoices(false).at(-1)?.key).toBe("cancel");
    expect(stairsChoices(true).at(-1)?.key).toBe("cancel");
  });
});

describe("ui/stairs-confirm.ts: moveStairsCursor", () => {
  it("3択では上下で端から端へ折り返す", () => {
    expect(moveStairsCursor(0, "ArrowUp", 3)).toBe(2);
    expect(moveStairsCursor(2, "ArrowDown", 3)).toBe(0);
    expect(moveStairsCursor(1, "ArrowDown", 3)).toBe(2);
  });

  it("2択ではどの移動キーでもトグルになる(従来挙動の維持)", () => {
    for (const code of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyS"]) {
      expect(moveStairsCursor(0, code, 2)).toBe(1);
      expect(moveStairsCursor(1, code, 2)).toBe(0);
    }
  });

  it("移動キー以外ではカーソルが動かない", () => {
    expect(moveStairsCursor(1, "KeyR", 3)).toBe(1);
  });
});

describe("game.ts: onCheckpointFloor", () => {
  it("表の寝穴では6の倍数階だけがめざめの階段の階", () => {
    const game = new Game({ seed: 1 });
    game.depth = 5;
    expect(game.onCheckpointFloor).toBe(false);
    game.depth = 6;
    expect(game.onCheckpointFloor).toBe(true);
    game.depth = 7;
    expect(game.onCheckpointFloor).toBe(false);
    game.depth = 12;
    expect(game.onCheckpointFloor).toBe(true);
  });

  it("地方の概念が無いダンジョンでは全階が該当する", () => {
    const game = new Game({ seed: 1, dungeonId: "shortcutBackHole" });
    game.depth = 3;
    expect(game.onCheckpointFloor).toBe(true);
  });
});
