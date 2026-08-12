import type { MarkId } from "../core/types";
import { ACHIEVEMENTS, achievementDef } from "../entities/achievements";
import {
  HOKORA_DUST_DEF_ID,
  MARKS,
  MARK_IMPRINT_DUST_COST,
  MARK_STONE_DEF_ID,
  MAX_PLUS,
  hokoraDustCost,
  markDef,
} from "../entities/forging";
import { MAX_ALLIES, type TrainingFocus } from "../entities/player";
import { SPECIES, speciesById } from "../entities/species";
import { isCompendiumComplete, type SaveData, type StoredItem, type StoredMonster } from "../save";
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
  /** 0=倉庫 1=持ち込み 2=出発地点 3=鍛え方 4=つれていく仲間 5=ゲンドの工房 6=記録の間 7=モンスター図鑑 8=実績帳 */
  private column: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 = 0;
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
  /** ゲンドの工房(plan/equipment-forging.md)の一覧上のカーソル位置 */
  private workshopCursor = 0;
  /** 印を刻む対象として選んでいる装備。選択中(サブメニュー表示中)のみ非null */
  private workshopMarkTarget: StoredItem | null = null;
  /** 印刻みの候補一覧(倉庫にある刻印石ぶんだけ)。サブメニュー表示中のみ非null */
  private workshopMarkChoices: MarkId[] | null = null;
  private workshopMarkCursor = 0;
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
  private onRename: ((uid: number, current: string | undefined) => void) | null = null;
  private onEquipTitle: ((id: string | undefined) => void) | null = null;
  /** 実績帳(plan/achievements.md)の一覧上のカーソル位置 */
  private achievementCursor = 0;

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
    onRename: (uid: number, current: string | undefined) => void,
    onEquipTitle: (id: string | undefined) => void,
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
    this.workshopCursor = 0;
    this.workshopMarkTarget = null;
    this.workshopMarkChoices = null;
    this.depart = onDepart;
    this.onFuse = onFuse;
    this.onRename = onRename;
    this.onEquipTitle = onEquipTitle;
    this.achievementCursor = 0;
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
        case "ArrowRight":
        case "KeyD":
          this.column = 5;
          break;
        case "Enter":
        case "NumpadEnter":
          this.toggleBring(hut[this.hutCursor]?.uid);
          break;
        case "KeyM":
          this.pickForFusion(hut[this.hutCursor]?.uid);
          break;
        case "KeyN": {
          const target = hut[this.hutCursor];
          if (target) this.onRename?.(target.uid, target.nickname);
          return true;
        }
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

    if (this.column === 5) {
      return this.handleWorkshopKey(code);
    }

    if (this.column === 6) {
      switch (code) {
        case "ArrowLeft":
        case "KeyA":
          this.column = 5;
          break;
        case "ArrowRight":
        case "KeyD":
          this.column = 7;
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

    if (this.column === 7) {
      switch (code) {
        case "ArrowLeft":
        case "KeyA":
          this.column = 6;
          break;
        case "ArrowRight":
        case "KeyD":
          this.column = 8;
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

    if (this.column === 8) {
      switch (code) {
        case "ArrowUp":
        case "KeyW":
          this.achievementCursor = wrap(this.achievementCursor - 1, ACHIEVEMENTS.length);
          break;
        case "ArrowDown":
        case "KeyS":
          this.achievementCursor = wrap(this.achievementCursor + 1, ACHIEVEMENTS.length);
          break;
        case "ArrowLeft":
        case "KeyA":
          this.column = 7;
          break;
        case "Enter":
        case "NumpadEnter":
          this.toggleEquippedTitle();
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

  /**
   * 実績帳(plan/achievements.md)。カーソル上の実績が称号を持ち、かつ
   * 達成済みなら装備/解除する。それ以外の実績を選んでいるときは何もしない
   */
  private toggleEquippedTitle(): void {
    const def = ACHIEVEMENTS[this.achievementCursor];
    if (!def?.title || !this.save || this.save.achievements[def.id] === undefined) return;
    const next = this.save.equippedTitle === def.id ? undefined : def.id;
    this.onEquipTitle?.(next);
  }

  /** ゲンドの工房(plan/equipment-forging.md)の対象一覧。倉庫にある武器・盾だけ */
  private workshopTargets(): StoredItem[] {
    return this.storage.filter((s) => {
      const cat = itemDef(s.defId).category;
      return cat === "weapon" || cat === "shield";
    });
  }

  private countMaterial(defId: string): number {
    return this.storage.filter((s) => s.defId === defId).length;
  }

  /** 倉庫からdefIdの素材をcount個取り除く。targetの参照はそのまま生き続ける */
  private consumeMaterial(defId: string, count: number): void {
    let remaining = count;
    this.storage = this.storage.filter((s) => {
      if (remaining > 0 && s.defId === defId) {
        remaining--;
        return false;
      }
      return true;
    });
  }

  private handleWorkshopKey(code: string): boolean {
    const targets = this.workshopTargets();

    if (this.workshopMarkChoices) {
      switch (code) {
        case "ArrowUp":
        case "KeyW":
          this.workshopMarkCursor = wrap(this.workshopMarkCursor - 1, this.workshopMarkChoices.length);
          break;
        case "ArrowDown":
        case "KeyS":
          this.workshopMarkCursor = wrap(this.workshopMarkCursor + 1, this.workshopMarkChoices.length);
          break;
        case "Enter":
        case "NumpadEnter":
          this.confirmImprint();
          break;
        case "Escape":
          this.workshopMarkChoices = null;
          this.workshopMarkTarget = null;
          break;
        default:
          return true;
      }
      this.render();
      return true;
    }

    switch (code) {
      case "ArrowUp":
      case "KeyW":
        this.workshopCursor = wrap(this.workshopCursor - 1, targets.length);
        break;
      case "ArrowDown":
      case "KeyS":
        this.workshopCursor = wrap(this.workshopCursor + 1, targets.length);
        break;
      case "ArrowLeft":
      case "KeyA":
        this.column = 4;
        break;
      case "ArrowRight":
      case "KeyD":
        this.column = 6;
        break;
      case "Enter":
      case "NumpadEnter":
        this.forgeSelected(targets[this.workshopCursor]);
        break;
      case "KeyM":
        this.openImprintChoices(targets[this.workshopCursor]);
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

  /** 強化する: ほこら粉を消費して+1する(+9が上限) */
  private forgeSelected(target: StoredItem | undefined): void {
    if (!target) return;
    const plus = target.plus ?? 0;
    if (plus >= MAX_PLUS) return;
    const cost = hokoraDustCost(plus);
    if (this.countMaterial(HOKORA_DUST_DEF_ID) < cost) return;
    this.consumeMaterial(HOKORA_DUST_DEF_ID, cost);
    target.plus = plus + 1;
  }

  /** 印を刻む: 対象の部位(武器/盾)に合う印のうち、倉庫にある刻印石ぶんだけ選べる */
  private openImprintChoices(target: StoredItem | undefined): void {
    if (!target) return;
    const category = itemDef(target.defId).category;
    const slot = category === "weapon" ? "weapon" : category === "shield" ? "shield" : null;
    if (!slot) return;
    const owned = MARKS.filter(
      (m) => m.slot === slot && this.countMaterial(MARK_STONE_DEF_ID[m.id]) > 0,
    );
    if (owned.length === 0) return;
    this.workshopMarkTarget = target;
    this.workshopMarkChoices = owned.map((m) => m.id);
    this.workshopMarkCursor = 0;
  }

  private confirmImprint(): void {
    const target = this.workshopMarkTarget;
    const choices = this.workshopMarkChoices;
    if (!target || !choices) return;
    const markId = choices[this.workshopMarkCursor];
    if (!markId) return;
    if (this.countMaterial(HOKORA_DUST_DEF_ID) < MARK_IMPRINT_DUST_COST) return;
    if (this.countMaterial(MARK_STONE_DEF_ID[markId]) < 1) return;
    this.consumeMaterial(HOKORA_DUST_DEF_ID, MARK_IMPRINT_DUST_COST);
    this.consumeMaterial(MARK_STONE_DEF_ID[markId], 1);
    target.markId = markId;
    this.workshopMarkChoices = null;
    this.workshopMarkTarget = null;
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

    if (save.equippedTitle) {
      const titleDef = achievementDef(save.equippedTitle);
      if (titleDef?.title) {
        const titleLine = document.createElement("p");
        titleLine.className = "town-title";
        titleLine.textContent = `『${titleDef.title}』ガルド`;
        box.appendChild(titleLine);
      }
    }

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
      this.renderWorkshop(),
      this.renderRecords(),
      this.renderCompendium(),
      this.renderAchievements(),
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
          ? `Enterで選択/解除(最大${MAX_ALLIES}体、0体なら手ぶらで出発)。Mで夢あわせの軸を選ぶ。Nで改名。`
          : "夢あわせ: 糧にする個体を選んでMで確定(軸は消えず、糧は消えて軸に溶け込む)。";
    } else if (this.column === 5) {
      const dust = this.countMaterial(HOKORA_DUST_DEF_ID);
      if (this.workshopMarkChoices) {
        const markId = this.workshopMarkChoices[this.workshopMarkCursor];
        desc.textContent = markId
          ? `${markDef(markId).description}(ほこら粉${MARK_IMPRINT_DUST_COST}個+刻印石1個を消費。既にある印は上書きされる)`
          : "";
      } else {
        const target = this.workshopTargets()[this.workshopCursor];
        const plus = target?.plus ?? 0;
        desc.textContent = target
          ? `所持ほこら粉 ${dust}個。強化には${hokoraDustCost(plus)}個必要(${plus >= MAX_PLUS ? "上限に達した" : `次は+${plus + 1}`})。`
          : "倉庫に武器・盾が無い。";
      }
    } else if (this.column === 6) {
      desc.textContent = "見て楽しむだけの記録帳。攻略には関わらない。";
    } else if (this.column === 7) {
      const complete = this.save ? isCompendiumComplete(this.save) : false;
      desc.textContent = complete
        ? "図鑑が全種「捕まえた」で埋まった! かがやきの夢のかけらに出会いやすくなる。"
        : "見た・捕まえた種族の記録。全種「捕まえた」で埋めると特典がある。";
    } else if (this.column === 8) {
      const def = ACHIEVEMENTS[this.achievementCursor];
      if (def?.title && this.save?.achievements[def.id] !== undefined) {
        desc.textContent = `Enterで称号『${def.title}』を${this.save.equippedTitle === def.id ? "外す" : "身につける"}。`;
      } else {
        desc.textContent = def?.description ?? "";
      }
    } else {
      const selected = (this.column === 0 ? this.storage : this.carry)[this.cursor[this.column]];
      desc.textContent = selected ? itemDef(selected.defId).description : "";
    }
    box.appendChild(desc);

    const hint = document.createElement("p");
    hint.className = "town-hint";
    if (this.column === 4) {
      hint.textContent = "←→ 列を移る / ↑↓ 選ぶ / Enter 選択・解除 / M 夢あわせ / N 改名 / Space もぐる";
    } else if (this.column === 5) {
      hint.textContent = this.workshopMarkChoices
        ? "↑↓ 印を選ぶ / Enter 刻む / Esc もどる"
        : "←→ 列を移る / ↑↓ 選ぶ / Enter 強化(+1) / M 印を刻む / Space もぐる";
    } else if (this.column === 6) {
      hint.textContent = "← 列を移る / Space もぐる";
    } else {
      hint.textContent = "←→ 列を移る / ↑↓ 選ぶ / Enter 移す / Space もぐる";
    }
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
      const name = displayStoredMonsterName(m);
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

  /** ゲンドの工房(plan/equipment-forging.md): 武器・盾の強化・印刻み */
  private renderWorkshop(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "town-col";
    if (this.column === 5) wrapper.classList.add("active");

    const heading = document.createElement("div");
    heading.className = "town-col-title";
    heading.textContent = "ゲンドの工房";
    wrapper.appendChild(heading);

    const targets = this.workshopTargets();
    const list = document.createElement("ul");
    if (targets.length === 0) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "強化できる武器・盾が倉庫に無い";
      list.appendChild(li);
    }
    targets.forEach((item, index) => {
      const def = itemDef(item.defId);
      const li = document.createElement("li");
      let text = `${def.name}+${item.plus ?? 0}`;
      if (item.markId) text += `【${markDef(item.markId).name}】`;
      li.textContent = text;
      if (this.column === 5 && index === this.workshopCursor) li.classList.add("selected");
      list.appendChild(li);
    });
    wrapper.appendChild(list);

    if (this.workshopMarkChoices) {
      const sub = document.createElement("ul");
      sub.className = "menu-sub";
      this.workshopMarkChoices.forEach((markId, index) => {
        const li = document.createElement("li");
        li.textContent = markDef(markId).name;
        if (index === this.workshopMarkCursor) li.classList.add("selected");
        sub.appendChild(li);
      });
      wrapper.appendChild(sub);
    }

    return wrapper;
  }

  /**
   * 記録の間(plan/records-hall.md)。積み重ねてきた数値記録の一覧。
   * 選択・カーソル移動は無く、見るだけの画面。
   */
  private renderRecords(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "town-col";
    if (this.column === 6) wrapper.classList.add("active");

    const heading = document.createElement("div");
    heading.className = "town-col-title";
    heading.textContent = "記録の間";
    wrapper.appendChild(heading);

    const save = this.save;
    const list = document.createElement("ul");
    const rows: [string, number][] = save
      ? [
          ["最深到達(表の寝穴)", save.deepest],
          ["累計ダイブ回数", save.runs],
          ["踏破回数", save.clears],
          ["全滅回数", save.runs - save.clears],
          ["累計撃破数", save.records.totalDefeats],
          ["のべ捕獲数", save.records.totalCaptures],
        ]
      : [];
    for (const [label, value] of rows) {
      const li = document.createElement("li");
      li.textContent = `${label}: ${value}`;
      list.appendChild(li);
    }
    wrapper.appendChild(list);
    return wrapper;
  }

  /**
   * モンスター図鑑(plan/monster-compendium.md)。種族ごとに「未確認」
   * 「見た」「捕まえた」を表示するだけの画面(カーソル移動・選択は無い)。
   */
  private renderCompendium(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "town-col";
    if (this.column === 7) wrapper.classList.add("active");

    const heading = document.createElement("div");
    heading.className = "town-col-title";
    heading.textContent = "モンスター図鑑";
    wrapper.appendChild(heading);

    const compendium = this.save?.compendium ?? {};
    const captured = SPECIES.filter((s) => compendium[s.id] === "captured").length;
    const summary = document.createElement("p");
    summary.textContent = `捕まえた ${captured} / ${SPECIES.length} 種`;
    wrapper.appendChild(summary);

    const list = document.createElement("ul");
    for (const species of SPECIES) {
      const status = compendium[species.id];
      const label = status === "captured" ? "捕まえた" : status === "seen" ? "見た" : "未確認";
      const li = document.createElement("li");
      li.textContent = status ? `${species.name}: ${label}` : `???: ${label}`;
      list.appendChild(li);
    }
    wrapper.appendChild(list);
    return wrapper;
  }

  /**
   * 実績帳(plan/achievements.md)。未達成の実績も条件を伏せずに表示する
   * (隠し実績は作らない方針)。称号を持つ達成済みの実績はEnterで着脱できる
   */
  private renderAchievements(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "town-col";
    if (this.column === 8) wrapper.classList.add("active");

    const heading = document.createElement("div");
    heading.className = "town-col-title";
    heading.textContent = "実績帳";
    wrapper.appendChild(heading);

    const achievements = this.save?.achievements ?? {};
    const done = ACHIEVEMENTS.filter((a) => achievements[a.id] !== undefined).length;
    const summary = document.createElement("p");
    summary.textContent = `達成 ${done} / ${ACHIEVEMENTS.length} 件`;
    wrapper.appendChild(summary);

    const list = document.createElement("ul");
    ACHIEVEMENTS.forEach((def, index) => {
      const unlockedAt = achievements[def.id];
      const li = document.createElement("li");
      const equipped = this.save?.equippedTitle === def.id ? "★" : "";
      li.textContent = unlockedAt
        ? `${equipped}${def.name}: ${def.description}(達成)`
        : `${def.name}: ${def.description}(未達成)`;
      if (this.column === 8 && index === this.achievementCursor) li.classList.add("selected");
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

/** ねむり小屋の一覧表示用の名前。src/entities/naming.ts の displayActorName と同じ考え方 */
function displayStoredMonsterName(m: StoredMonster): string {
  const species = speciesById(m.speciesId).name;
  return m.nickname ? `${m.nickname}(${species})` : species;
}
