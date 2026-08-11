import { MAX_ALLIES, type TrainingFocus } from "../entities/player";
import { speciesById } from "../entities/species";
import type { SaveData, StoredItem, StoredMonster } from "../save";
import { itemDef } from "../items/catalog";

/** ダンジョンに持ち込める数。全部持って行けたら倉庫に預ける意味がない */
export const CARRY_LIMIT = 8;

/** 鍛え方(plan/protagonist-training.md、アーカイブ済み)の選択肢と表示名 */
const TRAINING_FOCI: readonly TrainingFocus[] = ["offense", "defense", "balance"];
const TRAINING_FOCUS_LABELS: Record<TrainingFocus, string> = {
  offense: "攻めを鍛える",
  defense: "守りを鍛える",
  balance: "バランスよく鍛える",
};
const TRAINING_FOCUS_DESCRIPTIONS: Record<TrainingFocus, string> = {
  offense: "レベルアップのたびに、攻撃力を大きく伸ばす。",
  defense: "レベルアップのたびに、守備力を大きく伸ばす。",
  balance: "レベルアップのたびに、攻撃力と守備力をバランスよく伸ばす。",
};

/**
 * 拠点。ダンジョンに潜る前に、倉庫の中身から持ち込む道具を選ぶ。
 *
 * 倒れると持ち込んだものは全部なくなり、踏破して帰れば持ち帰ったものが倉庫に入る。
 * 「良い杖を使いたいが、失うのは惜しい」という悩みがこの画面で生まれる。
 */
export class TownScreen {
  private open = false;
  /** 0 = 倉庫、1 = 持ち込み、2 = 出発地点、3 = 鍛え方、4 = つれていく仲間 */
  private column: 0 | 1 | 2 | 3 | 4 = 0;
  private cursor: [number, number] = [0, 0];
  private storage: StoredItem[] = [];
  private carry: StoredItem[] = [];
  private save: SaveData | null = null;
  /** 出発地点として選んでいる、既知のめざめの階段(1階=常に選べる入口を含む) */
  private startDepthIndex = 0;
  /** このダイブの鍛え方。前回選んだ方針を引き継いで開く */
  private trainingFocusIndex = TRAINING_FOCI.indexOf("balance");
  /** ねむり小屋の一覧上のカーソル位置 */
  private hutCursor = 0;
  /** 連れて行く仲間として選んだ、ねむり小屋のuid(最大 MAX_ALLIES 体) */
  private bringUids: number[] = [];
  /** 夢あわせ(plan/monster-fusion.md)で、軸として選んで確定した個体。まだ無ければ null */
  private fusionAxisUid: number | null = null;
  private depart:
    | ((
        carry: StoredItem[],
        storage: StoredItem[],
        startDepth: number,
        trainingFocus: TrainingFocus,
        bringAllyUids: number[],
      ) => void)
    | null = null;
  private onFuse: ((axisUid: number, foodUid: number) => void) | null = null;

  constructor(private readonly root: HTMLElement) {
    this.root.style.display = "none";
  }

  get isOpen(): boolean {
    return this.open;
  }

  show(
    save: SaveData,
    onDepart: (
      carry: StoredItem[],
      storage: StoredItem[],
      startDepth: number,
      trainingFocus: TrainingFocus,
      bringAllyUids: number[],
    ) => void,
    onFuse: (axisUid: number, foodUid: number) => void,
  ): void {
    this.save = save;
    this.storage = save.storage.map((s) => ({ ...s }));
    this.carry = [];
    this.column = 0;
    this.cursor = [0, 0];
    // 既知のめざめの階段のうち、最も深いところから出発する状態で開く
    this.startDepthIndex = Math.max(0, this.checkpoints().length - 1);
    // 前回選んだ鍛え方を引き継ぐ。一度決めておけば以後は何も聞かれない
    const idx = TRAINING_FOCI.indexOf(save.trainingFocus);
    this.trainingFocusIndex = idx >= 0 ? idx : TRAINING_FOCI.indexOf("balance");
    this.hutCursor = 0;
    this.bringUids = [];
    this.fusionAxisUid = null;
    this.depart = onDepart;
    this.onFuse = onFuse;
    this.open = true;
    this.root.style.display = "flex";
    this.render();
  }

