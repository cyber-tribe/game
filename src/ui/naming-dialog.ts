import { resolveText } from "../entities/inputText";
import { MAX_NICKNAME_LENGTH, sanitizeNickname } from "../entities/naming";
import { currentInputMode } from "./inputMode";

/**
 * 仲間への命名(plan/companion-naming.md)。
 *
 * 実機のIME(ひらがな入力)をそのまま使いたいので、独自のキー読み取りは
 * せず、素のtext inputに委ねる。ゲーム側の入力(src/view/input.ts)は
 * activeElementがinputのあいだキー処理を素通しするので、ここでの
 * キー入力はゲーム側の移動・メニュー操作と衝突しない。
 */
export class NamingDialog {
  private open = false;
  private onConfirm: ((value: string | undefined) => void) | null = null;
  private input: HTMLInputElement | null = null;

  constructor(private readonly root: HTMLElement) {
    this.root.style.display = "none";
  }

  get isOpen(): boolean {
    return this.open;
  }

  /**
   * @param title 見出し(例:「タロ が仲間になった!」)
   * @param current 既につけている名前があれば初期値にする(改名時)
   * @param onConfirm Enterで確定したときだけ呼ばれる。空欄で確定ならundefined
   *   (名付けない/名前を消す)。Escでキャンセルした場合は呼ばれない
   */
  show(title: string, current: string | undefined, onConfirm: (value: string | undefined) => void): void {
    this.open = true;
    this.onConfirm = onConfirm;
    this.root.style.display = "flex";
    this.render(title, current ?? "");
    this.input?.focus();
  }

  hide(): void {
    this.open = false;
    this.onConfirm = null;
    this.input = null;
    this.root.style.display = "none";
  }

  private render(title: string, initial: string): void {
    this.root.replaceChildren();

    const box = document.createElement("div");
    box.className = "naming-box";

    const heading = document.createElement("h3");
    heading.id = "naming-heading";
    heading.textContent = title;
    box.appendChild(heading);

    const input = document.createElement("input");
    input.type = "text";
    input.className = "naming-input";
    input.maxLength = MAX_NICKNAME_LENGTH;
    input.value = initial;
    input.setAttribute("aria-labelledby", "naming-heading");
    input.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        this.confirm(input.value);
      } else if (event.key === "Escape") {
        event.preventDefault();
        this.cancel();
      }
    });
    box.appendChild(input);
    this.input = input;

    // タップできる操作(issue #488)。スマホのソフトウェアキーボードには
    // Escapeが無く、Enterもかな変換の確定に消費されうるため、キーイベント
    // だけに頼るとこのダイアログから抜けられなくなる。ここに置いておけば
    // タッチUI(#touch)の表示状態に左右されず、お披露目中でも改名でも効く
    const actions = document.createElement("div");
    actions.className = "naming-actions";

    const confirmButton = document.createElement("button");
    confirmButton.type = "button";
    confirmButton.className = "naming-button naming-button-confirm";
    confirmButton.textContent = "決定";
    confirmButton.addEventListener("click", () => this.confirm(input.value));
    actions.appendChild(confirmButton);

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "naming-button";
    cancelButton.textContent = "あとで";
    cancelButton.addEventListener("click", () => this.cancel());
    actions.appendChild(cancelButton);

    box.appendChild(actions);

    const hint = document.createElement("p");
    hint.className = "naming-hint";
    // 文言のタッチ対応(plan/game/archive/mobile-layout-redesign.md):
    // 「Enter」「Esc」はキーボード前提の表記
    hint.textContent = resolveText(
      {
        keyboard: `Enter 決定 / Esc あとで(最大${MAX_NICKNAME_LENGTH}文字)`,
        touch: `ボタンで決定 / あとで(最大${MAX_NICKNAME_LENGTH}文字)`,
      },
      currentInputMode(),
    );
    box.appendChild(hint);

    this.root.appendChild(box);
  }

  private confirm(value: string): void {
    const callback = this.onConfirm;
    this.hide();
    // 空欄でEnterした場合はundefined(名付けない/名前を消す)を渡す
    callback?.(sanitizeNickname(value));
  }

  /** Escで閉じたときは何も変更しない(改名なら元の名前のまま) */
  private cancel(): void {
    this.hide();
  }
}
