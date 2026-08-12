import type { MarkId } from "../core/types";
import { ACHIEVEMENTS, achievementDef } from "../entities/achievements";
import { bondStage, bondStageLabel } from "../entities/companionBond";
import {
  DIFFICULTY_DESCRIPTIONS,
  DIFFICULTY_MODES,
  DIFFICULTY_NAMES,
  type DifficultyMode,
} from "../entities/difficulty";
import {
  HOKORA_DUST_DEF_ID,
  MARKS,
  MARK_IMPRINT_DUST_COST,
  MARK_STONE_DEF_ID,
  MAX_PLUS,
  hokoraDustCost,
  markDef,
} from "../entities/forging";
import { DUNGEONS, type DungeonDef, isDungeonUnlocked } from "../entities/dungeons";
import { MAX_ALLIES, type TrainingFocus } from "../entities/player";
import { SPECIES, speciesById } from "../entities/species";
import { isCompendiumComplete, isWeaponCompendiumComplete, type SaveData, type StoredItem, type StoredMonster } from "../save";
import { ITEMS, itemDef } from "../items/catalog";
import { MAX_ACTIVE_QUESTS, questDef } from "../entities/quests";
import {
  VILLAGE_STAGE_REQUIREMENTS,
  canDevelopVillage,
  hutCapacity,
  nextVillageStageRequirement,
} from "../entities/village";

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
  /** 0=倉庫 1=持ち込み 2=出発地点 3=鍛え方 4=つれていく仲間 5=ゲンドの工房 6=記録の間 7=モンスター図鑑 8=実績帳 9=装備図鑑 10=難易度 11=依頼板 12=潜るダンジョン 13=村の発展 */
  private column: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 = 0;
  private cursor: [number, number] = [0, 0];
  private storage: StoredItem[] = [];
  private carry: StoredItem[] = [];
  private save: SaveData | null = null;
  /** 出発地点として選んでいる、既知のめざめの階段(1階=常に選べる入口を含む) */
  private startDepthIndex = 0;
  /** このダイブの鍛え方。前回選んだ方針を引き継いで開く */
  private trainingFocusIndex = TRAINING_FOCI.indexOf("balance");
  /** 難易度モード(plan/difficulty-modes.md)。前回選んだものを引き継いで開く */
  private difficultyIndex = DIFFICULTY_MODES.indexOf("normal");
  /** 複数のダンジョン(plan/multiple-dungeons.md)。解放済みダンジョン一覧(unlockedDungeons())の中でのカーソル位置 */
  private dungeonIndex = 0;
  /** ねむり小屋の一覧上のカーソル位置 */
  private hutCursor = 0;
  /** 連れて行く仲間として選んだ、ねむり小屋のuid(最大 MAX_ALLIES 体) */
  private bringUids: number[] = [];
  /** 夢あわせ(plan/monster-fusion.md)で、軸として選んで確定した個体。まだ無ければ null */
  private fusionAxisUid: number | null = null;
  /** 夢に還す(plan/release-companion.md)の確認待ちの個体。確認中(サブメニュー表示中)のみ非null */
  private releaseConfirmUid: number | null = null;
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
        difficulty: DifficultyMode,
        dungeonId: string,
      ) => void)
    | null = null;
  private onFuse: ((axisUid: number, foodUid: number) => void) | null = null;
  private onRename: ((uid: number, current: string | undefined) => void) | null = null;
  private onEquipTitle: ((id: string | undefined) => void) | null = null;
  private onAcceptQuest: ((defId: string) => void) | null = null;
  private onAbandonQuest: ((defId: string) => void) | null = null;
  private onReleaseCompanion: ((uid: number) => void) | null = null;
  private onDevelopVillage: (() => void) | null = null;
  /** 実績帳(plan/achievements.md)の一覧上のカーソル位置 */
  private achievementCursor = 0;
  /** 依頼板(plan/quest-board.md)の一覧上のカーソル位置 */
  private questCursor = 0;

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
      difficulty: DifficultyMode,
      dungeonId: string,
    ) => void,
    onFuse: (axisUid: number, foodUid: number) => void,
    onRename: (uid: number, current: string | undefined) => void,
    onEquipTitle: (id: string | undefined) => void,
    onAcceptQuest: (defId: string) => void,
    onAbandonQuest: (defId: string) => void,
    onReleaseCompanion: (uid: number) => void,
    onDevelopVillage: () => void,
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
    const diffIdx = DIFFICULTY_MODES.indexOf(save.difficulty);
    this.difficultyIndex = diffIdx >= 0 ? diffIdx : DIFFICULTY_MODES.indexOf("normal");
    this.dungeonIndex = 0;
    this.hutCursor = 0;
    this.bringUids = [];
    this.fusionAxisUid = null;
    this.releaseConfirmUid = null;
    this.workshopCursor = 0;
    this.workshopMarkTarget = null;
    this.workshopMarkChoices = null;
    this.depart = onDepart;
    this.onFuse = onFuse;
    this.onRename = onRename;
    this.onEquipTitle = onEquipTitle;
    this.onAcceptQuest = onAcceptQuest;
    this.onAbandonQuest = onAbandonQuest;
    this.onReleaseCompanion = onReleaseCompanion;
    this.onDevelopVillage = onDevelopVillage;
    this.achievementCursor = 0;
    this.questCursor = 0;
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
    this.releaseConfirmUid = null;
    this.render();
  }

  private hut(): StoredMonster[] {
    return this.save?.hut ?? [];
  }

  private checkpoints(): number[] {
    return this.save?.knownCheckpoints ?? [1];
  }

  /** 複数のダンジョン(plan/multiple-dungeons.md)。解放済みのものだけを選択できる */
  private unlockedDungeons(): DungeonDef[] {
    const deepest = this.save?.deepest ?? 0;
    return DUNGEONS.filter((d) => isDungeonUnlocked(d, deepest));
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

      // 夢に還す(plan/release-companion.md): 取り消せない操作なので、確定前に1回確認を挟む
      if (this.releaseConfirmUid !== null) {
        switch (code) {
          case "Enter":
          case "NumpadEnter": {
            const uid = this.releaseConfirmUid;
            this.releaseConfirmUid = null;
            this.bringUids = this.bringUids.filter((u) => u !== uid);
            if (this.fusionAxisUid === uid) this.fusionAxisUid = null;
            this.onReleaseCompanion?.(uid);
            break;
          }
          case "Escape":
            this.releaseConfirmUid = null;
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
        case "KeyX": {
          const target = hut[this.hutCursor];
          if (target) this.releaseConfirmUid = target.uid;
          break;
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
        case "ArrowRight":
        case "KeyD":
          this.column = 9;
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

    if (this.column === 9) {
      switch (code) {
        case "ArrowLeft":
        case "KeyA":
          this.column = 8;
          break;
        case "ArrowRight":
        case "KeyD":
          this.column = 10;
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

    if (this.column === 10) {
      switch (code) {
        case "ArrowUp":
        case "KeyW":
          this.difficultyIndex = wrap(this.difficultyIndex - 1, DIFFICULTY_MODES.length);
          break;
        case "ArrowDown":
        case "KeyS":
          this.difficultyIndex = wrap(this.difficultyIndex + 1, DIFFICULTY_MODES.length);
          break;
        case "ArrowLeft":
        case "KeyA":
          this.column = 9;
          break;
        case "ArrowRight":
        case "KeyD":
          this.column = 11;
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

    if (this.column === 11) {
      const rows = this.questBoardRows();
      switch (code) {
        case "ArrowUp":
        case "KeyW":
          this.questCursor = wrap(this.questCursor - 1, rows.length);
          break;
        case "ArrowDown":
        case "KeyS":
          this.questCursor = wrap(this.questCursor + 1, rows.length);
          break;
        case "ArrowLeft":
        case "KeyA":
          this.column = 10;
          break;
        case "ArrowRight":
        case "KeyD":
          this.column = 12;
          break;
        case "Enter":
        case "NumpadEnter": {
          const row = rows[this.questCursor];
          if (row?.status === "offer") this.onAcceptQuest?.(row.defId);
          else if (row?.status === "active") this.onAbandonQuest?.(row.defId);
          break;
        }
        case "Space":
          this.departNow();
          return true;
        default:
          return true;
      }
      this.render();
      return true;
    }

    if (this.column === 12) {
      const dungeons = this.unlockedDungeons();
      switch (code) {
        case "ArrowUp":
        case "KeyW":
          this.dungeonIndex = wrap(this.dungeonIndex - 1, dungeons.length);
          break;
        case "ArrowDown":
        case "KeyS":
          this.dungeonIndex = wrap(this.dungeonIndex + 1, dungeons.length);
          break;
        case "ArrowLeft":
        case "KeyA":
          this.column = 11;
          break;
        case "ArrowRight":
        case "KeyD":
          this.column = 13;
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

    if (this.column === 13) {
      switch (code) {
        case "ArrowLeft":
        case "KeyA":
          this.column = 12;
          break;
        case "Enter":
        case "NumpadEnter":
          this.onDevelopVillage?.();
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
    const dungeon = this.unlockedDungeons()[this.dungeonIndex] ?? DUNGEONS[0]!;
    // 出発地点(めざめの階段)は表の寝穴だけの仕組み。他のダンジョンは常に1階から
    const startDepth = dungeon.id === DUNGEONS[0]!.id ? this.checkpoints()[this.startDepthIndex] ?? 1 : 1;
    const trainingFocus = TRAINING_FOCI[this.trainingFocusIndex] ?? "balance";
    const difficulty = DIFFICULTY_MODES[this.difficultyIndex] ?? "normal";
    const bringAllyUids = [...this.bringUids];
    this.hide();
    depart?.(carry, storage, startDepth, trainingFocus, bringAllyUids, difficulty, dungeon.id);
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
      `最深記録 ${save.deepest} 階 ・ 挑戦 ${save.runs} 回 ・ 踏破 ${save.clears} 回 ・ 所持金 ${save.gold} G`;
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
      this.renderEquipmentCompendium(),
      this.renderDifficulty(),
      this.renderQuestBoard(),
      this.renderDungeons(),
      this.renderVillage(),
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
        this.releaseConfirmUid !== null
          ? "この個体を夢に還す。取り消せない。よければEnter、やめるならEsc。"
          : this.fusionAxisUid === null
            ? `Enterで選択/解除(最大${MAX_ALLIES}体、0体なら手ぶらで出発)。Mで夢あわせの軸を選ぶ。Nで改名。Xで夢に還す。`
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
    } else if (this.column === 9) {
      const complete = this.save ? isWeaponCompendiumComplete(this.save) : false;
      desc.textContent = complete
        ? "武器図鑑が全系統「極めた」で埋まった! 称号『樽守りの目利き』を実績帳で身につけられる。"
        : "入手・強化・刻印の記録。武器は+9かつ印を刻んで初めて「極めた」になる。";
    } else if (this.column === 10) {
      const mode = DIFFICULTY_MODES[this.difficultyIndex] ?? "normal";
      desc.textContent = DIFFICULTY_DESCRIPTIONS[mode];
    } else if (this.column === 11) {
      const row = this.questBoardRows()[this.questCursor];
      const def = row ? questDef(row.defId) : undefined;
      desc.textContent =
        row && def
          ? row.status === "offer"
            ? `Enterで受注する(最大${MAX_ACTIVE_QUESTS}件まで)。${def.description}`
            : `Enterで受注を取り下げる(達成報酬は失われる)。${def.description}`
          : "貼り出されている依頼が無い。日をまたぐと新しい依頼が貼り出される。";
    } else if (this.column === 12) {
      const dungeon = this.unlockedDungeons()[this.dungeonIndex];
      desc.textContent = dungeon?.description ?? "";
    } else if (this.column === 13) {
      const stage = this.save?.villageStage ?? 1;
      const requirement = nextVillageStageRequirement(stage);
      desc.textContent = requirement
        ? `Enterで発展させる: ${requirement.label}(最深${requirement.minDeepest}階到達・${requirement.cost}G必要)`
        : "村はすでに最終段階まで発展している。";
    } else {
      const selected = (this.column === 0 ? this.storage : this.carry)[this.cursor[this.column]];
      desc.textContent = selected ? itemDef(selected.defId).description : "";
    }
    box.appendChild(desc);

    const hint = document.createElement("p");
    hint.className = "town-hint";
    if (this.column === 4) {
      hint.textContent = this.releaseConfirmUid !== null
        ? "Enter 夢に還す(確定) / Esc やめる"
        : "←→ 列を移る / ↑↓ 選ぶ / Enter 選択・解除 / M 夢あわせ / N 改名 / X 夢に還す / Space もぐる";
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
      const bondLabel = bondStageLabel(bondStage(m.bondSuccessCount));
      const base = bondLabel ? `${name} Lv${m.level}・${bondLabel}` : `${name} Lv${m.level}`;
      li.textContent =
        m.uid === this.releaseConfirmUid
          ? `${base}(夢に還す?)`
          : m.uid === this.fusionAxisUid
            ? `${base}(夢あわせの軸)`
            : base;
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
          ["夜ごとの夢 自己ベスト", save.nightlyDreamBestDepth],
        ]
      : [];
    for (const [label, value] of rows) {
      const li = document.createElement("li");
      li.textContent = `${label}: ${value}`;
      list.appendChild(li);
    }
    // なじみ(plan/companion-bond-growth.md): 現在のねむり小屋で最も同伴成功回数が多い個体
    const mostBonded = [...this.hut()].sort((a, b) => b.bondSuccessCount - a.bondSuccessCount)[0];
    const bondedLi = document.createElement("li");
    bondedLi.textContent =
      mostBonded && mostBonded.bondSuccessCount > 0
        ? `もっとも連れ添った仲間: ${displayStoredMonsterName(mostBonded)}(${mostBonded.bondSuccessCount}回)`
        : "もっとも連れ添った仲間: まだいない";
    list.appendChild(bondedLi);
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

  /**
   * 装備図鑑(plan/equipment-compendium.md)。武器・頭防具・装身具・印・素材の
   * 入手/極めた状態を表示するだけの画面(カーソル移動・選択は無い)。
   */
  private renderEquipmentCompendium(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "town-col";
    if (this.column === 9) wrapper.classList.add("active");

    const heading = document.createElement("div");
    heading.className = "town-col-title";
    heading.textContent = "装備図鑑";
    wrapper.appendChild(heading);

    const equipment = this.save?.equipmentCompendium ?? {};
    const marks = this.save?.markCompendium ?? {};
    const materials = this.save?.materialCompendium ?? {};

    const list = document.createElement("ul");
    const weaponIds = ITEMS.filter((i) => i.category === "weapon").map((i) => i.id);
    const mastered = weaponIds.filter((id) => equipment[id] === "mastered").length;
    const summary = document.createElement("li");
    summary.textContent = `武器: 極めた ${mastered} / ${weaponIds.length} 系統`;
    list.appendChild(summary);

    for (const def of ITEMS.filter((i) => i.category === "weapon" || i.category === "head" || i.category === "charm")) {
      const status = equipment[def.id];
      const label = status === "mastered" ? "極めた" : status === "owned" ? "入手済み" : "未発見";
      const li = document.createElement("li");
      li.textContent = status ? `${def.name}: ${label}` : `???: ${label}`;
      list.appendChild(li);
    }
    for (const mark of MARKS) {
      const label = marks[mark.id] === "owned" ? "入手済み" : "未発見";
      const li = document.createElement("li");
      li.textContent = `${markDef(mark.id).name}: ${label}`;
      list.appendChild(li);
    }
    for (const def of ITEMS.filter((i) => i.category === "material")) {
      const label = materials[def.id] === "owned" ? "入手済み" : "未発見";
      const li = document.createElement("li");
      li.textContent = materials[def.id] ? `${def.name}: ${label}` : `???: ${label}`;
      list.appendChild(li);
    }
    wrapper.appendChild(list);
    return wrapper;
  }

  /** 難易度モード(plan/difficulty-modes.md)。次回のダイブから反映される */
  private renderDifficulty(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "town-col";
    if (this.column === 10) wrapper.classList.add("active");

    const heading = document.createElement("div");
    heading.className = "town-col-title";
    heading.textContent = "難易度";
    wrapper.appendChild(heading);

    const list = document.createElement("ul");
    DIFFICULTY_MODES.forEach((mode, index) => {
      const li = document.createElement("li");
      li.textContent = DIFFICULTY_NAMES[mode];
      if (this.column === 10 && index === this.difficultyIndex) li.classList.add("selected");
      list.appendChild(li);
    });
    wrapper.appendChild(list);
    return wrapper;
  }

  /**
   * 複数のダンジョン(plan/multiple-dungeons.md)。どの寝穴に潜るかを選ぶ。
   * 未解放のものも一覧に表示し、解放条件を添える(選ぶことはできない)。
   */
  private renderDungeons(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "town-col";
    if (this.column === 12) wrapper.classList.add("active");

    const heading = document.createElement("div");
    heading.className = "town-col-title";
    heading.textContent = "潜るダンジョン";
    wrapper.appendChild(heading);

    const deepest = this.save?.deepest ?? 0;
    const unlocked = this.unlockedDungeons();
    const list = document.createElement("ul");
    DUNGEONS.forEach((dungeon) => {
      const li = document.createElement("li");
      if (isDungeonUnlocked(dungeon, deepest)) {
        li.textContent = dungeon.name;
        if (this.column === 12 && unlocked[this.dungeonIndex]?.id === dungeon.id) {
          li.classList.add("selected");
        }
      } else {
        const need = dungeon.unlock === "always" ? 0 : dungeon.unlock.minDeepest;
        li.textContent = `${dungeon.name}(未解放: 最深${need}階到達で解放)`;
      }
      list.appendChild(li);
    });
    wrapper.appendChild(list);
    return wrapper;
  }

  /** 依頼板(plan/quest-board.md)の一覧行。貼り出し中(offer)→受注中(active)の順に並ぶ */
  private questBoardRows(): { defId: string; status: "offer" | "active" }[] {
    const save = this.save;
    if (!save) return [];
    return [
      ...save.boardOffers.map((defId) => ({ defId, status: "offer" as const })),
      ...save.activeQuests.map((q) => ({ defId: q.defId, status: "active" as const })),
    ];
  }

  /**
   * 依頼板(plan/quest-board.md)。貼り出されている依頼と受注中の依頼を一覧表示する。
   * Enterで受注/取り下げ。護送(護衛対象を連れて帰る)系の依頼は、非戦闘の仲間演出が
   * 無いため未実装(design/plan双方に記載)。
   */
  private renderQuestBoard(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "town-col";
    if (this.column === 11) wrapper.classList.add("active");

    const heading = document.createElement("div");
    heading.className = "town-col-title";
    heading.textContent = "依頼板";
    wrapper.appendChild(heading);

    const rows = this.questBoardRows();
    const summary = document.createElement("p");
    summary.textContent = `受注中 ${this.save?.activeQuests.length ?? 0} / ${MAX_ACTIVE_QUESTS} 件`;
    wrapper.appendChild(summary);

    const list = document.createElement("ul");
    if (rows.length === 0) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "貼り出されている依頼が無い";
      list.appendChild(li);
    }
    rows.forEach((row, index) => {
      const def = questDef(row.defId);
      if (!def) return;
      const reward = def.reward.gold ? `報酬${def.reward.gold}G` : "報酬あり";
      const li = document.createElement("li");
      li.textContent =
        row.status === "active"
          ? `[受注中] ${def.name}(${reward})`
          : `${def.name}(${reward})`;
      if (this.column === 11 && index === this.questCursor) li.classList.add("selected");
      list.appendChild(li);
    });
    wrapper.appendChild(list);
    return wrapper;
  }

  /**
   * 村の発展(plan/village-development.md)。現在の段階と、次の段階の条件
   * (最深到達記録・ゴールド)を表示する。Enterで条件を満たしていれば発展させる
   */
  private renderVillage(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "town-col";
    if (this.column === 13) wrapper.classList.add("active");

    const heading = document.createElement("div");
    heading.className = "town-col-title";
    heading.textContent = "村の発展";
    wrapper.appendChild(heading);

    const save = this.save;
    const stage = save?.villageStage ?? 1;
    const summary = document.createElement("p");
    summary.textContent = `段階 ${stage} / 4 ・ ねむり小屋 最大${hutCapacity(stage)}体`;
    wrapper.appendChild(summary);

    const list = document.createElement("ul");
    VILLAGE_STAGE_REQUIREMENTS.forEach((requirement) => {
      const li = document.createElement("li");
      const done = stage >= requirement.stage;
      li.textContent = done
        ? `${requirement.label}(達成)`
        : `${requirement.label}: 最深${requirement.minDeepest}階到達・${requirement.cost}G`;
      list.appendChild(li);
    });
    wrapper.appendChild(list);

    if (save && canDevelopVillage(stage, save.deepest, save.gold)) {
      const ready = document.createElement("p");
      ready.className = "selected";
      ready.textContent = "Enterで発展させられる!";
      wrapper.appendChild(ready);
    }
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
