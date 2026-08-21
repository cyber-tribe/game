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
  MAX_MARK_SLOTS,
  MAX_PLUS,
  OVERLAY_STONE_DEF_ID,
  OVERLAY_STONE_DUST_COST,
  hokoraDustCost,
  markDef,
} from "../entities/forging";
import { COSTUMES, type CostumeDef } from "../entities/costumes";
import {
  DUNGEONS,
  type DungeonDef,
  HINATA_ID,
  TARUKURABE_ID,
  TRUE_AWAKENING_ID,
  dungeonById,
  isDungeonUnlocked,
  regionIndexForDungeonId,
} from "../entities/dungeons";
import { dialogueContext, dialoguePoolFor } from "../entities/dialogue";
import { FESTIVAL_SHOP_OFFERS, isTarukurabeDay, isYoimatsuri } from "../entities/festivals";
import { LOCALES, type LocaleId, t } from "../i18n";
import { moodForDate } from "../entities/moods";
import { MAX_ALLIES, type TrainingFocus } from "../entities/player";
import { todayKey } from "../entities/quests";
import { KEY_REFERENCE, KEY_REFERENCE_TOUCH, MESSAGE_SPEEDS, type MessageSpeed } from "../entities/settings";
import { SPECIES, speciesById } from "../entities/species";
import { TUTORIAL_TIP_IDS, tutorialTipText } from "../core/tutorial";
import { resolveText } from "../entities/inputText";
import { currentInputMode } from "./inputMode";
import { DEFAULT_AUDIO_VOLUME, isCompendiumComplete, isTrueAwakeningUnlocked, isWeaponCompendiumComplete, type CompendiumStatus, type FontSize, type SaveData, type StoredItem, type StoredMonster } from "../save";
import { ITEMS, itemDef } from "../items/catalog";
import { MAX_ACTIVE_QUESTS, questDef } from "../entities/quests";
import { storyChapter } from "../entities/story";
import {
  VILLAGE_STAGE_REQUIREMENTS,
  canDevelopVillage,
  hutCapacity,
  nextVillageStageRequirement,
  visibleVillageNpcs,
  type VillageNpcId,
} from "../entities/village";
import { wrap } from "./util";
import { nextTownColumn, type TownColumn } from "./townCursor";

/** ダンジョンに持ち込める数。全部持って行けたら倉庫に預ける意味がない */
export const CARRY_LIMIT = 8;

/**
 * 村のメニューを建物・村人ごとの役割に分ける
 * (plan/game/archive/village-scoped-menus.md)。
 *
 * 従来どおり全20列を一直線に並べる既定値。`show()`にopenColumnsを渡さない
 * 呼び出し(テスト等)はこれで動く
 */
export const ALL_TOWN_COLUMNS: readonly TownColumn[] = [
  0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
];

/**
 * システム系の列(世界の中の場所ではなく、ゲームの外の設定)。どの建物からも
 * 開けず、村でもダイブ中でも開ける「≡」メニュー経由(`main.ts`の
 * `openSystemMenu`)でだけ開く
 */
