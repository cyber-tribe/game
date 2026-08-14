import { describe, expect, it } from "vitest";
import { applyPadDirCodes } from "../src/ui/touch-controls";
import { Input } from "../src/view/input";

/**
 * 仮想パッドでメニューのカーソルを動かせるようにする(issue #460)。
 *
 * パッドのドラッグは`Input.press`/`release`で`held`へ直接注入するため、
 * キーボードの`keydown`が通る横取り口(`Input.onKey`)を素通りしていた。
 * その結果、もちもの等を開いてもパッドではカーソルが動かなかった。
 *
 * テストは`window`の無いnode環境で走るので、`Input`には自前の
 * `EventTarget`を渡して作る(既定引数の`window`に触らせない)。
 */
function makeInput(): Input {
  return new Input(new EventTarget());
}

/**
 * メニューが開いている状態を模した`onKey`を差し込む。`src/ui/menu.ts`の
 * `handleKey`は開いているあいだ既定でtrueを返す(盤面に通さない)ので、
 * ここでも受け取ったコードを全部消費する。渡ってきたコードを記録して、
 * 「カーソルが何回動いたか」を数えられるようにしておく
 */
function openMenu(input: Input): string[] {
  const seen: string[] = [];
  input.onKey = (code) => {
    seen.push(code);
    return true;
  };
  return seen;
}

describe("ui/touch-controls.ts: 仮想パッドとメニューのカーソル (#460)", () => {
  it("メニューが開いていなければ、従来どおり押しっぱなしの移動になる", () => {
    const input = makeInput();

    applyPadDirCodes(input, [], ["ArrowUp"]);

    expect(input.direction()).toBe(0); // 北
  });

  it("メニューが開いていれば、方向はメニューへ渡り、盤面には押しっぱなしとして入らない", () => {
    const input = makeInput();
    const seen = openMenu(input);

    applyPadDirCodes(input, [], ["ArrowDown"]);

    expect(seen).toEqual(["ArrowDown"]);
    // ここでpressしてしまうと、メニューを閉じた瞬間に盤面が歩き出してしまう
    expect(input.direction()).toBeNull();
  });

  it("倒しっぱなしでpointermoveが何度も飛んできても、カーソルは1つしか動かない", () => {
    const input = makeInput();
    const seen = openMenu(input);

    let prev = applyPadDirCodes(input, [], ["ArrowDown"]);
    for (let i = 0; i < 8; i++) prev = applyPadDirCodes(input, prev, ["ArrowDown"]);

    expect(seen).toEqual(["ArrowDown"]);
  });

  it("中心へ戻してから倒し直すと、もう一度カーソルが動く", () => {
    const input = makeInput();
    const seen = openMenu(input);

    const tilted = applyPadDirCodes(input, [], ["ArrowDown"]);
    const centered = applyPadDirCodes(input, tilted, []); // デッドゾーンへ戻す
    applyPadDirCodes(input, centered, ["ArrowDown"]);

    expect(seen).toEqual(["ArrowDown", "ArrowDown"]);
  });

  it("斜めに倒すと、増えたぶんの方向だけがメニューへ渡る", () => {
    const input = makeInput();
    const seen = openMenu(input);

    const north = applyPadDirCodes(input, [], ["ArrowUp"]);
    applyPadDirCodes(input, north, ["ArrowUp", "ArrowRight"]); // 北→北東

    expect(seen).toEqual(["ArrowUp", "ArrowRight"]);
  });

  it("メニューを閉じたあとにパッドを倒し直せば、盤面の移動として効く", () => {
    const input = makeInput();
    openMenu(input);

    const tilted = applyPadDirCodes(input, [], ["ArrowUp"]);
    const centered = applyPadDirCodes(input, tilted, []);
    input.onKey = null; // メニューを閉じた
    applyPadDirCodes(input, centered, ["ArrowUp"]);

    expect(input.direction()).toBe(0);
  });

  it("メニューに吸われた方向を離しても、盤面の押しっぱなしを壊さない", () => {
    const input = makeInput();
    input.press("ArrowLeft"); // 別経路(キーボード)で西を押している状態
    openMenu(input);

    const tilted = applyPadDirCodes(input, [], ["ArrowUp"]);
    applyPadDirCodes(input, tilted, []);

    expect(input.direction()).toBe(6); // 西のまま
  });

  it("パッドを中心へ戻すと、押しっぱなしが解除される", () => {
    const input = makeInput();

    const tilted = applyPadDirCodes(input, [], ["ArrowUp"]);
    applyPadDirCodes(input, tilted, []);

    expect(input.direction()).toBeNull();
  });
});