  /**
   * ねむり小屋の中身が外部で変わった(夢あわせが成立した)ときに、
   * 画面を開いたまま最新の状態を反映する。
   */
  refreshSave(save: SaveData): void {
    this.save = save;
    this.hutCursor = Math.min(this.hutCursor, Math.max(0, this.hut().length - 1));
    this.render();
  }

  private hut(): StoredMonster[] {
    return this.save?.hut ?? [];
  }

  private checkpoints(): number[] {
    return this.save?.knownCheckpoints ?? [1];
  }

  hide(): void {
    this.open = false;
    this.root.style.display = "none";
  }

  handleKey(code: string): boolean {
    if (!this.open) return false;

    if (this.column === 2) {
      const checkpoints = this.checkpoints();
      switch (code) {
        case "ArrowUp":
        case "KeyW":
          this.startDepthIndex = wrap(this.startDepthIndex - 1, checkpoints.length);
          break;
        case "ArrowDown":
        case "KeyS":
          this.startDepthIndex = wrap(this.startDepthIndex + 1, checkpoints.length);
          break;
        case "ArrowLeft":
        case "KeyA":
          this.column = 1;
          break;
        case "ArrowRight":
        case "KeyD":
          this.column = 3;
          break;
        case "Space":
          this.departNow();
          return true;
        default:
          return true;
      }
      this.render();
      return true;
    }

    if (this.column === 3) {
      switch (code) {
        case "ArrowUp":
        case "KeyW":
          this.trainingFocusIndex = wrap(this.trainingFocusIndex - 1, TRAINING_FOCI.length);
          break;
        case "ArrowDown":
        case "KeyS":
          this.trainingFocusIndex = wrap(this.trainingFocusIndex + 1, TRAINING_FOCI.length);
          break;
        case "ArrowLeft":
        case "KeyA":
          this.column = 2;
          break;
        case "ArrowRight":
        case "KeyD":
          this.column = 4;
          break;
        case "Space":
          this.departNow();
          return true;
        default:
          return true;
      }
      this.render();
      return true;
    }

    if (this.column === 4) {
      const hut = this.hut();
      switch (code) {
        case "ArrowUp":
        case "KeyW":
          this.hutCursor = wrap(this.hutCursor - 1, hut.length);
          break;
        case "ArrowDown":
        case "KeyS":
          this.hutCursor = wrap(this.hutCursor + 1, hut.length);
          break;
        case "ArrowLeft":
        case "KeyA":
          this.fusionAxisUid = null;
          this.column = 3;
          break;
        case "Enter":
        case "NumpadEnter":
          this.toggleBring(hut[this.hutCursor]?.uid);
          break;
        case "KeyM":
          this.pickForFusion(hut[this.hutCursor]?.uid);
          break;
        case "Escape":
          this.fusionAxisUid = null;
          break;
        case "Space":
          this.departNow();
          return true;
        default:
          return true;
      }
      this.render();
      return true;
    }

    const column: 0 | 1 = this.column;
    const list = column === 0 ? this.storage : this.carry;

    switch (code) {
      case "ArrowUp":
      case "KeyW":
        this.cursor[column] = wrap(this.cursor[column] - 1, list.length);
        break;
      case "ArrowDown":
      case "KeyS":
        this.cursor[column] = wrap(this.cursor[column] + 1, list.length);
        break;
      case "ArrowLeft":
      case "KeyA":
        this.column = 0;
        break;
      case "ArrowRight":
      case "KeyD":
        this.column = column === 0 ? 1 : 2;
        break;
      case "Enter":
      case "NumpadEnter":
        this.transfer();
        break;
      case "Space":
        this.departNow();
        return true;
      default:
        return true;
    }
    this.render();
    return true;
  }

  /** ねむり小屋の仲間を、連れて行く選択に加える/外す(最大 MAX_ALLIES 体) */
  private toggleBring(uid: number | undefined): void {
    if (uid === undefined) return;
    if (this.bringUids.includes(uid)) {
      this.bringUids = this.bringUids.filter((u) => u !== uid);
      return;
    }
    if (this.bringUids.length >= MAX_ALLIES) return;
    this.bringUids.push(uid);
  }