export const SYSTEM_TOWN_COLUMNS: readonly TownColumn[] = [14, 18, 19];

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
  /** 0=倉庫 1=持ち込み (2=欠番。出発地点の列はplan/game/archive/remove-checkpoint-start.mdで廃止) 3=鍛え方 4=つれていく仲間 5=ゲンドの工房 6=記録の間 7=モンスター図鑑 8=実績帳 9=装備図鑑 10=難易度 11=依頼板 12=潜るダンジョン 13=村の発展 14=アクセシビリティ 15=身支度 16=NPCと話す(plan/village-life.md) 17=宵祭りの出店(plan/yoimatsuri-festival.md) 18=音(plan/audio-playback.md) 19=設定(plan/settings-screen.md) */
  private column: TownColumn = 0;
  /**
   * 村のメニューを建物・村人ごとの役割に分ける
   * (plan/game/archive/village-scoped-menus.md)。左右キーの移動先を
   * この集合の中だけに限る(`townCursor.ts`のnextTownColumnへ渡す)。
   * `renderColumn(N, ...)`自体は変えず、どの列が実際にDOMへ現れるか
   * (render()内)と、移動できる範囲だけをこれで絞る
   */
  private openColumns: readonly TownColumn[] = ALL_TOWN_COLUMNS;
  /** 開いている建物・場所の見出し(建物名)。省略時(全列を開く従来呼び出し)はnull */
  private heading: string | null = null;
  /**
   * システム系の列(アクセシビリティ・音・設定)専用の「≡」メニューとして
   * 開いているか。trueのあいだはSpaceキー・「もぐる」ボタンでの即時出発を
   * 止める(ダイブ中に「≡」から設定を開いただけで、現在の潜行を打ち切って
   * 新しいダイブを始めてしまう事故を防ぐ)。Escapeで呼び出し元へ戻る
   */
  private systemMenuMode = false;
  /** systemMenuMode(またはあとで追加する他の非出発モード)を閉じたときに呼ぶ */
  private onCloseWithoutDeparting: (() => void) | null = null;

  /**
   * Space=即時出発(もぐる)が効くスコープか(issue #609)。
   *
   * 潜るダンジョンの列(12)を開くのは「出発の支度」(洞窟の入口)だけ
   * なので、その有無で判定する。倉庫だけ・広場(NPCと話す)・図鑑などの
   * 建物スコープでは、決定(Space)を出発として解釈しない。会話を進めようと
   * 決定ボタンを押しただけでダイブが始まる事故を防ぐ
   */
  private get canDepart(): boolean {
    return !this.systemMenuMode && this.openColumns.includes(12);
  }
  private cursor: [number, number] = [0, 0];
  private storage: StoredItem[] = [];
  private carry: StoredItem[] = [];
  private save: SaveData | null = null;
  /** このダイブの鍛え方。前回選んだ方針を引き継いで開く */
  private trainingFocusIndex = TRAINING_FOCI.indexOf("balance");
  /** 難易度モード(plan/difficulty-modes.md)。前回選んだものを引き継いで開く */
  private difficultyIndex = DIFFICULTY_MODES.indexOf("normal");
  /** 複数のダンジョン(plan/multiple-dungeons.md)。解放済みダンジョン一覧(unlockedDungeons())の中でのカーソル位置 */
  private dungeonIndex = 0;
  /** 衣装(plan/costumes.md)の一覧上のカーソル位置(COSTUMES配列のインデックス) */
  private costumeCursor = 0;
  /** ねむり小屋の一覧上のカーソル位置 */
  private hutCursor = 0;
  /** モンスター図鑑(plan/monster-compendium.md)の一覧上のカーソル位置 */
  private compendiumCursor = 0;
  /**
   * 図鑑ギャラリー(plan/gallery-mode.md)。表示中は`gallerySpeciesId`ゲッターが
   * カーソル位置の種族idを返し、main.ts側がダンジョンの代わりに3D表示を差し替える
   */
  private galleryOpen = false;
  /** 連れて行く仲間として選んだ、ねむり小屋のuid(最大 MAX_ALLIES 体) */
  private bringUids: number[] = [];
  /** 夢あわせ(plan/monster-fusion.md)で、軸として選んで確定した個体。まだ無ければ null */
  private fusionAxisUid: number | null = null;
  /** 夢に還す(plan/release-companion.md)の確認待ちの個体。確認中(サブメニュー表示中)のみ非null */
  private releaseConfirmUid: number | null = null;
  /**
   * お気に入りロック(plan/companion-favorite-lock.md)により直前の操作が
   * 拒否されたときの理由メッセージ。次の操作で自動的にクリアされる
   */
  private favoriteNotice: string | null = null;
  /** ゲンドの工房(plan/equipment-forging.md)の一覧上のカーソル位置 */
  private workshopCursor = 0;
  /** 印を刻む対象として選んでいる装備。選択中(サブメニュー表示中)のみ非null */
  private workshopMarkTarget: StoredItem | null = null;
  /** 印刻みの候補一覧(倉庫にある刻印石ぶんだけ)。サブメニュー表示中のみ非null */
  private workshopMarkChoices: MarkId[] | null = null;
  private workshopMarkCursor = 0;
  /** 開いている印刻み候補が、2つ目の枠を埋めるためのものか(plan/dual-mark-equipment.md) */
  private workshopMarkAddingSecond = false;
  /** 重ね刻みの砥石(plan/dual-mark-equipment.md)の合成候補。サブメニュー表示中のみ非null */
  private workshopSynthesisChoices: MarkId[] | null = null;
  private workshopSynthesisCursor = 0;
  /** 村の暮らし(plan/village-life.md)。NPC一覧上のカーソル位置(visibleVillageNpcsの中での位置) */
  private npcIndex = 0;
  /**
   * NPCサイドストーリー第1弾(plan/side-stories-part1.md)。話しかけて
   * 新たに解放された一言。次に別のNPCを選ぶ・列を離れるとクリアされる
   */
  private npcTalkMessage: string | null = null;
  /** 宵祭りの出店(plan/yoimatsuri-festival.md)。品揃え一覧上のカーソル位置 */
  private festivalShopCursor = 0;
  /**
   * NPCのせりふプール(plan/flavor-and-dialogue.md)。直前に表示した
   * lines上のインデックスをNPCごとに覚えておき、同じ文言が連続しない
   * ようにする。セーブしない、セッション内だけの状態
   */
  private readonly lastDialogueLineIndex = new Map<string, number>();
  /** 現在表示中の抽選済みの一言。表示中のNPCが変わるまで固定する(描画のたびに再抽選しない) */
  private currentDialogueLine: string | null = null;
  private currentDialogueNpcId: string | null = null;
  /** 小ネタ・遊び心(plan/flavor-and-dialogue.md): ゲンドの工房で+9まで鍛えた直後だけ出る一言 */
  private workshopMaxPlusNotice: string | null = null;
  private depart:
    | ((
        carry: StoredItem[],
        storage: StoredItem[],
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
  private onToggleFavorite: ((uid: number) => void) | null = null;
  private onDevelopVillage: (() => void) | null = null;
  private onSetFontSize: ((fontSize: FontSize) => void) | null = null;
  private onEquipCostume: ((costumeId: string) => void) | null = null;
  /** 村の暮らし(plan/village-life.md)。NPCと話す */
  private onTalkToNpc: ((npcId: VillageNpcId) => void) | null = null;
  /** 村の暮らし(plan/village-life.md)。素材を献上して絆を上げる */
  private onGiftMaterial: ((npcId: VillageNpcId, defId: string) => void) | null = null;
  /** バグ報告ボタン(plan/bug-report-button.md) */
  private onReportBug: (() => void) | null = null;
  /** 宵祭りの出店(plan/yoimatsuri-festival.md) */
  private onBuyFestivalItem: ((defId: string) => void) | null = null;
  /** サウンド再生(plan/audio-playback.md) */
  private onSetAudioMuted: ((muted: boolean) => void) | null = null;
  private onSetAudioVolume: ((volume: number) => void) | null = null;
  /** サウンド再生: 音の設定列上のカーソル位置(0=ミュート、1=音量) */
  private audioSettingsCursor: 0 | 1 = 0;
  /** 設定画面(plan/settings-screen.md) */
  private onSetMessageSpeed: ((speed: MessageSpeed) => void) | null = null;
  /** 多言語対応の土台(plan/i18n-foundation.md) */
  private onSetSaveLocale: ((locale: LocaleId) => void) | null = null;
  /** 設定画面の一覧上のカーソル位置(0=メッセージ速度、1=操作説明、2=キー配置、3=げんご) */
  private settingsCursor: 0 | 1 | 2 | 3 = 0;
  /** 設定画面: 操作説明・キー配置確認を全件表示しているあいだだけ非null */
  private settingsSubView: "tutorialTips" | "keyReference" | null = null;
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
    onSetFontSize: (fontSize: FontSize) => void,
    onEquipCostume: (costumeId: string) => void,
    onTalkToNpc: (npcId: VillageNpcId) => void,
    onGiftMaterial: (npcId: VillageNpcId, defId: string) => void,
    onToggleFavorite: (uid: number) => void,
    onReportBug: () => void,
    onBuyFestivalItem: (defId: string) => void,
    onSetAudioMuted: (muted: boolean) => void,
    onSetAudioVolume: (volume: number) => void,
    onSetMessageSpeed: (speed: MessageSpeed) => void,
    onSetSaveLocale: (locale: LocaleId) => void,
    /**
     * 拠点の3D化(plan/town-3d-exploration.md)。村なかで近づいた建物に
     * 対応する列を開いた状態で表示する。省略時は常に0(倉庫)から始まる
     * 従来どおりの挙動
     */
    initialColumn = 0,
    /**
     * 建物・村人ごとの役割メニュー(plan/game/archive/village-scoped-menus.md)。
     * 左右キーで移動できる列をこの集合の中だけに限る。省略時(またはisOpen)は
     * 従来どおり全20列を一直線に横断できる。空配列は「列を持たない特別な
     * 場所」(旅の看板)を表し、代わりに`render()`が専用の掲示内容を出す
     */
    openColumns: readonly number[] = ALL_TOWN_COLUMNS,
    /** 開いている建物・場所の見出し(建物名)。省略時は見出し無し(従来どおり) */
    heading: string | null = null,
    /**
     * システム系の「≡」メニュー(アクセシビリティ・音・設定)として開いて
     * いるか。trueならSpaceキー・「もぐる」ボタンでの即時出発を止め、
     * Escapeで`onClose`を呼んで閉じる(ダイブ中に開いても現在の潜行を
     * 打ち切らない)
     */
    systemMenuMode = false,
    /** systemMenuMode(または列を持たない旅の看板)をEscapeで閉じたときに呼ぶ */
    onClose?: () => void,
  ): void {
    this.save = save;
    this.storage = save.storage.map((s) => ({ ...s }));
    this.carry = [];
    // 呼び出し元(main.ts)は素のnumberでbuilding.columns/SYSTEM_TOWN_COLUMNSを
    // 渡してくるため、ここで0〜19に丸めてTownColumnへ正規化する(重複も除く)
    this.openColumns = [
      ...new Set(openColumns.map((n) => Math.min(19, Math.max(0, Math.trunc(n))) as TownColumn)),
    ].sort((a, b) => a - b);
    this.heading = heading;
    this.systemMenuMode = systemMenuMode || this.openColumns.length === 0;
    this.onCloseWithoutDeparting = onClose ?? null;
    const clampedInitial = Math.min(19, Math.max(0, Math.trunc(initialColumn))) as TownColumn;
    this.column = (this.openColumns.includes(clampedInitial) ? clampedInitial : this.openColumns[0] ?? 0) as typeof this.column;
    this.cursor = [0, 0];
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
    this.favoriteNotice = null;
    this.workshopMaxPlusNotice = null;
    this.workshopCursor = 0;
    this.workshopMarkTarget = null;
    this.workshopMarkChoices = null;
    this.workshopMarkAddingSecond = false;
    this.workshopSynthesisChoices = null;
    this.npcIndex = 0;
    this.npcTalkMessage = null;
    this.depart = onDepart;
    this.onFuse = onFuse;
    this.onRename = onRename;
    this.onEquipTitle = onEquipTitle;
    this.onAcceptQuest = onAcceptQuest;
    this.onAbandonQuest = onAbandonQuest;
    this.onReleaseCompanion = onReleaseCompanion;
    this.onToggleFavorite = onToggleFavorite;
    this.onDevelopVillage = onDevelopVillage;
    this.onSetFontSize = onSetFontSize;
    this.onEquipCostume = onEquipCostume;
    this.onTalkToNpc = onTalkToNpc;
    this.onGiftMaterial = onGiftMaterial;
    this.onReportBug = onReportBug;
    this.onBuyFestivalItem = onBuyFestivalItem;
    this.onSetAudioMuted = onSetAudioMuted;
    this.onSetAudioVolume = onSetAudioVolume;
    this.audioSettingsCursor = 0;
    this.onSetMessageSpeed = onSetMessageSpeed;
    this.onSetSaveLocale = onSetSaveLocale;
    this.settingsCursor = 0;
    this.settingsSubView = null;
    this.festivalShopCursor = 0;
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
    this.favoriteNotice = null;
    this.render();
  }

  /**
   * NPCサイドストーリー第1弾(plan/side-stories-part1.md)。話しかけた結果、
   * 新たに解放された一言をmain.ts側から渡してもらい、NPCと話す列の説明欄に表示する
   */
  showNpcMessage(text: string): void {
    this.npcTalkMessage = text;
    this.render();
  }

  private hut(): StoredMonster[] {
    return this.save?.hut ?? [];
  }

  /** 章立て(plan/story-chapters.md) */
  private currentStoryChapter(): ReturnType<typeof storyChapter> {
    return storyChapter(this.save?.defeatedRegionBosses.length ?? 0, this.save?.storyCleared ?? false);
  }

  /**
   * 複数のダンジョン(plan/multiple-dungeons.md)。解放済みのものだけを選択できる。
   * 真の目覚め(plan/true-awakening.md、TRUE_AWAKENING_ID)は通常のunlock判定には
   * 乗せず(dungeons.tsのコメント参照)、isTrueAwakeningUnlockedを満たした
   * ときだけ末尾に追加する隠し要素として扱う。樽比べ(plan/tarukurabe-
   * minigame.md、TARUKURABE_ID)も同じ理由で除外し、isTarukurabeDayの日
   * だけ末尾に追加する。ひなたの寝穴(plan/game/tutorial-dungeon.md、HINATA_ID)
   * も同じ理由で除外し、踏破済み(hinataCleared)のときだけ再訪用に追加する
   * (未踏破の間は拠点の行き先選択そのものを経由しない自動誘導専用のため)
   */
  private unlockedDungeons(): DungeonDef[] {
    const deepest = this.save?.deepest ?? 0;
    const villageStage = this.save?.villageStage ?? 1;
    const foundPassageCount = this.save?.foundVaultPassages.length ?? 0;
    const defeatedRegionBosses = this.save?.defeatedRegionBosses ?? [];
    const hinataCleared = this.save?.hinataCleared ?? false;
    // 旧セーブとの互換(plan/game/tutorial-dungeon.md): ひなたの寝穴の追加より前から
    // 実際にダイブしていた(runs>0)セーブは、ひなたの寝穴を経験していなくても
    // 第一地方まで到達済みのはずなので、第一地方をロックしない
    const region1Unlocked = hinataCleared || (this.save?.runs ?? 0) > 0;
    const normal = DUNGEONS.filter(
      (d) =>
        d.id !== TRUE_AWAKENING_ID &&
        d.id !== TARUKURABE_ID &&
        d.id !== HINATA_ID &&
        isDungeonUnlocked(d, deepest, villageStage, foundPassageCount, defeatedRegionBosses, region1Unlocked),
    );
    if (this.save && isTrueAwakeningUnlocked(this.save)) {
      normal.push(dungeonById(TRUE_AWAKENING_ID));
    }
    if (isTarukurabeDay(todayKey())) {
      normal.push(dungeonById(TARUKURABE_ID));
    }
    if (hinataCleared) {
      normal.push(dungeonById(HINATA_ID));
    }
    return normal;
  }

  /**
   * 図鑑ギャラリー(plan/gallery-mode.md)。表示中ならカーソル位置の種族idを返す。
   * main.ts側はこれを見て、ダンジョンの代わりにギャラリーの3D表示を描画する
   */
  get gallerySpeciesId(): string | null {
    if (!this.galleryOpen) return null;
    return SPECIES[this.compendiumCursor]?.id ?? null;
  }

  /** 図鑑ギャラリー表示中の種族の図鑑状態。"seen"ならシルエット表示にする */
  get galleryStatus(): CompendiumStatus | undefined {
    const species = SPECIES[this.compendiumCursor];
    if (!species || !this.save) return undefined;
    return this.save.compendium[species.id];
  }

  hide(): void {
    this.open = false;
    this.root.style.display = "none";
  }

  handleKey(code: string): boolean {
    if (!this.open) return false;

    // 図鑑ギャラリー(plan/gallery-mode.md)表示中は、閉じる操作だけを受け付ける。
    // Spaceも閉じる側に入れてあるのは、タッチUIの「決定」ボタンがSpaceを送るため。
    // タッチ端末にはEscもEnterも無いので、これが無いと開いたら戻れなくなる
    if (this.galleryOpen) {
      if (code === "Escape" || code === "Enter" || code === "NumpadEnter" || code === "Space") {
        this.galleryOpen = false;
        this.render();
        return true;
      }
      // 手動カメラ操作(plan/gallery-interactive-camera.md): Q/E(回転)・+/-(ズーム)は
      // ダンジョン内フォトモードと同じキーをそのまま流用するため、ここでは横取りせず
      // 既存のグローバル操作(main.tsのhandleGlobalAction)へ素通しする
      if (code === "KeyQ" || code === "KeyE" || code === "Equal" || code === "Minus") {
        return false;
      }
      return true;
    }

    // 設定画面(plan/settings-screen.md): 操作説明・キー配置確認を全件表示中は、閉じる操作だけを受け付ける
    if (this.settingsSubView) {
      // 読むだけの全件表示なので、旅の看板と同じくSpaceでも閉じられる(issue #483)
      if (
        code === "Escape" ||
        code === "Enter" ||
        code === "NumpadEnter" ||
        code === "Space"
      ) {
        this.settingsSubView = null;
        this.render();
      }
      return true;
    }

    // 旅の看板(plan/game/archive/village-scoped-menus.md): 列(0〜19)を
    // 1つも持たない特別な場所。掲示を読むだけで、列移動・出発は行わない
    if (this.openColumns.length === 0) {
      // 読むだけの掲示なので、Spaceも閉じる側でよい(issue #483)。ここには
      // 「もぐる」が無いため、図鑑ギャラリーと同じくタッチの「決定」でも閉じられる
      if (
        code === "Escape" ||
        code === "Enter" ||
        code === "NumpadEnter" ||
        code === "Space"
      ) {
        this.hide();
        this.onCloseWithoutDeparting?.();
      }
      return true;
    }

    // システム系の「≡」メニュー(アクセシビリティ・音・設定)として開いている
    // あいだは、Spaceキーでの即時出発を止める(ダイブ中に「≡」から設定を
    // 開いただけで、現在の潜行を打ち切って新しいダイブを始めてしまう事故を
    // 防ぐ)。Escapeで呼び出し元(村なか歩き、またはダイブの続き)へ戻る
    if (this.systemMenuMode) {
      if (code === "Escape") {
        this.hide();
        this.onCloseWithoutDeparting?.();
        return true;
      }
      if (code === "Space") return true;
    }

    // 出発の支度(洞窟の入口)以外の建物スコープでは、Spaceを確定(Enter)として
    // 読み替える(issue #609)。広場の「NPCと話す」で会話を進めようと決定ボタン
    // (=Space)を押しただけでダイブが始まってしまっていた。各列のswitchにある
    // case "Space": departNow() はそのまま残っているが、ここで読み替えるため
    // このスコープでは到達しない
    if (code === "Space" && !this.canDepart) code = "Enter";

    // 建物ごとのメニュー(列を持つ)をEscapeで閉じて村へ戻る(issue #483)。
    //
    // ここまで「Escapeで戻れる」のは旅の看板と「≡」メニューだけで、倉庫・
    // 工房・洞窟の入口などの列を持つメニューには閉じる道が無かった。出口は
    // 「もぐる」(出発)しかなく、キーボードでもEscapeが列ごとのswitchの
    // defaultに吸われて何も起きない。タッチでは「決定」がSpace=もぐるなので、
    // 戻ろうとして出発してしまう事故にもなっていた。
    //
    // 選択の途中(仲間を逃がす確認・夢あわせの相手選び・工房の印/合成選び)は
    // それぞれEscapeを「その選択の取り消し」に使っているので、そちらを優先する
    if (
      code === "Escape" &&
      this.releaseConfirmUid === null &&
      this.fusionAxisUid === null &&
      this.workshopMarkChoices === null &&
      this.workshopSynthesisChoices === null
    ) {
      this.hide();
      this.onCloseWithoutDeparting?.();
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
          this.column = nextTownColumn(this.column, -1, this.openColumns);
          break;
        case "ArrowRight":
        case "KeyD":
          this.column = nextTownColumn(this.column, 1, this.openColumns);
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
          this.favoriteNotice = null;
          this.hutCursor = wrap(this.hutCursor - 1, hut.length);
          break;
        case "ArrowDown":
        case "KeyS":
          this.favoriteNotice = null;
          this.hutCursor = wrap(this.hutCursor + 1, hut.length);
          break;
        case "ArrowLeft":
        case "KeyA":
          this.fusionAxisUid = null;
          this.favoriteNotice = null;
          this.column = nextTownColumn(this.column, -1, this.openColumns);
          break;
        case "ArrowRight":
        case "KeyD":
          this.favoriteNotice = null;
          this.column = nextTownColumn(this.column, 1, this.openColumns);
          break;
        case "Enter":
        case "NumpadEnter":
          this.toggleBring(hut[this.hutCursor]?.uid);
          break;
        case "KeyM":
          this.favoriteNotice = null;
          this.pickForFusion(hut[this.hutCursor]?.uid);
          break;
        case "KeyN": {
          const target = hut[this.hutCursor];
          if (target) this.onRename?.(target.uid, target.nickname);
          return true;
        }
        case "KeyF": {
          // お気に入りロック(plan/companion-favorite-lock.md)の切り替え
          const target = hut[this.hutCursor];
          if (target) this.onToggleFavorite?.(target.uid);
          return true;
        }
        case "KeyX": {
          this.favoriteNotice = null;
          const target = hut[this.hutCursor];
          if (target?.favorite) {
            this.favoriteNotice = "お気に入りに設定されているため、夢に還せない。先にお気に入りを外すこと。";
            break;
          }
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
          this.column = nextTownColumn(this.column, -1, this.openColumns);
          break;
        case "ArrowRight":
        case "KeyD":
          this.column = nextTownColumn(this.column, 1, this.openColumns);
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
        case "ArrowUp":
        case "KeyW":
          this.compendiumCursor = wrap(this.compendiumCursor - 1, SPECIES.length);
          break;
        case "ArrowDown":
        case "KeyS":
          this.compendiumCursor = wrap(this.compendiumCursor + 1, SPECIES.length);
          break;
        case "ArrowLeft":
        case "KeyA":
          this.column = nextTownColumn(this.column, -1, this.openColumns);
          break;
        case "ArrowRight":
        case "KeyD":
          this.column = nextTownColumn(this.column, 1, this.openColumns);
          break;
        case "Enter":
        case "NumpadEnter": {
          // 図鑑ギャラリー(plan/gallery-mode.md): 一度でも見た種族だけ眺められる
          const species = SPECIES[this.compendiumCursor];
          if (species && this.save?.compendium[species.id]) this.galleryOpen = true;
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
          this.column = nextTownColumn(this.column, -1, this.openColumns);
          break;
        case "ArrowRight":
        case "KeyD":
          this.column = nextTownColumn(this.column, 1, this.openColumns);
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
          this.column = nextTownColumn(this.column, -1, this.openColumns);
          break;
        case "ArrowRight":
        case "KeyD":
          this.column = nextTownColumn(this.column, 1, this.openColumns);
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
          this.column = nextTownColumn(this.column, -1, this.openColumns);
          break;
        case "ArrowRight":
        case "KeyD":
          this.column = nextTownColumn(this.column, 1, this.openColumns);
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
          this.column = nextTownColumn(this.column, -1, this.openColumns);
          break;
        case "ArrowRight":
        case "KeyD":
          this.column = nextTownColumn(this.column, 1, this.openColumns);
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
          this.column = nextTownColumn(this.column, -1, this.openColumns);
          break;
        case "ArrowRight":
        case "KeyD":
          this.column = nextTownColumn(this.column, 1, this.openColumns);
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
          this.column = nextTownColumn(this.column, -1, this.openColumns);
          break;
        case "ArrowRight":
        case "KeyD":
          this.column = nextTownColumn(this.column, 1, this.openColumns);
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

    if (this.column === 14) {
      switch (code) {
        case "ArrowLeft":
        case "KeyA":
          this.column = nextTownColumn(this.column, -1, this.openColumns);
          break;
        case "ArrowRight":
        case "KeyD":
          this.column = nextTownColumn(this.column, 1, this.openColumns);
          break;
        case "Enter":
        case "NumpadEnter": {
          const next: FontSize = this.save?.fontSize === "large" ? "normal" : "large";
          this.onSetFontSize?.(next);
          break;
        }
        case "KeyB":
          this.onReportBug?.();
          return true;
        case "Space":
          this.departNow();
          return true;
        default:
          return true;
      }
      this.render();
      return true;
    }

    if (this.column === 15) {
      switch (code) {
        case "ArrowUp":
        case "KeyW":
          this.costumeCursor = wrap(this.costumeCursor - 1, COSTUMES.length);
          break;
        case "ArrowDown":
        case "KeyS":
          this.costumeCursor = wrap(this.costumeCursor + 1, COSTUMES.length);
          break;
        case "ArrowLeft":
        case "KeyA":
          this.column = nextTownColumn(this.column, -1, this.openColumns);
          break;
        case "ArrowRight":
        case "KeyD":
          this.column = nextTownColumn(this.column, 1, this.openColumns);
          break;
        case "Enter":
        case "NumpadEnter": {
          const costume = COSTUMES[this.costumeCursor];
          if (costume && this.save?.unlockedCostumes.includes(costume.id)) {
            this.onEquipCostume?.(costume.id);
          }
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

    if (this.column === 16) {
      const npcs = visibleVillageNpcs(this.currentStoryChapter());
      switch (code) {
        case "ArrowUp":
        case "KeyW":
          this.npcIndex = wrap(this.npcIndex - 1, npcs.length);
          this.npcTalkMessage = null;
          break;
        case "ArrowDown":
        case "KeyS":
          this.npcIndex = wrap(this.npcIndex + 1, npcs.length);
          this.npcTalkMessage = null;
          break;
        case "ArrowLeft":
        case "KeyA":
          this.column = nextTownColumn(this.column, -1, this.openColumns);
          this.npcTalkMessage = null;
          break;
        case "ArrowRight":
        case "KeyD":
          this.column = nextTownColumn(this.column, 1, this.openColumns);
          this.npcTalkMessage = null;
          break;
        case "Enter":
        case "NumpadEnter": {
          // NPCサイドストーリー第1弾(plan/side-stories-part1.md)。新たに解放
          // された一言があれば、main.ts側からshowNpcMessageで戻ってくる
          const npc = npcs[this.npcIndex];
          if (npc) this.onTalkToNpc?.(npc.id);
          break;
        }
        case "KeyG": {
          // 素材の献上(design/village-life.md)。倉庫にある最初の素材(ほこら粉・刻印石)を渡す
          const npc = npcs[this.npcIndex];
          const markStoneDefIds = new Set(Object.values(MARK_STONE_DEF_ID));
          const giftable = this.storage.find(
            (item) => item.defId === HOKORA_DUST_DEF_ID || markStoneDefIds.has(item.defId),
          );
          if (npc && giftable) this.onGiftMaterial?.(npc.id, giftable.defId);
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

    if (this.column === 17) {
      switch (code) {
        case "ArrowUp":
        case "KeyW":
          this.festivalShopCursor = wrap(this.festivalShopCursor - 1, FESTIVAL_SHOP_OFFERS.length);
          break;
        case "ArrowDown":
        case "KeyS":
          this.festivalShopCursor = wrap(this.festivalShopCursor + 1, FESTIVAL_SHOP_OFFERS.length);
          break;
        case "ArrowLeft":
        case "KeyA":
          this.column = nextTownColumn(this.column, -1, this.openColumns);
          break;
        case "ArrowRight":
        case "KeyD":
          this.column = nextTownColumn(this.column, 1, this.openColumns);
          break;
        case "Enter":
        case "NumpadEnter": {
          const offer = FESTIVAL_SHOP_OFFERS[this.festivalShopCursor];
          if (offer) this.onBuyFestivalItem?.(offer.defId);
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

    if (this.column === 18) {
      switch (code) {
        case "ArrowUp":
        case "KeyW":
        case "ArrowDown":
        case "KeyS":
          this.audioSettingsCursor = this.audioSettingsCursor === 0 ? 1 : 0;
          break;
        case "ArrowLeft":
        case "KeyA":
          this.column = nextTownColumn(this.column, -1, this.openColumns);
          break;
        case "ArrowRight":
        case "KeyD":
          this.column = nextTownColumn(this.column, 1, this.openColumns);
          break;
        case "Enter":
        case "NumpadEnter": {
          if (this.audioSettingsCursor === 0) {
            this.onSetAudioMuted?.(!(this.save?.audioMuted ?? false));
          } else {
            const current = this.save?.audioVolume ?? DEFAULT_AUDIO_VOLUME;
            const stepped = Math.round((current + 0.1) * 10) / 10;
            this.onSetAudioVolume?.(stepped > 1 ? 0 : stepped);
          }
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

    if (this.column === 19) {
      switch (code) {
        case "ArrowUp":
        case "KeyW":
          this.settingsCursor = wrap(this.settingsCursor - 1, 4) as 0 | 1 | 2 | 3;
          break;
        case "ArrowDown":
        case "KeyS":
          this.settingsCursor = wrap(this.settingsCursor + 1, 4) as 0 | 1 | 2 | 3;
          break;
        case "ArrowLeft":
        case "KeyA":
          this.column = nextTownColumn(this.column, -1, this.openColumns);
          break;
        case "Enter":
        case "NumpadEnter": {
          if (this.settingsCursor === 0) {
            const speeds = MESSAGE_SPEEDS;
            const idx = speeds.indexOf(this.save?.messageSpeed ?? "normal");
            this.onSetMessageSpeed?.(speeds[(idx + 1) % speeds.length]!);
          } else if (this.settingsCursor === 1) {
            this.settingsSubView = "tutorialTips";
          } else if (this.settingsCursor === 2) {
            this.settingsSubView = "keyReference";
          } else {
            // 多言語対応の土台(plan/i18n-foundation.md): 第1段階時点はLOCALESが"ja"のみのため、
            // 骨格として1周するだけの切り替えになる
            const locales = LOCALES;
            const idx = locales.indexOf(this.save?.locale ?? "ja");
            this.onSetSaveLocale?.(locales[(idx + 1) % locales.length]!);
          }
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
        this.column = nextTownColumn(this.column, -1, this.openColumns);
        break;
      case "ArrowRight":
      case "KeyD":
        this.column = nextTownColumn(column, 1, this.openColumns);
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
    if (uid !== this.fusionAxisUid) {
      // お気に入りロック(plan/companion-favorite-lock.md): 糧側だけを禁止する
      const food = this.hut().find((m) => m.uid === uid);
      if (food?.favorite) {
        this.favoriteNotice = "お気に入りに設定されているため、糧にはできない。先にお気に入りを外すこと。";
      } else {
        this.onFuse?.(this.fusionAxisUid, uid);
      }
    }
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
          this.workshopMarkAddingSecond = false;
          break;
        default:
          return true;
      }
      this.render();
      return true;
    }

    if (this.workshopSynthesisChoices) {
      switch (code) {
        case "ArrowUp":
        case "KeyW":
          this.workshopSynthesisCursor = wrap(this.workshopSynthesisCursor - 1, this.workshopSynthesisChoices.length);
          break;
        case "ArrowDown":
        case "KeyS":
          this.workshopSynthesisCursor = wrap(this.workshopSynthesisCursor + 1, this.workshopSynthesisChoices.length);
          break;
        case "Enter":
        case "NumpadEnter":
          this.confirmSynthesis();
          break;
        case "Escape":
          this.workshopSynthesisChoices = null;
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
        this.workshopMaxPlusNotice = null;
        break;
      case "ArrowDown":
      case "KeyS":
        this.workshopCursor = wrap(this.workshopCursor + 1, targets.length);
        this.workshopMaxPlusNotice = null;
        break;
      case "ArrowLeft":
      case "KeyA":
        this.column = nextTownColumn(this.column, -1, this.openColumns);
        this.workshopMaxPlusNotice = null;
        break;
      case "ArrowRight":
      case "KeyD":
        this.column = nextTownColumn(this.column, 1, this.openColumns);
        this.workshopMaxPlusNotice = null;
        break;
      case "Enter":
      case "NumpadEnter":
        this.forgeSelected(targets[this.workshopCursor]);
        break;
      case "KeyM":
        this.openImprintChoices(targets[this.workshopCursor]);
        break;
      case "KeyC":
        // 重ね刻みの砥石を合成する(plan/dual-mark-equipment.md)
        this.openSynthesisChoices();
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
    // 小ネタ・遊び心(plan/flavor-and-dialogue.md): ゲンドの+9装備を見せたときの専用の一言。
    // DialoguePoolの仕組みには乗せない、独立したイベント的な一言
    if (target.plus >= MAX_PLUS) {
      this.workshopMaxPlusNotice = "ゲンド「おお、こいつは……見事なもんだ。ここまで仕上げたのは大したもんだぜ」";
    }
  }

  /**
   * すでに+9かつ1つ目の印を持ち、重ね刻みの砥石も持っているか
   * (plan/dual-mark-equipment.md: 2つ目の刻印を可能にする条件)
   */
  private eligibleForSecondMark(target: StoredItem): boolean {
    const existing = target.markIds ?? [];
    return (
      existing.length === 1 &&
      (target.plus ?? 0) >= MAX_PLUS &&
      this.countMaterial(OVERLAY_STONE_DEF_ID) >= 1
    );
  }

  /**
   * 印を刻む: 対象の部位(武器/盾)に合う印のうち、倉庫にある刻印石ぶんだけ選べる。
   * すでに2枠(plan/dual-mark-equipment.md)埋まっていれば何もしない。1枠目が
   * 埋まっていて2枠目の条件を満たしていれば、既にある印を除いた候補から2枠目を
   * 選ばせる(重複禁止)。それ以外(0枠、または条件未達の1枠)は従来通り
   * 1枠目を選び直させる(既にある印は上書きされる)
   */
  private openImprintChoices(target: StoredItem | undefined): void {
    if (!target) return;
    const category = itemDef(target.defId).category;
    const slot = category === "weapon" ? "weapon" : category === "shield" ? "shield" : null;
    if (!slot) return;
    const existing = target.markIds ?? [];
    if (existing.length >= MAX_MARK_SLOTS) return;
    const addingSecond = this.eligibleForSecondMark(target);
    const owned = MARKS.filter(
      (m) =>
        m.slot === slot &&
        this.countMaterial(MARK_STONE_DEF_ID[m.id]) > 0 &&
        !(addingSecond && existing.includes(m.id)),
    );
    if (owned.length === 0) return;
    this.workshopMarkTarget = target;
    this.workshopMarkChoices = owned.map((m) => m.id);
    this.workshopMarkCursor = 0;
    this.workshopMarkAddingSecond = addingSecond;
  }

  private confirmImprint(): void {
    const target = this.workshopMarkTarget;
    const choices = this.workshopMarkChoices;
    if (!target || !choices) return;
    const markId = choices[this.workshopMarkCursor];
    if (!markId) return;
    const addingSecond = this.workshopMarkAddingSecond;
    if (addingSecond && this.countMaterial(OVERLAY_STONE_DEF_ID) < 1) return;
    if (this.countMaterial(HOKORA_DUST_DEF_ID) < MARK_IMPRINT_DUST_COST) return;
    if (this.countMaterial(MARK_STONE_DEF_ID[markId]) < 1) return;
    this.consumeMaterial(HOKORA_DUST_DEF_ID, MARK_IMPRINT_DUST_COST);
    this.consumeMaterial(MARK_STONE_DEF_ID[markId], 1);
    if (addingSecond) {
      this.consumeMaterial(OVERLAY_STONE_DEF_ID, 1);
      target.markIds = [...(target.markIds ?? []), markId];
    } else {
      target.markIds = [markId];
    }
    this.workshopMarkChoices = null;
    this.workshopMarkTarget = null;
    this.workshopMarkAddingSecond = false;
  }

  /** 重ね刻みの砥石(plan/dual-mark-equipment.md)の合成候補: 同じ刻印石を2個以上持つ印だけ選べる */
  private openSynthesisChoices(): void {
    if (this.countMaterial(HOKORA_DUST_DEF_ID) < OVERLAY_STONE_DUST_COST) return;
    const eligible = MARKS.filter((m) => this.countMaterial(MARK_STONE_DEF_ID[m.id]) >= 2).map((m) => m.id);
    if (eligible.length === 0) return;
    this.workshopSynthesisChoices = eligible;
    this.workshopSynthesisCursor = 0;
  }

  private confirmSynthesis(): void {
    const choices = this.workshopSynthesisChoices;
    if (!choices) return;
    const markId = choices[this.workshopSynthesisCursor];
    if (!markId) return;
    if (this.countMaterial(MARK_STONE_DEF_ID[markId]) < 2) return;
    if (this.countMaterial(HOKORA_DUST_DEF_ID) < OVERLAY_STONE_DUST_COST) return;
    this.consumeMaterial(MARK_STONE_DEF_ID[markId], 2);
    this.consumeMaterial(HOKORA_DUST_DEF_ID, OVERLAY_STONE_DUST_COST);
    this.storage.push({ defId: OVERLAY_STONE_DEF_ID });
    this.workshopSynthesisChoices = null;
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
    const dungeon = this.unlockedDungeons()[this.dungeonIndex] ?? DUNGEONS[0]!;
    // 樽比べ(plan/tarukurabe-minigame.md): 持ち込み品・仲間は使い道が無い
    // 専用モードなので、選択中でも一切連れて行かせない(倉庫に留め置く)。
    // recordRun経由の「踏破時に持ち帰る」処理を樽比べでは呼ばないため、
    // ここで持ち出させないことが唯一のロスト防止策になる
    const isTarukurabe = dungeon.id === TARUKURABE_ID;
    const carry = isTarukurabe ? [] : this.carry.map((s) => ({ ...s }));
    const storage = (isTarukurabe ? [...this.storage, ...this.carry] : this.storage).map((s) => ({
      ...s,
    }));

    const trainingFocus = TRAINING_FOCI[this.trainingFocusIndex] ?? "balance";
    const difficulty = DIFFICULTY_MODES[this.difficultyIndex] ?? "normal";
    const bringAllyUids = isTarukurabe ? [] : [...this.bringUids];
    this.hide();
    depart?.(carry, storage, trainingFocus, bringAllyUids, difficulty, dungeon.id);
  }

  private render(): void {
    const save = this.save;
    if (!save) return;

    // 図鑑ギャラリー(plan/gallery-mode.md)表示中は、拠点のDOMを隠して
    // 3D表示だけを見せる(main.ts側がダンジョンの代わりに描画する)
    if (this.galleryOpen) {
      this.root.style.display = "none";
      return;
    }
    this.root.style.display = "flex";

    this.root.replaceChildren();

    // 旅の看板(plan/game/archive/village-scoped-menus.md): 列(0〜19)を
    // 1つも持たない特別な場所。0〜19の各列(renderColumn経由)は一切
    // 使わず、専用の掲示内容だけを出す
    if (this.openColumns.length === 0) {
      this.root.appendChild(this.renderSignpost());
      return;
    }

    const box = document.createElement("div");
    box.className = "town-box";

    const title = document.createElement("h2");
    title.textContent = "洞窟のふもと";
    box.appendChild(title);

    if (this.heading) {
      const buildingLine = document.createElement("p");
      buildingLine.className = "town-building";
      buildingLine.textContent = this.heading;
      box.appendChild(buildingLine);
    }

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

    // 建物・村人ごとの役割メニュー(plan/game/archive/village-scoped-menus.md):
    // this.openColumnsに含まれる列だけを並べる(renderColumn自体の中身は
    // 変えず、DOMへ現れる列を絞るだけ)
    const columns = document.createElement("div");
    columns.className = "town-columns";
    columns.append(...this.openColumns.map((n) => this.renderColumnByNumber(n)));
    box.appendChild(columns);

    const desc = document.createElement("p");
    desc.className = "town-desc";
    if (this.column === 3) {
      const focus = TRAINING_FOCI[this.trainingFocusIndex] ?? "balance";
      desc.textContent = TRAINING_FOCUS_DESCRIPTIONS[focus];
    } else if (this.column === 4) {
      desc.textContent =
        this.releaseConfirmUid !== null
          ? "この個体を夢に還す。取り消せない。よければEnter、やめるならEsc。"
          : this.favoriteNotice !== null
            ? this.favoriteNotice
            : this.fusionAxisUid === null
              ? `Enterで選択/解除(最大${MAX_ALLIES}体、0体なら手ぶらで出発)。Mで夢あわせの軸を選ぶ。Nで改名。Fでお気に入り。Xで夢に還す。`
              : "夢あわせ: 糧にする個体を選んでMで確定(軸は消えず、糧は消えて軸に溶け込む)。";
    } else if (this.column === 5) {
      const dust = this.countMaterial(HOKORA_DUST_DEF_ID);
      if (this.workshopMarkChoices) {
        const markId = this.workshopMarkChoices[this.workshopMarkCursor];
        const costNote = this.workshopMarkAddingSecond
          ? `ほこら粉${MARK_IMPRINT_DUST_COST}個+刻印石1個+重ね刻みの砥石1個を消費して、2つ目の印を刻む`
          : `ほこら粉${MARK_IMPRINT_DUST_COST}個+刻印石1個を消費。既にある印は上書きされる`;
        desc.textContent = markId ? `${markDef(markId).description}(${costNote})` : "";
      } else if (this.workshopSynthesisChoices) {
        const markId = this.workshopSynthesisChoices[this.workshopSynthesisCursor];
        desc.textContent = markId
          ? `${markDef(markId).name}の刻印石2個+ほこら粉${OVERLAY_STONE_DUST_COST}個を消費して、重ね刻みの砥石を1個作る。`
          : "";
      } else if (this.workshopMaxPlusNotice !== null) {
        desc.textContent = this.workshopMaxPlusNotice;
      } else {
        const target = this.workshopTargets()[this.workshopCursor];
        const plus = target?.plus ?? 0;
        const stones = this.countMaterial(OVERLAY_STONE_DEF_ID);
        desc.textContent = target
          ? `所持ほこら粉 ${dust}個・重ね刻みの砥石 ${stones}個。強化には${hokoraDustCost(plus)}個必要(${plus >= MAX_PLUS ? "上限に達した" : `次は+${plus + 1}`})。Mで印を刻む、Cで重ね刻みの砥石を合成する。`
          : "倉庫に武器・盾が無い。Cで重ね刻みの砥石を合成できる。";
      }
    } else if (this.column === 6) {
      desc.textContent = "見て楽しむだけの記録帳。攻略には関わらない。";
    } else if (this.column === 7) {
      const complete = this.save ? isCompendiumComplete(this.save) : false;
      const seenOrMore = this.save?.compendium[SPECIES[this.compendiumCursor]?.id ?? ""] !== undefined;
      desc.textContent = complete
        ? "図鑑が全種「捕まえた」で埋まった! かがやきの夢のかけらに出会いやすくなる。"
        : seenOrMore
          ? "見た・捕まえた種族の記録。Enterで図鑑ギャラリーを開いて眺められる。"
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
        ? `Enterで発展させる: ${requirement.label}(地方ボス${requirement.minRegionBossesDefeated}体撃破・${requirement.cost}G必要)`
        : "村はすでに最終段階まで発展している。";
    } else if (this.column === 14) {
      desc.textContent =
        "Enterでメッセージログ・メニューの文字サイズを切り替える。ダンジョン内ではHキーでいつでも操作説明を呼び出せる。";
    } else if (this.column === 15) {
      const costume = COSTUMES[this.costumeCursor];
      const unlocked = costume ? (this.save?.unlockedCostumes.includes(costume.id) ?? false) : false;
      desc.textContent = costume
        ? unlocked
          ? `Enterで身につける(戦闘には一切影響しない)。${costume.description}`
          : `まだ入手していない。${costume.description}`
        : "";
    } else if (this.column === 16) {
      const npc = visibleVillageNpcs(this.currentStoryChapter())[this.npcIndex];
      // NPCのせりふプール(plan/flavor-and-dialogue.md): 表示中のNPCが変わった
      // ときだけ抽選し直す(描画のたびに再抽選すると文言がちらつくため)
      if (npc && this.currentDialogueNpcId !== npc.id) {
        this.currentDialogueNpcId = npc.id;
        this.currentDialogueLine = this.rollDialogueLine(npc.id) ?? null;
      } else if (!npc) {
        this.currentDialogueNpcId = null;
        this.currentDialogueLine = null;
      }
      desc.textContent = this.npcTalkMessage ?? this.currentDialogueLine ?? (npc ? npc.role : "");
    } else if (this.column === 17) {
      const offer = FESTIVAL_SHOP_OFFERS[this.festivalShopCursor];
      desc.textContent = offer ? itemDef(offer.defId).description : "";
    } else if (this.column === 18) {
      desc.textContent =
        this.audioSettingsCursor === 0
          ? "Enterでミュートを切り替える。"
          : "Enterで音量を10%刻みで上げる(100%の次は0%に戻る)。";
    } else if (this.column === 19) {
      desc.textContent =
        this.settingsCursor === 0
          ? t("ui.settings.descSpeed")
          : this.settingsCursor === 1
            ? t("ui.settings.descTips")
            : this.settingsCursor === 2
              ? t("ui.settings.descKeys")
              : t("ui.settings.descLocale");
    } else {
      const selected = (this.column === 0 ? this.storage : this.carry)[this.cursor[this.column]];
      desc.textContent = selected ? itemDef(selected.defId).description : "";
    }
    box.appendChild(desc);

    // 小ネタ・遊び心(plan/flavor-and-dialogue.md): アイテムのflavorTextを、機能説明とは別の行に添える
    if (this.column === 0 || this.column === 1) {
      const selected = (this.column === 0 ? this.storage : this.carry)[this.cursor[this.column]];
      const flavorText = selected ? itemDef(selected.defId).flavorText : undefined;
      if (flavorText) {
        const flavor = document.createElement("p");
        flavor.className = "town-flavor";
        flavor.textContent = flavorText;
        box.appendChild(flavor);
      }
    }

    // サイドストーリー専用衣装のflavorText(plan/game/archive/side-story-item-flavor-text.md)。
    // アイテムと同じ「機能説明とは別の行」の見せ方をそろえる
    if (this.column === 15) {
      const flavorText = COSTUMES[this.costumeCursor]?.flavorText;
      if (flavorText) {
        const flavor = document.createElement("p");
        flavor.className = "town-flavor";
        flavor.textContent = flavorText;
        box.appendChild(flavor);
      }
    }

    const hint = document.createElement("p");
    hint.className = "town-hint";
    if (this.column === 4) {
      hint.textContent = this.releaseConfirmUid !== null
        ? "Enter 夢に還す(確定) / Esc やめる"
        : "←→ 列を移る / ↑↓ 選ぶ / Enter 選択・解除 / M 夢あわせ / N 改名 / F お気に入り / X 夢に還す / Space もぐる";
    } else if (this.column === 5) {
      hint.textContent = this.workshopMarkChoices
        ? "↑↓ 印を選ぶ / Enter 刻む / Esc もどる"
        : this.workshopSynthesisChoices
          ? "↑↓ 印を選ぶ / Enter 合成 / Esc もどる"
          : "←→ 列を移る / ↑↓ 選ぶ / Enter 強化(+1) / M 印を刻む / C 重ね刻みの砥石を合成 / Space もぐる";
    } else if (this.column === 6) {
      hint.textContent = "← 列を移る / Space もぐる";
    } else if (this.column === 16) {
      hint.textContent = "←→ 列を移る / ↑↓ 選ぶ / Enter 話す / G 素材を渡す(1日1回) / Space もぐる";
    } else if (this.column === 17) {
      hint.textContent = "←→ 列を移る / ↑↓ 選ぶ / Enter 買う / Space もぐる";
    } else if (this.column === 18) {
      hint.textContent = "←→ 列を移る / ↑↓ 選ぶ / Enter 切り替え・音量変更 / Space もぐる";
    } else if (this.column === 19) {
      hint.textContent = this.settingsSubView ? t("ui.settings.hintSubView") : t("ui.settings.hint");
    } else {
      hint.textContent = "←→ 列を移る / ↑↓ 選ぶ / Enter 移す / Space もぐる";
    }
    // 出発できないスコープ(issue #609: 出発の支度以外の建物、および
    // システム系の「≡」メニュー)では、「Space もぐる」の案内を落とす。
    // 実際の入力もhandleKey側でSpace=確定に読み替えている
    if (!this.canDepart) {
      hint.textContent = hint.textContent.replace(" / Space もぐる", "");
    }
    // システム系の「≡」メニュー(plan/game/archive/village-scoped-menus.md)では、
    // ダイブ中の潜行を打ち切ってしまわないようSpaceでの即時出発を止めている
    // (handleKey参照)。列ごとの説明文はそのまま活かしつつ、実際の閉じ方を補足する
    if (this.systemMenuMode) {
      hint.textContent = `${hint.textContent}(この画面ではSpaceは出発しない。Escapeで閉じる)`;
    }
    box.appendChild(hint);

    // タッチ操作向け(#308): 「Space もぐる」はどの列にいても効く共通操作だが、
    // キーボードが無いと押しようが無い。常時表示のボタンとして1つ置いておく
    // (ダンジョン内の「決定」ボタンは#townの不透明な背景の下に隠れて押せないため、
    // このTownScreen自身のDOM内に別途用意する)。ただしシステム系の「≡」メニュー
    // では出発そのものが意味を持たないため、代わりに閉じるボタンにする
    const departButton = document.createElement("button");
    departButton.type = "button";
    // 出発できないスコープ(システム系メニュー、および出発の支度以外の建物。
    // issue #609)では「もぐる」を出さず、閉じるボタンにする
    if (!this.canDepart) {
      departButton.className = "town-depart-button town-close-button";
      departButton.textContent = "とじる";
      departButton.addEventListener("click", () => {
        this.hide();
        this.onCloseWithoutDeparting?.();
      });
    } else {
      departButton.className = "town-depart-button";
      departButton.textContent = "もぐる";
      departButton.addEventListener("click", () => this.departNow());
    }
    box.appendChild(departButton);

    this.root.appendChild(box);
    // 列が増えて横スクロールが要るようになったため、選んでいる列を必ず見える位置に運ぶ
    columns.querySelector(".town-col.active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  /**
   * 建物・村人ごとの役割メニュー(plan/game/archive/village-scoped-menus.md)。
   * 列番号から、対応するrenderXxx()呼び出しへ振り分ける。各renderXxx()の
   * 中身(renderColumn呼び出し込み)自体は一切変えていない。render()側は
   * this.openColumnsに含まれる列番号だけをこれ経由で並べる
   */
  private renderColumnByNumber(n: TownColumn): HTMLElement {
    switch (n) {
      case 0:
        return this.renderList("倉庫", this.storage, 0);
      case 1:
        return this.renderList(`持ち込む (${this.carry.length} / ${CARRY_LIMIT})`, this.carry, 1);
      case 3:
        return this.renderTrainingFocus();
      case 4:
        return this.renderHut();
      case 5:
        return this.renderWorkshop();
      case 6:
        return this.renderRecords();
      case 7:
        return this.renderCompendium();
      case 8:
        return this.renderAchievements();
      case 9:
        return this.renderEquipmentCompendium();
      case 10:
        return this.renderDifficulty();
      case 11:
        return this.renderQuestBoard();
      case 12:
        return this.renderDungeons();
      case 13:
        return this.renderVillage();
      case 14:
        return this.renderAccessibility();
      case 15:
        return this.renderCostumes();
      case 16:
        return this.renderVillageLife();
      case 17:
        return this.renderYoimatsuriShop();
      case 18:
        return this.renderAudioSettings();
      case 19:
        return this.renderSettings();
    }
  }

  /**
   * 旅の看板(plan/game/archive/village-scoped-menus.md)。0〜19の列は
   * 一切使わず、チュートリアルの読み返しへの案内と、みんなの記録
   * (plan/community-leaderboard.md、未実装)の掲示予定地であることだけを示す。
   * 従来の「既定の入口(全列)」の役割はここでは持たない
   */
  private renderSignpost(): HTMLElement {
    const box = document.createElement("div");
    box.className = "town-box";

    const title = document.createElement("h2");
    title.textContent = "旅の看板";
    box.appendChild(title);

    const lead = document.createElement("p");
    lead.className = "town-lead";
    lead.textContent = "村の出入り口に立つ、古い立て札。旅人たちの記録が貼り出される予定地になっている。";
    box.appendChild(lead);

    const tips = document.createElement("p");
    tips.textContent =
      "操作説明・チュートリアルの読み返しは、村なかでもダイブ中でも「≡」メニューの『設定』からいつでも確認できる。";
    box.appendChild(tips);

    const leaderboard = document.createElement("p");
    leaderboard.textContent = "村のみんなの記録は、まだこの立て札には並んでいない(準備中)。";
    box.appendChild(leaderboard);

    const hint = document.createElement("p");
    hint.className = "town-hint";
    // 文言のタッチ対応(plan/game/archive/mobile-layout-redesign.md):
    // 「Enter / Escape」はキーボード前提の表記(issue #483)
    hint.textContent = resolveText(
      { keyboard: "Enter / Escape で村に戻る", touch: "決定 / もどるボタンで村に戻る" },
      currentInputMode(),
    );
    box.appendChild(hint);

    return box;
  }

  /**
   * 拠点の各列に共通の骨格(plan外のリファクタリング、Martin Fowler PR19)。
   * 「town-colのdiv+アクティブ判定+town-col-titleのh3見出し」という同型の
   * 前置きが19個のrenderXxx()すべてに重複していたため、ここに1本化する
   * (Form Template Method)。中身(リスト・補足文言等)はbuildへ委譲する
   */
  private renderColumn(column: TownColumn, label: string, build: (wrapper: HTMLElement) => void): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "town-col";
    if (this.column === column) wrapper.classList.add("active");

    // スクリーンリーダー対応(plan/screen-reader-support.md): 各列の見出しをh3にする
    const heading = document.createElement("h3");
    heading.className = "town-col-title";
    heading.textContent = label;
    // タッチ操作向け(#308): 見出しをタップすると、矢印キーでの列移動と同じく
    // その列へフォーカスを移す(まだ中身の一覧が無い列でも列だけは切り替えられる)
    heading.addEventListener("click", () => {
      if (this.column === column) return;
      this.column = column;
      this.render();
    });
    wrapper.appendChild(heading);

    build(wrapper);
    return wrapper;
  }

  /**
   * タッチ操作向け(#308): 列内の一覧アイテムをタップしたときの共通処理。
   *
   * - まだその列にいなければ、列を切り替えるだけにとどめる(←→キーで列を
   *   移ったときと同じ状態にする)。誤操作でいきなり確定操作が走らないように。
   * - 既にその列にいて、タップしたアイテムに既にカーソルが合っているなら、
   *   Enterキーと同じ確定操作(handleKey側が列ごとに知っている: 転送・
   *   選択解除・購入 等)を行う。
   * - それ以外(その列にいるがカーソルは別のアイテム上)は、↑↓キーで
   *   そこまでカーソルを動かしたのと同じ状態にする(moveCursorToが実際の
   *   フィールドを書き換える)。
   */
  private tapItem(column: TownColumn, wasSelected: boolean, moveCursorTo: () => void): void {
    if (this.column !== column) {
      this.column = column;
      this.render();
      return;
    }
    if (wasSelected) {
      this.handleKey("Enter");
      return;
    }
    moveCursorTo();
    this.render();
  }

  private renderList(label: string, items: StoredItem[], column: 0 | 1): HTMLElement {
    return this.renderColumn(column, label, (wrapper) => {
      const list = document.createElement("ul");
      // スクリーンリーダー対応(plan/screen-reader-support.md): list-style:noneのulは
      // 一部の環境(Safari VoiceOver等)でlist roleが外れるため、明示的に付け直す
      list.setAttribute("role", "list");
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
        const selected = this.column === column && index === this.cursor[column];
        if (selected) li.classList.add("selected");
        li.addEventListener("click", () => this.tapItem(column, selected, () => { this.cursor[column] = index; }));
        list.appendChild(li);
      });
      wrapper.appendChild(list);
    });
  }

  /** 鍛え方(plan/protagonist-training.md、アーカイブ済み)を選ぶ一覧 */
  private renderTrainingFocus(): HTMLElement {
    return this.renderColumn(3, "鍛え方", (wrapper) => {
      const list = document.createElement("ul");
      // スクリーンリーダー対応(plan/screen-reader-support.md): list-style:noneのulは
      // 一部の環境(Safari VoiceOver等)でlist roleが外れるため、明示的に付け直す
      list.setAttribute("role", "list");
      TRAINING_FOCI.forEach((focus, index) => {
        const li = document.createElement("li");
        li.textContent = TRAINING_FOCUS_LABELS[focus];
        const selected = this.column === 3 && index === this.trainingFocusIndex;
        if (selected) li.classList.add("selected");
        li.addEventListener("click", () => this.tapItem(3, selected, () => { this.trainingFocusIndex = index; }));
        list.appendChild(li);
      });
      wrapper.appendChild(list);
    });
  }

  /** ねむり小屋(plan/monster-fusion.md、アーカイブ済み)から連れて行く仲間を選ぶ一覧 */
  private renderHut(): HTMLElement {
    return this.renderColumn(4, `つれていく仲間 (${this.bringUids.length} / ${MAX_ALLIES})`, (wrapper) => {
      const hut = this.hut();
      const list = document.createElement("ul");
      // スクリーンリーダー対応(plan/screen-reader-support.md): list-style:noneのulは
      // 一部の環境(Safari VoiceOver等)でlist roleが外れるため、明示的に付け直す
      list.setAttribute("role", "list");
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
        const named = m.favorite ? `★${name}` : name;
        const base = bondLabel ? `${named} Lv${m.level}・${bondLabel}` : `${named} Lv${m.level}`;
        li.textContent =
          m.uid === this.releaseConfirmUid
            ? `${base}(夢に還す?)`
            : m.uid === this.fusionAxisUid
              ? `${base}(夢あわせの軸)`
              : base;
        if (this.bringUids.includes(m.uid)) li.classList.add("chosen");
        if (m.uid === this.fusionAxisUid) li.classList.add("axis");
        const selected = this.column === 4 && index === this.hutCursor;
        if (selected) li.classList.add("selected");
        // 夢に還す確認中(releaseConfirmUid)は、矢印キーでのカーソル移動も
        // 止めているのに合わせ、タップでのカーソル移動も無効にする
        li.addEventListener("click", () => {
          if (this.releaseConfirmUid !== null) return;
          this.tapItem(4, selected, () => {
            this.favoriteNotice = null;
            this.hutCursor = index;
          });
        });
        list.appendChild(li);
      });
      wrapper.appendChild(list);
    });
  }

  /** ゲンドの工房(plan/equipment-forging.md): 武器・盾の強化・印刻み */
  private renderWorkshop(): HTMLElement {
    return this.renderColumn(5, "ゲンドの工房", (wrapper) => {
      const targets = this.workshopTargets();
      const list = document.createElement("ul");
      // スクリーンリーダー対応(plan/screen-reader-support.md): list-style:noneのulは
      // 一部の環境(Safari VoiceOver等)でlist roleが外れるため、明示的に付け直す
      list.setAttribute("role", "list");
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
        for (const markId of item.markIds ?? []) text += `【${markDef(markId).name}】`;
        li.textContent = text;
        const selected = this.column === 5 && index === this.workshopCursor;
        if (selected) li.classList.add("selected");
        li.addEventListener("click", () => this.tapItem(5, selected, () => { this.workshopCursor = index; this.workshopMaxPlusNotice = null; }));
        list.appendChild(li);
      });
      wrapper.appendChild(list);

      if (this.workshopMarkChoices) {
        const sub = document.createElement("ul");
        sub.setAttribute("role", "list");
        sub.className = "menu-sub";
        this.workshopMarkChoices.forEach((markId, index) => {
          const li = document.createElement("li");
          li.textContent = markDef(markId).name;
          const selected = index === this.workshopMarkCursor;
          if (selected) li.classList.add("selected");
          li.addEventListener("click", () => {
            if (selected) {
              this.confirmImprint();
              return;
            }
            this.workshopMarkCursor = index;
            this.render();
          });
          sub.appendChild(li);
        });
        wrapper.appendChild(sub);
      }

      if (this.workshopSynthesisChoices) {
        const sub = document.createElement("ul");
        sub.setAttribute("role", "list");
        sub.className = "menu-sub";
        this.workshopSynthesisChoices.forEach((markId, index) => {
          const li = document.createElement("li");
          li.textContent = `${markDef(markId).name}の刻印石×2 → 重ね刻みの砥石`;
          const selected = index === this.workshopSynthesisCursor;
          if (selected) li.classList.add("selected");
          li.addEventListener("click", () => {
            if (selected) {
              this.confirmSynthesis();
              return;
            }
            this.workshopSynthesisCursor = index;
            this.render();
          });
          sub.appendChild(li);
        });
        wrapper.appendChild(sub);
      }
    });
  }

  /**
   * 記録の間(plan/records-hall.md)。積み重ねてきた数値記録の一覧。
   * 選択・カーソル移動は無く、見るだけの画面。
   */
  private renderRecords(): HTMLElement {
    return this.renderColumn(6, "記録の間", (wrapper) => {
      const save = this.save;
      const list = document.createElement("ul");
      // スクリーンリーダー対応(plan/screen-reader-support.md): list-style:noneのulは
      // 一部の環境(Safari VoiceOver等)でlist roleが外れるため、明示的に付け直す
      list.setAttribute("role", "list");
      const rows: [string, number][] = save
        ? [
            ["最深到達", save.deepest],
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
    });
  }

  /**
   * モンスター図鑑(plan/monster-compendium.md)。種族ごとに「未確認」
   * 「見た」「捕まえた」を表示する。一度でも見た種族はEnterで
   * 図鑑ギャラリー(plan/gallery-mode.md)を開き、3Dモデルを眺められる
   */
  private renderCompendium(): HTMLElement {
    return this.renderColumn(7, "モンスター図鑑", (wrapper) => {
      const compendium = this.save?.compendium ?? {};
      const captured = SPECIES.filter((s) => compendium[s.id] === "captured").length;
      const summary = document.createElement("p");
      summary.textContent = `捕まえた ${captured} / ${SPECIES.length} 種`;
      wrapper.appendChild(summary);

      const list = document.createElement("ul");
      // スクリーンリーダー対応(plan/screen-reader-support.md): list-style:noneのulは
      // 一部の環境(Safari VoiceOver等)でlist roleが外れるため、明示的に付け直す
      list.setAttribute("role", "list");
      SPECIES.forEach((species, index) => {
        const status = compendium[species.id];
        const label = status === "captured" ? "捕まえた" : status === "seen" ? "見た" : "未確認";
        const li = document.createElement("li");
        li.textContent = status ? `${species.name}: ${label}` : `???: ${label}`;
        const selected = this.column === 7 && index === this.compendiumCursor;
        if (selected) li.classList.add("selected");
        li.addEventListener("click", () => this.tapItem(7, selected, () => { this.compendiumCursor = index; }));
        list.appendChild(li);
      });
      wrapper.appendChild(list);
    });
  }

  /**
   * 実績帳(plan/achievements.md)。未達成の実績も条件を伏せずに表示する
   * (隠し実績は作らない方針)。称号を持つ達成済みの実績はEnterで着脱できる
   */
  private renderAchievements(): HTMLElement {
    return this.renderColumn(8, "実績帳", (wrapper) => {
      const achievements = this.save?.achievements ?? {};
      const done = ACHIEVEMENTS.filter((a) => achievements[a.id] !== undefined).length;
      const summary = document.createElement("p");
      summary.textContent = `達成 ${done} / ${ACHIEVEMENTS.length} 件`;
      wrapper.appendChild(summary);

      const list = document.createElement("ul");
      // スクリーンリーダー対応(plan/screen-reader-support.md): list-style:noneのulは
      // 一部の環境(Safari VoiceOver等)でlist roleが外れるため、明示的に付け直す
      list.setAttribute("role", "list");
      ACHIEVEMENTS.forEach((def, index) => {
        const unlockedAt = achievements[def.id];
        const li = document.createElement("li");
        const equipped = this.save?.equippedTitle === def.id ? "★" : "";
        li.textContent = unlockedAt
          ? `${equipped}${def.name}: ${def.description}(達成)`
          : `${def.name}: ${def.description}(未達成)`;
        const selected = this.column === 8 && index === this.achievementCursor;
        if (selected) li.classList.add("selected");
        li.addEventListener("click", () => this.tapItem(8, selected, () => { this.achievementCursor = index; }));
        list.appendChild(li);
      });
      wrapper.appendChild(list);
    });
  }

  /**
   * 装備図鑑(plan/equipment-compendium.md)。武器・頭防具・装身具・印・素材の
   * 入手/極めた状態を表示するだけの画面(カーソル移動・選択は無い)。
   */
  private renderEquipmentCompendium(): HTMLElement {
    return this.renderColumn(9, "装備図鑑", (wrapper) => {
      const equipment = this.save?.equipmentCompendium ?? {};
      const marks = this.save?.markCompendium ?? {};
      const materials = this.save?.materialCompendium ?? {};

      const list = document.createElement("ul");
      // スクリーンリーダー対応(plan/screen-reader-support.md): list-style:noneのulは
      // 一部の環境(Safari VoiceOver等)でlist roleが外れるため、明示的に付け直す
      list.setAttribute("role", "list");
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
    });
  }

  /** 難易度モード(plan/difficulty-modes.md)。次回のダイブから反映される */
  private renderDifficulty(): HTMLElement {
    return this.renderColumn(10, "難易度", (wrapper) => {
      const list = document.createElement("ul");
      // スクリーンリーダー対応(plan/screen-reader-support.md): list-style:noneのulは
      // 一部の環境(Safari VoiceOver等)でlist roleが外れるため、明示的に付け直す
      list.setAttribute("role", "list");
      DIFFICULTY_MODES.forEach((mode, index) => {
        const li = document.createElement("li");
        li.textContent = DIFFICULTY_NAMES[mode];
        const selected = this.column === 10 && index === this.difficultyIndex;
        if (selected) li.classList.add("selected");
        li.addEventListener("click", () => this.tapItem(10, selected, () => { this.difficultyIndex = index; }));
        list.appendChild(li);
      });
      wrapper.appendChild(list);
    });
  }

  /**
   * 複数のダンジョン(plan/multiple-dungeons.md)。どの寝穴に潜るかを選ぶ。
   * 未解放のものも一覧に表示し、解放条件を添える(選ぶことはできない)。
   */
  private renderDungeons(): HTMLElement {
    return this.renderColumn(12, "潜るダンジョン", (wrapper) => {
      // ヨリシロの気分(plan/yorishiro-moods.md): 今日の気分を1行添える
      const todaysMood = moodForDate(todayKey());
      const moodLine = document.createElement("p");
      moodLine.className = "town-mood";
      moodLine.textContent = `今日の気分: ${todaysMood.name} — ${todaysMood.flavorText}`;
      wrapper.appendChild(moodLine);

      // 宵祭り(plan/yoimatsuri-festival.md): 開催有無をすぐ下に1行添える
      if (isYoimatsuri(todayKey())) {
        const festivalLine = document.createElement("p");
        festivalLine.className = "town-mood";
        festivalLine.textContent = "今夜は宵祭り。提灯が灯っている。";
        wrapper.appendChild(festivalLine);
      }

      const deepest = this.save?.deepest ?? 0;
      const villageStage = this.save?.villageStage ?? 1;
      const foundPassageCount = this.save?.foundVaultPassages.length ?? 0;
      const defeatedRegionBosses = this.save?.defeatedRegionBosses ?? [];
      const hinataCleared = this.save?.hinataCleared ?? false;
      // 旧セーブとの互換(plan/game/tutorial-dungeon.md): unlockedDungeons()と同じ理由
      const region1Unlocked = hinataCleared || (this.save?.runs ?? 0) > 0;
      const unlocked = this.unlockedDungeons();
      const list = document.createElement("ul");
      // スクリーンリーダー対応(plan/screen-reader-support.md): list-style:noneのulは
      // 一部の環境(Safari VoiceOver等)でlist roleが外れるため、明示的に付け直す
      list.setAttribute("role", "list");
      // 真の目覚め(plan/true-awakening.md)は隠し要素として扱う。3条件が
      // すべて揃うまでは、未解放のヒント表示すらこの一覧に出さない。
      // 樽比べ(plan/tarukurabe-minigame.md)も同じく、開催日以外は一覧に出さない
      // (宵祭りの出店と同じく、開催日以外は存在自体を示さない扱い)。
      // ひなたの寝穴(plan/game/tutorial-dungeon.md)も、踏破するまでは
      // 未解放のヒント表示すら出さない(自動誘導専用のため)
      DUNGEONS.filter(
        (d) => d.id !== TRUE_AWAKENING_ID && d.id !== TARUKURABE_ID && d.id !== HINATA_ID,
      ).forEach((dungeon) => {
        const li = document.createElement("li");
        if (
          isDungeonUnlocked(dungeon, deepest, villageStage, foundPassageCount, defeatedRegionBosses, region1Unlocked)
        ) {
          li.textContent = dungeon.name;
          const selected = this.column === 12 && unlocked[this.dungeonIndex]?.id === dungeon.id;
          if (selected) li.classList.add("selected");
          const unlockedIndex = unlocked.findIndex((d) => d.id === dungeon.id);
          li.addEventListener("click", () => this.tapItem(12, selected, () => { this.dungeonIndex = unlockedIndex; }));
        } else if (dungeon.unlock !== "always" && "minDeepest" in dungeon.unlock) {
          li.textContent = `${dungeon.name}(未解放: 最深${dungeon.unlock.minDeepest}階到達で解放)`;
        } else if (dungeon.unlock !== "always" && "minVillageStage" in dungeon.unlock) {
          li.textContent = `${dungeon.name}(未解放: 村の発展段階${dungeon.unlock.minVillageStage}で解放)`;
        } else if (dungeon.unlock !== "always" && "allRegionBossesDefeated" in dungeon.unlock) {
          li.textContent = `${dungeon.name}(未解放: 8地方すべてのぬしを鎮めると解放)`;
        } else if (
          dungeon.unlock !== "always" &&
          "afterBossDefeated" in dungeon.unlock &&
          regionIndexForDungeonId(dungeon.id) !== undefined
        ) {
          // 地方ダンジョン(plan/game/dungeon-per-region.md)は、次に何が来るかを
          // 隠す「???」表示にする。地方の連鎖以外(山の芯など)は従来どおり
          // 相手の名前を明かす表示のまま
          li.textContent = `???(第${regionIndexForDungeonId(dungeon.id)}地方のぬしを鎮めるとひらける)`;
        } else if (dungeon.unlock !== "always" && "afterBossDefeated" in dungeon.unlock) {
          li.textContent = `${dungeon.name}(未解放: ${speciesById(dungeon.unlock.afterBossDefeated).name}を撃破すると解放)`;
        } else if (dungeon.unlock !== "always" && "afterDungeonCleared" in dungeon.unlock) {
          li.textContent = `${dungeon.name}(未解放: ひなたの寝穴を踏破すると解放)`;
        } else {
          li.textContent = `${dungeon.name}(未解放: 忘れ物蔵の隠し通路を全8地方で見つけると解放。現在${foundPassageCount}/8)`;
        }
        list.appendChild(li);
      });
      if (hinataCleared) {
        const hinata = dungeonById(HINATA_ID);
        const li = document.createElement("li");
        li.textContent = hinata.name;
        const selected = this.column === 12 && unlocked[this.dungeonIndex]?.id === hinata.id;
        if (selected) li.classList.add("selected");
        const unlockedIndex = unlocked.findIndex((d) => d.id === hinata.id);
        li.addEventListener("click", () => this.tapItem(12, selected, () => { this.dungeonIndex = unlockedIndex; }));
        list.appendChild(li);
      }
      if (this.save && isTrueAwakeningUnlocked(this.save)) {
        const trueAwakening = dungeonById(TRUE_AWAKENING_ID);
        const li = document.createElement("li");
        li.textContent = trueAwakening.name;
        const selected = this.column === 12 && unlocked[this.dungeonIndex]?.id === trueAwakening.id;
        if (selected) li.classList.add("selected");
        const unlockedIndex = unlocked.findIndex((d) => d.id === trueAwakening.id);
        li.addEventListener("click", () => this.tapItem(12, selected, () => { this.dungeonIndex = unlockedIndex; }));
        list.appendChild(li);
      }
      if (isTarukurabeDay(todayKey())) {
        const tarukurabe = dungeonById(TARUKURABE_ID);
        const li = document.createElement("li");
        li.textContent = `${tarukurabe.name}(自己ベスト: ${this.save?.tarukurabeBestScore ?? 0}点)`;
        const selected = this.column === 12 && unlocked[this.dungeonIndex]?.id === tarukurabe.id;
        if (selected) li.classList.add("selected");
        const unlockedIndex = unlocked.findIndex((d) => d.id === tarukurabe.id);
        li.addEventListener("click", () => this.tapItem(12, selected, () => { this.dungeonIndex = unlockedIndex; }));
        list.appendChild(li);
      }
      wrapper.appendChild(list);
    });
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
    return this.renderColumn(11, "依頼板", (wrapper) => {
      const rows = this.questBoardRows();
      const summary = document.createElement("p");
      summary.textContent = `受注中 ${this.save?.activeQuests.length ?? 0} / ${MAX_ACTIVE_QUESTS} 件`;
      wrapper.appendChild(summary);

      const list = document.createElement("ul");
      // スクリーンリーダー対応(plan/screen-reader-support.md): list-style:noneのulは
      // 一部の環境(Safari VoiceOver等)でlist roleが外れるため、明示的に付け直す
      list.setAttribute("role", "list");
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
        const selected = this.column === 11 && index === this.questCursor;
        if (selected) li.classList.add("selected");
        li.addEventListener("click", () => this.tapItem(11, selected, () => { this.questCursor = index; }));
        list.appendChild(li);
      });
      wrapper.appendChild(list);
    });
  }

  /**
   * 村の発展(plan/village-development.md)。現在の段階と、次の段階の条件
   * (最深到達記録・ゴールド)を表示する。Enterで条件を満たしていれば発展させる
   */
  private renderVillage(): HTMLElement {
    return this.renderColumn(13, "村の発展", (wrapper) => {
      const save = this.save;
      const stage = save?.villageStage ?? 1;
      const summary = document.createElement("p");
      summary.textContent = `段階 ${stage} / 4 ・ ねむり小屋 最大${hutCapacity(stage)}体`;
      wrapper.appendChild(summary);

      const list = document.createElement("ul");
      // スクリーンリーダー対応(plan/screen-reader-support.md): list-style:noneのulは
      // 一部の環境(Safari VoiceOver等)でlist roleが外れるため、明示的に付け直す
      list.setAttribute("role", "list");
      VILLAGE_STAGE_REQUIREMENTS.forEach((requirement) => {
        const li = document.createElement("li");
        const done = stage >= requirement.stage;
        li.textContent = done
          ? `${requirement.label}(達成)`
          : `${requirement.label}: 地方ボス${requirement.minRegionBossesDefeated}体撃破・${requirement.cost}G`;
        list.appendChild(li);
      });
      wrapper.appendChild(list);

      if (save && canDevelopVillage(stage, save.defeatedRegionBosses.length, save.gold)) {
        const ready = document.createElement("p");
        ready.className = "selected";
        ready.textContent = "タップ(またはEnter)で発展させられる!";
        ready.addEventListener("click", () => {
          if (this.column !== 13) {
            this.column = 13;
            this.render();
            return;
          }
          this.handleKey("Enter");
        });
        wrapper.appendChild(ready);
      }
    });
  }

  /**
   * アクセシビリティ(plan/difficulty-modes.md)。メッセージログ・メニューの
   * 文字サイズを2段階から選べる。状態異常表示・操作説明の呼び出しについても
   * ここに要点を示す
   */
  private renderAccessibility(): HTMLElement {
    return this.renderColumn(14, "アクセシビリティ", (wrapper) => {
      const fontSize = this.save?.fontSize ?? "normal";
      const list = document.createElement("ul");
      // スクリーンリーダー対応(plan/screen-reader-support.md): list-style:noneのulは
      // 一部の環境(Safari VoiceOver等)でlist roleが外れるため、明示的に付け直す
      list.setAttribute("role", "list");
      (["normal", "large"] as const).forEach((size) => {
        const li = document.createElement("li");
        li.textContent = size === "normal" ? "文字サイズ: ふつう" : "文字サイズ: 大きめ";
        if (size === fontSize) li.classList.add("selected");
        // Enterは常に2択を入れ替えるだけなので、既に選ばれている方をタップしても
        // 何もしない(押すたびに逆へ切り替わってしまうのを避ける)
        li.addEventListener("click", () => {
          if (this.column !== 14) {
            this.column = 14;
            this.render();
            return;
          }
          if (size === fontSize) return;
          this.handleKey("Enter");
        });
        list.appendChild(li);
      });
      wrapper.appendChild(list);

      const note = document.createElement("p");
      note.textContent = "状態異常は色だけでなく記号(◐/✳/◆)でも区別して表示する。";
      wrapper.appendChild(note);

      // バグ報告ボタン(plan/bug-report-button.md)
      const report = document.createElement("p");
      report.className = "town-hint";
      report.textContent = "B キー: 不具合を報告する(GitHubのIssue作成画面が開きます)";
      wrapper.appendChild(report);
    });
  }

  /**
   * 身支度(plan/costumes.md)。戦闘に一切影響しない見た目だけの衣装。
   * 未入手のものも一覧に表示し、入手条件を隠さない(実績帳と同じ方針)
   */
  private renderCostumes(): HTMLElement {
    return this.renderColumn(15, "身支度", (wrapper) => {
      const unlockedCostumes = this.save?.unlockedCostumes ?? [];
      const equipped = this.save?.equippedCostume;
      const list = document.createElement("ul");
      // スクリーンリーダー対応(plan/screen-reader-support.md): list-style:noneのulは
      // 一部の環境(Safari VoiceOver等)でlist roleが外れるため、明示的に付け直す
      list.setAttribute("role", "list");
      COSTUMES.forEach((costume: CostumeDef, index) => {
        const unlocked = unlockedCostumes.includes(costume.id);
        const li = document.createElement("li");
        const state = costume.id === equipped ? "(装備中)" : unlocked ? "(入手済み)" : "(未入手)";
        li.textContent = `${costume.name}${state}`;
        const selected = this.column === 15 && index === this.costumeCursor;
        if (selected) li.classList.add("selected");
        li.addEventListener("click", () => this.tapItem(15, selected, () => { this.costumeCursor = index; }));
        list.appendChild(li);
      });
      wrapper.appendChild(list);
    });
  }

  /**
   * NPCのせりふプール(plan/flavor-and-dialogue.md)。絆段階・気分・宵祭りの
   * 状態からcontextを決め、対応するlinesから直前と違う1件を抽選する。
   * 該当するプールが無ければundefined(呼び出し側でnpc.roleにフォールバックする)
   */
  private rollDialogueLine(npcId: string): string | undefined {
    if (!this.save) return undefined;
    const context = dialogueContext(this.save, npcId);
    const pool = dialoguePoolFor(npcId, context);
    if (!pool || pool.lines.length === 0) return undefined;
    if (pool.lines.length === 1) {
      this.lastDialogueLineIndex.set(npcId, 0);
      return pool.lines[0];
    }
    const last = this.lastDialogueLineIndex.get(npcId);
    let index = Math.floor(Math.random() * pool.lines.length);
    if (index === last) index = (index + 1) % pool.lines.length;
    this.lastDialogueLineIndex.set(npcId, index);
    return pool.lines[index];
  }

  /**
   * 村の暮らし(plan/village-life.md)。NPCと話す。絆段階が上がった直後だけ
   * Enterで専用の一言が流れる(seenVillageEventsで再生済みかどうかは
   * main.ts側が判定する)。Gキーで倉庫の素材(ほこら粉・刻印石)を1個献上できる。
   */
  private renderVillageLife(): HTMLElement {
    return this.renderColumn(16, "NPCと話す", (wrapper) => {
      const npcs = visibleVillageNpcs(this.currentStoryChapter());
      const list = document.createElement("ul");
      // スクリーンリーダー対応(plan/screen-reader-support.md): list-style:noneのulは
      // 一部の環境(Safari VoiceOver等)でlist roleが外れるため、明示的に付け直す
      list.setAttribute("role", "list");
      npcs.forEach((npc, index) => {
        const level = this.save?.bonds[npc.id] ?? 0;
        const label = bondStageLabel(bondStage(level));
        const li = document.createElement("li");
        li.textContent = label ? `${npc.name}(${label})` : npc.name;
        const selected = this.column === 16 && index === this.npcIndex;
        if (selected) li.classList.add("selected");
        li.addEventListener("click", () =>
          this.tapItem(16, selected, () => {
            this.npcIndex = index;
            this.npcTalkMessage = null;
          }),
        );
        list.appendChild(li);
      });
      wrapper.appendChild(list);
    });
  }

  /**
   * 宵祭りの出店(plan/yoimatsuri-festival.md)。宵祭りの日だけ品揃えを表示し、
   * 選んで買える。品揃え・価格は固定(補充・売り切れの概念は持たない)
   */
  private renderYoimatsuriShop(): HTMLElement {
    return this.renderColumn(17, "宵祭りの出店", (wrapper) => {
      const list = document.createElement("ul");
      // スクリーンリーダー対応(plan/screen-reader-support.md): list-style:noneのulは
      // 一部の環境(Safari VoiceOver等)でlist roleが外れるため、明示的に付け直す
      list.setAttribute("role", "list");
      if (isYoimatsuri(todayKey())) {
        FESTIVAL_SHOP_OFFERS.forEach((offer, index) => {
          const li = document.createElement("li");
          li.textContent = `${itemDef(offer.defId).name} — ${offer.price}G`;
          const selected = this.column === 17 && index === this.festivalShopCursor;
          if (selected) li.classList.add("selected");
          li.addEventListener("click", () => this.tapItem(17, selected, () => { this.festivalShopCursor = index; }));
          list.appendChild(li);
        });
      } else {
        const li = document.createElement("li");
        li.textContent = "今日は宵祭りの日ではない。";
        list.appendChild(li);
      }
      wrapper.appendChild(list);
    });
  }

  /** サウンド再生(plan/audio-playback.md)。ミュート・音量の設定 */
  private renderAudioSettings(): HTMLElement {
    return this.renderColumn(18, "音", (wrapper) => {
      const muted = this.save?.audioMuted ?? false;
      const volume = this.save?.audioVolume ?? DEFAULT_AUDIO_VOLUME;
      const list = document.createElement("ul");
      // スクリーンリーダー対応(plan/screen-reader-support.md): list-style:noneのulは
      // 一部の環境(Safari VoiceOver等)でlist roleが外れるため、明示的に付け直す
      list.setAttribute("role", "list");

      const muteLi = document.createElement("li");
      muteLi.textContent = `ミュート: ${muted ? "オン" : "オフ"}`;
      const muteSelected = this.column === 18 && this.audioSettingsCursor === 0;
      if (muteSelected) muteLi.classList.add("selected");
      muteLi.addEventListener("click", () => this.tapItem(18, muteSelected, () => { this.audioSettingsCursor = 0; }));
      list.appendChild(muteLi);

      const volumeLi = document.createElement("li");
      volumeLi.textContent = `音量: ${Math.round(volume * 100)}%`;
      const volumeSelected = this.column === 18 && this.audioSettingsCursor === 1;
      if (volumeSelected) volumeLi.classList.add("selected");
      volumeLi.addEventListener("click", () => this.tapItem(18, volumeSelected, () => { this.audioSettingsCursor = 1; }));
      list.appendChild(volumeLi);

      wrapper.appendChild(list);
    });
  }

  /** 設定画面(plan/settings-screen.md)。メッセージ速度・操作説明の再表示・キー配置の確認 */
  private renderSettings(): HTMLElement {
    return this.renderColumn(19, t("ui.settings.title"), (wrapper) => {
      if (this.settingsSubView === "tutorialTips") {
        const mode = currentInputMode();
        const list = document.createElement("ul");
        list.setAttribute("role", "list");
        for (const id of TUTORIAL_TIP_IDS) {
          const li = document.createElement("li");
          // 文言のタッチ対応(plan/game/mobile-layout-redesign.md)
          li.textContent = tutorialTipText(id, mode);
          list.appendChild(li);
        }
        // タッチ操作向け(#308): 一覧をタップするとEnter/Escと同じく閉じる
        // (このサブビュー表示中はhandleKeyの先頭で列を問わず捕まえている)
        list.addEventListener("click", () => this.handleKey("Enter"));
        wrapper.appendChild(list);
        return;
      }

      if (this.settingsSubView === "keyReference") {
        // 文言のタッチ対応(plan/game/mobile-layout-redesign.md): タッチ端末では
        // キー名の代わりにパッド・ボタン名で書かれた一覧を出す
        const lines = currentInputMode() === "touch" ? KEY_REFERENCE_TOUCH : KEY_REFERENCE;
        const list = document.createElement("ul");
        list.setAttribute("role", "list");
        for (const line of lines) {
          const li = document.createElement("li");
          li.textContent = line;
          list.appendChild(li);
        }
        list.addEventListener("click", () => this.handleKey("Enter"));
        wrapper.appendChild(list);
        return;
      }

      const speed = this.save?.messageSpeed ?? "normal";
      const speedLabel: Record<MessageSpeed, string> = {
        slow: t("ui.settings.speedSlow"),
        normal: t("ui.settings.speedNormal"),
        fast: t("ui.settings.speedFast"),
      };
      // 多言語対応の土台(plan/i18n-foundation.md): 第1段階時点はLOCALESが"ja"のみのため
      // ラベルもjaの1件だけ持つ。"en"の翻訳テーブルが揃い次第ここに追加する
      const localeLabel: Partial<Record<LocaleId, string>> = { ja: t("ui.settings.localeJa") };
      const list = document.createElement("ul");
      list.setAttribute("role", "list");

      const speedLi = document.createElement("li");
      speedLi.textContent = t("ui.settings.messageSpeedLabel", { value: speedLabel[speed] });
      const speedSelected = this.column === 19 && this.settingsCursor === 0;
      if (speedSelected) speedLi.classList.add("selected");
      speedLi.addEventListener("click", () => this.tapItem(19, speedSelected, () => { this.settingsCursor = 0; }));
      list.appendChild(speedLi);

      const tipsLi = document.createElement("li");
      tipsLi.textContent = t("ui.settings.tutorialTips");
      const tipsSelected = this.column === 19 && this.settingsCursor === 1;
      if (tipsSelected) tipsLi.classList.add("selected");
      tipsLi.addEventListener("click", () => this.tapItem(19, tipsSelected, () => { this.settingsCursor = 1; }));
      list.appendChild(tipsLi);

      const keysLi = document.createElement("li");
      keysLi.textContent = t("ui.settings.keyReference");
      const keysSelected = this.column === 19 && this.settingsCursor === 2;
      if (keysSelected) keysLi.classList.add("selected");
      keysLi.addEventListener("click", () => this.tapItem(19, keysSelected, () => { this.settingsCursor = 2; }));
      list.appendChild(keysLi);

      const localeLi = document.createElement("li");
      const currentLocale = this.save?.locale ?? "ja";
      localeLi.textContent = t("ui.settings.localeLabel", { value: localeLabel[currentLocale] ?? currentLocale });
      const localeSelected = this.column === 19 && this.settingsCursor === 3;
      if (localeSelected) localeLi.classList.add("selected");
      localeLi.addEventListener("click", () => this.tapItem(19, localeSelected, () => { this.settingsCursor = 3; }));
      list.appendChild(localeLi);

      wrapper.appendChild(list);
    });
  }
}

/** ねむり小屋の一覧表示用の名前。src/entities/naming.ts の displayActorName と同じ考え方 */
function displayStoredMonsterName(m: StoredMonster): string {
  const species = speciesById(m.speciesId).name;
  return m.nickname ? `${m.nickname}(${species})` : species;
}
