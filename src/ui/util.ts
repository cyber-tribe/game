/**
 * カーソル位置を length で循環させる(負数にも対応)。
 * menu.ts / stance.ts / arts.ts / town.ts に完全一致のまま4重複していたものを集約
 * (plan外のリファクタリング、Martin Fowler PR17)
 */
export function wrap(value: number, length: number): number {
  if (length <= 0) return 0;
  return ((value % length) + length) % length;
}

/**
 * menu.ts / stance.ts / arts.ts の3メニューに共通するDOM部品(plan外のリファクタリング、
 * Martin Fowler PR20)。3ファイルとも「見出し(h3.menu-title)+一覧(ul.menu-list)+
 * 補足文言(div.menu-desc)+操作ヒント(div.menu-hint)」という骨格を持つが、状態機械
 * (単純な一覧/2段階メニュー等)自体は3者3様で共通化しづらいため、ListMenu基底クラスは
 * 見送り、完全一致していたDOM生成部分だけをここに切り出す
 */
export function createMenuTitle(text: string): HTMLElement {
  const el = document.createElement("h3");
  el.className = "menu-title";
  el.textContent = text;
  return el;
}

export function createMenuList(): HTMLUListElement {
  const el = document.createElement("ul");
  // スクリーンリーダー対応(plan/screen-reader-support.md): list-style:noneのulは
  // 一部の環境(Safari VoiceOver等)でlist roleが外れるため、明示的に付け直す
  el.setAttribute("role", "list");
  el.className = "menu-list";
  return el;
}

export function createMenuDesc(text: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "menu-desc";
  el.textContent = text;
  return el;
}

export function createMenuHint(text: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "menu-hint";
  el.textContent = text;
  return el;
}