  /**
   * 夢あわせ(plan/monster-fusion.md)の軸/糧を選ぶ。1回目のMで軸を確定し、
   * 2回目のMで糧を確定して発動する(同じ個体を選んだ場合は何もしない)。
   */
  private pickForFusion(uid: number | undefined): void {
    if (uid === undefined) return;
    if (this.fusionAxisUid === null) {
      this.fusionAxisUid = uid;
      return;
    }
    if (uid !== this.fusionAxisUid) this.onFuse?.(this.fusionAxisUid, uid);
    this.fusionAxisUid = null;
  }

  /** 選んでいるアイテムを、倉庫 ⇔ 持ち込み のあいだで移す */
  private transfer(): void {
    if (this.column === 0) {
      if (this.carry.length >= CARRY_LIMIT) return;
      const item = this.storage[this.cursor[0]];
      if (!item) return;
      this.storage.splice(this.cursor[0], 1);
      this.carry.push(item);
      this.cursor[0] = Math.min(this.cursor[0], Math.max(0, this.storage.length - 1));
    } else {
      const item = this.carry[this.cursor[1]];
      if (!item) return;
      this.carry.splice(this.cursor[1], 1);
      this.storage.push(item);
      this.cursor[1] = Math.min(this.cursor[1], Math.max(0, this.carry.length - 1));
    }
  }

  private departNow(): void {
    const depart = this.depart;
    const carry = this.carry.map((s) => ({ ...s }));
    const storage = this.storage.map((s) => ({ ...s }));
    const startDepth = this.checkpoints()[this.startDepthIndex] ?? 1;
    const trainingFocus = TRAINING_FOCI[this.trainingFocusIndex] ?? "balance";
    const bringAllyUids = [...this.bringUids];
    this.hide();
    depart?.(carry, storage, startDepth, trainingFocus, bringAllyUids);
  }

  private render(): void {
    const save = this.save;
    if (!save) return;

    this.root.replaceChildren();

    const box = document.createElement("div");
    box.className = "town-box";

    const title = document.createElement("h2");
    title.textContent = "洞窟のふもと";
    box.appendChild(title);

    const stats = document.createElement("p");
    stats.className = "town-stats";
    stats.textContent =
      `最深記録 ${save.deepest} 階 ・ 挑戦 ${save.runs} 回 ・ 踏破 ${save.clears} 回`;
    box.appendChild(stats);

    const lead = document.createElement("p");
    lead.className = "town-lead";
    lead.textContent =
      `持ち込めるのは ${CARRY_LIMIT} 個まで。倒れると持ち込んだ道具は失う。` +
      "めざめの階段で区切って戻れば、持ち帰ったものが倉庫に入る。";
    box.appendChild(lead);

    const columns = document.createElement("div");
    columns.className = "town-columns";
    columns.append(
      this.renderList("倉庫", this.storage, 0),
      this.renderList(`持ち込む (${this.carry.length} / ${CARRY_LIMIT})`, this.carry, 1),
      this.renderCheckpoints(),
      this.renderTrainingFocus(),
      this.renderHut(),
    );
    box.appendChild(columns);

    const desc = document.createElement("p");
    desc.className = "town-desc";
    if (this.column === 2) {
      desc.textContent = "既知のめざめの階段から選んで出発できる。";
    } else if (this.column === 3) {
      const focus = TRAINING_FOCI[this.trainingFocusIndex] ?? "balance";
      desc.textContent = TRAINING_FOCUS_DESCRIPTIONS[focus];
    } else if (this.column === 4) {
      desc.textContent =
        this.fusionAxisUid === null
          ? `Enterで選択/解除(最大${MAX_ALLIES}体、0体なら手ぶらで出発)。Mで夢あわせの軸を選ぶ。`
          : "夢あわせ: 糧にする個体を選んでMで確定(軸は消えず、糧は消えて軸に溶け込む)。";
    } else {
      const selected = (this.column === 0 ? this.storage : this.carry)[this.cursor[this.column]];
      desc.textContent = selected ? itemDef(selected.defId).description : "";
    }
    box.appendChild(desc);

    const hint = document.createElement("p");
    hint.className = "town-hint";
    hint.textContent =
      this.column === 4
        ? "←→ 列を移る / ↑↓ 選ぶ / Enter 選択・解除 / M 夢あわせ / Space もぐる"
        : "←→ 列を移る / ↑↓ 選ぶ / Enter 移す / Space もぐる";
    box.appendChild(hint);

    this.root.appendChild(box);
  }

  private renderList(label: string, items: StoredItem[], column: 0 | 1): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "town-col";
    if (this.column === column) wrapper.classList.add("active");

    const heading = document.createElement("div");
    heading.className = "town-col-title";
    heading.textContent = label;
    wrapper.appendChild(heading);

    const list = document.createElement("ul");
    if (items.length === 0) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = column === 0 ? "からっぽ" : "手ぶら";
      list.appendChild(li);
    }
    items.forEach((item, index) => {
      const def = itemDef(item.defId);
      const li = document.createElement("li");
      li.textContent =
        def.category === "staff" && item.charges !== undefined
          ? `${def.name}[${item.charges}]`
          : def.name;
      if (this.column === column && index === this.cursor[column]) li.classList.add("selected");
      list.appendChild(li);
    });
    wrapper.appendChild(list);
    return wrapper;
  }

  /** 既知のめざめの階段(チェックポイント)から出発地点を選ぶ一覧 */
  private renderCheckpoints(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "town-col";
    if (this.column === 2) wrapper.classList.add("active");

    const heading = document.createElement("div");
    heading.className = "town-col-title";
    heading.textContent = "出発地点";
    wrapper.appendChild(heading);

    const list = document.createElement("ul");
    this.checkpoints().forEach((depth, index) => {
      const li = document.createElement("li");
      li.textContent = depth === 1 ? "表の寝穴の入口(1階)" : `めざめの階段(地下${depth}階)`;
      if (this.column === 2 && index === this.startDepthIndex) li.classList.add("selected");
      list.appendChild(li);
    });
    wrapper.appendChild(list);
    return wrapper;
  }

  /** 鍛え方(plan/protagonist-training.md、アーカイブ済み)を選ぶ一覧 */
  private renderTrainingFocus(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "town-col";
    if (this.column === 3) wrapper.classList.add("active");

    const heading = document.createElement("div");
    heading.className = "town-col-title";
    heading.textContent = "鍛え方";
    wrapper.appendChild(heading);

    const list = document.createElement("ul");
    TRAINING_FOCI.forEach((focus, index) => {
      const li = document.createElement("li");
      li.textContent = TRAINING_FOCUS_LABELS[focus];
      if (this.column === 3 && index === this.trainingFocusIndex) li.classList.add("selected");
      list.appendChild(li);
    });
    wrapper.appendChild(list);
    return wrapper;
  }

  /** ねむり小屋(plan/monster-fusion.md、アーカイブ済み)から連れて行く仲間を選ぶ一覧 */
  private renderHut(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "town-col";
    if (this.column === 4) wrapper.classList.add("active");

    const heading = document.createElement("div");
    heading.className = "town-col-title";
    heading.textContent = `つれていく仲間 (${this.bringUids.length} / ${MAX_ALLIES})`;
    wrapper.appendChild(heading);

    const hut = this.hut();
    const list = document.createElement("ul");
    if (hut.length === 0) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "ねむり小屋はからっぽ";
      list.appendChild(li);
    }
    hut.forEach((m, index) => {
      const li = document.createElement("li");
      const name = m.nickname ?? speciesById(m.speciesId).name;
      li.textContent =
        m.uid === this.fusionAxisUid ? `${name} Lv${m.level}(夢あわせの軸)` : `${name} Lv${m.level}`;
      if (this.bringUids.includes(m.uid)) li.classList.add("chosen");
      if (m.uid === this.fusionAxisUid) li.classList.add("axis");
      if (this.column === 4 && index === this.hutCursor) li.classList.add("selected");
      list.appendChild(li);
    });
    wrapper.appendChild(list);
    return wrapper;
  }
}

function wrap(value: number, length: number): number {
  if (length <= 0) return 0;
  return ((value % length) + length) % length;
}
