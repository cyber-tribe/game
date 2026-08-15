import * as THREE from "three";
import { Game, type Command, type RunSnapshot } from "./game";
import type { GameEvent } from "./core/events";
import { splitEventsAtRecruits } from "./core/events";
import { isFree, walkableAt } from "./core/types";
import { DIRS, chebyshev, eq } from "./core/grid";
import { BARREL_MODELS, essentialModelNames, modelNames } from "./modelList";
import { Assets } from "./view/assets";
import { Hud } from "./view/hud";
import { ATTACK_KEY_CODE, Input } from "./view/input";
import { Minimap } from "./view/minimap";
import { Renderer } from "./view/renderer";
import { GalleryView } from "./view/gallery";
import { Stage } from "./view/stage";
import { VILLAGE_BUILDINGS, VillageView } from "./view/village";
import { AudioPlayer } from "./audio/player";
import { ja as jaDict } from "./i18n/ja";
import { setLocale as applyLocaleDict, t } from "./i18n";
import { ArtsMenu } from "./ui/arts";
import { EndingScreen } from "./ui/ending";
import { InventoryMenu } from "./ui/menu";
import { NamingDialog } from "./ui/naming-dialog";
import { OrientationGuard } from "./ui/orientation-guard";
import { StairsConfirmModal } from "./ui/stairs-confirm";
import { StanceMenu } from "./ui/stance";
import { TouchControls } from "./ui/touch-controls";
import { SYSTEM_TOWN_COLUMNS, TownScreen } from "./ui/town";
import { SlotSelectScreen } from "./ui/slot-select";
import {
  abandonQuest,
  acceptQuest,
  addFoundVaultPassage,
  addKnownCheckpoint,
  batchSaves,
  buyFestivalItem,
  checkAchievements,
  checkEquipmentCompendium,
  clearRunSnapshot,
  deleteSaveSlot,
  developVillage,
  equipCostume,
  fromStored,
  fuseMonsters,
  giftMaterial,
  initialSave,
  isCompendiumComplete,
  listSaveSlotSummaries,
  loadRunSnapshot,
  loadSave,
  markSpeciesCaptured,
  markSpeciesSeen,
  markTutorialTipSeen,
  markVillageEventSeen,
  migrateLegacySaveIfNeeded,
  recordDeepest,
  recordRun,
  recordTarukurabeResult,
  refreshBoard,
  refreshUnlockedCostumes,
  releaseCompanion,
  renameStoredMonster,
  saveData,
  saveRunSnapshot,
  setActiveSlot,
  setAudioMuted,
  setAudioVolume,
  setDifficulty,
  setEquippedTitle,
  setFontSize,
  setMessageSpeed,
  setSaveLocale,
  setTrainingFocus,
  takeFromHut,
  talkToNpc,
  toggleFavorite,
  type SaveData,
  type StoredItem,
  type StoredMonster,
} from "./save";
import type { DifficultyMode } from "./entities/difficulty";
import { costumeById } from "./entities/costumes";
import {
  MAIN_CAVE_ID,
  MOUNTAIN_CORE_ID,
  NIGHTLY_DREAM_ID,
  REGION_SIZE,
  TARUKURABE_ID,
  TRIAL_CHAMBER_ID,
  TRUE_AWAKENING_ID,
} from "./entities/dungeons";
import { isYoimatsuri } from "./entities/festivals";
import { DEFAULT_MOOD_ID, MOOD_VISUALS, moodForDate } from "./entities/moods";
import { todayKey } from "./entities/quests";
import { STORY_CHAPTER_MESSAGES, storyChapter, storyChapterEventId } from "./entities/story";
import { REGION_BOSS_FLOORS, speciesById } from "./entities/species";
import { KEY_REFERENCE, KEY_REFERENCE_TOUCH, messageSpeedScale } from "./entities/settings";
import { resolveText, type TextVariant } from "./entities/inputText";
import { currentInputMode } from "./ui/inputMode";
import { MinimapZoomToggle } from "./ui/minimap-zoom";
import { buildBugReportUrl } from "./entities/bugReport";
import { isDebugEnabled } from "./entities/debugPanel";
import { DebugPanel } from "./ui/debug-panel";
import { speciesLore } from "./entities/speciesLore";
import { tutorialTipText, type TutorialTipId } from "./core/tutorial";
import type { FloorState, Item } from "./core/types";
import type { TrainingFocus } from "./entities/player";

/** 拠点に覆われているあいだ、洞窟を描き直す間隔(秒)。うっすら動いて見えれば足りる */
const COVERED_RENDER_INTERVAL = 0.2;

/**
 * ダイブ終了オーバーレイに出す「拠点にもどる」ボタンの文言
 * (plan/game/gameover-touch-return.md)。オーバーレイは画面全体を覆って
 * タッチUIを塞ぐため、このボタンがタッチ端末での唯一の出口になる
 */
const RETURN_TO_TOWN_LABEL = "拠点にもどる";

/**
 * 文言のタッチ対応(plan/game/mobile-layout-redesign.md)。ゲームオーバー・
 * 踏破・樽比べ終了の3オーバーレイが共通で使う「拠点へ戻る」案内。
 * ボタン自体(上のRETURN_TO_TOWN_LABEL)はplan/game/gameover-touch-return.mdが
 * 追加したものだが、フッター文言のキーボード/タッチ出し分けはこちらで行う
 */
const RETURN_TO_TOWN_HINT: TextVariant = {
  keyboard: "R キーで拠点にもどる",
  touch: "「拠点にもどる」ボタンで戻れる",
};

/**
 * submit()が1ターンぶんのGameEventを記録・進行管理に反映するための表。
 * events.tsに新しい種別を追加すると、ここに対応するキーが無い限り
 * typecheckが検出する。見た目やアニメーションはStage側(view/stage.ts)の
 * 表が別に持っており、ここは記録・図鑑・進行フラグだけを扱う
 */
type SubmitEventHandlers = {
  [K in GameEvent["type"]]: (event: Extract<GameEvent, { type: K }>) => void;
};

class App {
  private readonly renderer: Renderer;
  private readonly assets = new Assets();
  private readonly stage: Stage;
  /** サウンド再生(plan/audio-playback.md) */
  private readonly audio = new AudioPlayer();
  private readonly hud: Hud;
  private readonly minimap: Minimap;
  private readonly input = new Input();
  private readonly menu: InventoryMenu;
  private readonly stanceMenu: StanceMenu;
  private readonly artsMenu: ArtsMenu;
  /** 階段を降りる前の確認モーダル(plan/stairs-confirm-modal.md) */
  private readonly stairsConfirm: StairsConfirmModal;
  /** エンドロール(plan/ending-sequence.md) */
  private readonly endingScreen: EndingScreen;
  private readonly town: TownScreen;
  private readonly namingDialog: NamingDialog;
  /** #naming自身。仲間になった瞬間の見せ場のときだけ.naming-showcaseを付け外しする */
  private readonly namingRoot: HTMLElement;
  /**
   * 仲間になった瞬間の一時停止(plan/game/archive/companion-recruit-showcase.md)。
   * そのターンのイベント列をrecruitごとに区切った再生単位。先頭が
   * これから再生する分。nullなら保留していない
   */
  private turnPlayback: { segments: GameEvent[][]; floor: FloorState; hurry: boolean; scale: number } | null = null;
  /**
   * 直前に再生した区切りの末尾がrecruitだった場合、その仲間の情報を
   * 入れておく。recruitの直前までの演出(タルが飛んでいく等)を
   * 中途半端に止めたくないので、this.lockが切れる(演出が最後まで
   * 終わる)のを待ってからダイアログを開く
   */
  private pendingRecruitShowcase: { actorId: number; name: string } | null = null;
  /** 上記の一時停止中、命名ダイアログと一緒にモデルを見せているか */
  private recruitShowcaseActive = false;
  /** 一時停止中に見せているモンスターのモデル名(public/models/<model>.glb) */
  private recruitShowcaseModel: string | null = null;
  /** セーブ枠選択(plan/save-slots.md) */
  private readonly slotSelect: SlotSelectScreen;
  private readonly canvas: HTMLCanvasElement;
  private readonly uiRoot: HTMLElement;
  /** 図鑑ギャラリー(plan/gallery-mode.md)。3Dモデルを眺める、ダンジョンとは別の小さな場面 */
  private readonly gallery: GalleryView;
  private readonly galleryInfoEl: HTMLElement;
  /** 直前フレームでギャラリーが開いていたか。DOM表示切り替えを遷移時だけ行うために使う */
  private galleryWasOpen = false;
  /** 拠点の3D化(plan/town-3d-exploration.md)。倉庫・工房等の中身は変えず、
   * そこへ「歩いてたどり着く」入り口だけを差し替える */
  private readonly village = new VillageView(this.assets);
  private readonly villageHintEl: HTMLElement;
  /** 村なかを歩いている最中か。trueのあいだはダンジョン側のsubmitを止め、村の移動・確定だけを見る */
  private villageActive = false;

  private game!: Game;
  private save: SaveData;
  /** 入力を受け付けない残り時間。アニメーションが流れているあいだ */
  private lock = 0;
  private clock = new THREE.Clock();
  private elapsed = 0;
  private ended = false;
  /** 記録の間(plan/records-hall.md)。このダイブ中に倒した・捕まえた数 */
  private diveDefeats = 0;
  private diveCaptures = 0;
  /** 依頼板(plan/quest-board.md)。このダイブ中の討伐・図鑑・到達の集計 */
  private diveHuntKills: Record<string, number> = {};
  private diveNewlySeenCount = 0;
  private diveReachedDepths: number[] = [];
  /** 山の芯(plan/mountain-core.md)。このダイブで最終フロアの会話イベントを経験したか */
  private mountainCoreClearedThisRun = false;
  /** 真の目覚め(plan/true-awakening.md)。このダイブで「はじめの夢」との決着イベントを経験したか */
  private trueAwakeningClearedThisRun = false;
  /** エンドロール(plan/ending-sequence.md)。次にRキーで拠点へ戻るとき、その前にエンドロールを挟むか */
  private pendingEndingSequence = false;
  /** フォトモード(plan/gallery-mode.md)。HUDを隠し、移動・行動を止めて画角だけ動かせる */
  private photoMode = false;
  /** 操作説明(plan/difficulty-modes.md アクセシビリティ節)。表示中は行動を止める */
  private helpVisible = false;
  /** 拠点に覆われているあいだ、最後に洞窟を描いた時刻 */
  private lastCoveredRender = -Infinity;

  constructor() {
    this.canvas = document.querySelector<HTMLCanvasElement>("#scene")!;
    this.uiRoot = document.querySelector<HTMLElement>("#ui")!;
    this.renderer = new Renderer(this.canvas);
    this.stage = new Stage(this.renderer.scene, this.assets, this.audio);
    this.hud = new Hud(document.querySelector<HTMLElement>("#ui")!);
    this.minimap = new Minimap(document.querySelector<HTMLCanvasElement>("#minimap")!);
    // ミニマップのタップ拡大/縮小(plan/game/mobile-layout-redesign.md、未決事項への回答:
    // クラスをつけ外すだけの薄い配線で済むため採用する。pointer:coarse以外では
    // CSS側がpointer-events:noneのままなのでクリックは届かず、デスクトップの挙動は変わらない)
    new MinimapZoomToggle(document.querySelector<HTMLElement>("#minimap-wrap")!);
    this.menu = new InventoryMenu(document.querySelector<HTMLElement>("#menu")!);
    this.stanceMenu = new StanceMenu(document.querySelector<HTMLElement>("#stance")!);
    this.artsMenu = new ArtsMenu(document.querySelector<HTMLElement>("#arts")!);
    this.stairsConfirm = new StairsConfirmModal(document.querySelector<HTMLElement>("#stairsConfirm")!);
    this.endingScreen = new EndingScreen(document.querySelector<HTMLElement>("#ending")!);
    // タッチ操作(plan/touch-controls.md): Inputへ直接press/releaseするだけの
    // 入力ソースなので、以後参照する必要が無く、フィールドには保持しない。
    // 「≡」メニューの「ログ」(plan/game/mobile-layout-redesign.md)だけは
    // キーコードに変換できない専用アクションなので、コールバックで直接HUDへつなぐ
    new TouchControls(document.querySelector<HTMLElement>("#touch")!, this.canvas, this.input, () =>
      this.hud.showLogModal(),
    );
    // 縦持ちでの強制横向き(plan/game/archive/forced-landscape.md): matchMediaの
    // 監視結果をdocument.bodyへクラスとして反映するだけなので、以後参照する必要が無い
    new OrientationGuard();
    this.town = new TownScreen(document.querySelector<HTMLElement>("#town")!);
    this.namingRoot = document.querySelector<HTMLElement>("#naming")!;
    this.namingDialog = new NamingDialog(this.namingRoot);
    this.slotSelect = new SlotSelectScreen(document.querySelector<HTMLElement>("#slotSelect")!);
    // 出先デバッグパネル(plan/mobile-debug-panel.md): ?debug=1が無ければ
    // newすらしない(このURLSearchParamsチェック自体はほぼ無コスト)。DebugPanel
    // 自体はconsoleフック・Issue作成URL組み立て等をコンストラクタ内で完結させ、
    // 以後Appから参照する必要が無いためフィールドには保持しない
    if (isDebugEnabled(location.search)) {
      new DebugPanel(document.querySelector<HTMLElement>("#debugPanel")!, () => this.debugStats());
    }
    this.gallery = new GalleryView(this.assets);
    this.galleryInfoEl = document.querySelector<HTMLElement>("#gallery-info")!;
    this.villageHintEl = document.querySelector<HTMLElement>("#village-hint")!;
    // スロット選択(start()内)が終わるまでの仮値。beginWithSlot()で選んだ枠に差し替わる
    this.save = initialSave();

    this.input.onKey = (code) =>
      this.slotSelect.handleKey(code) ||
      this.town.handleKey(code) ||
      this.menu.handleKey(code) ||
      this.stanceMenu.handleKey(code) ||
      this.artsMenu.handleKey(code) ||
      this.stairsConfirm.handleKey(code) ||
      this.endingScreen.handleKey(code);

    // サウンド再生(plan/audio-playback.md): ブラウザの自動再生制限を避けるため、
    // AudioContextは最初の入力のタイミングで初めて作る。タッチUI
    // (plan/game/archive/touch-controls.md)はInput.press/releaseを直接
    // 呼びkeydownを発生させないため、pointerdownも解錠トリガーに加える
    // (plan/game/archive/touch-audio-unlock.md)。AudioPlayer.resume()は
    // 複数回呼ばれても安全なので、両方発火しても問題ない
    window.addEventListener("keydown", () => this.audio.resume(), { once: true });
    window.addEventListener("pointerdown", () => this.audio.resume(), { once: true });

    // ブラウザのピンチズーム抑止(plan/game/archive/pinch-zoom-block.md):
    // 仮想パッドとアクションボタンを同時操作すると、iOS Safariは2本目の指が
    // 別要素(canvas等)に触れていてもページピンチと解釈してしまう。要素単位の
    // touch-action だけでは塞ぎきれないため、iOS独自のgesturestart/gesturechange
    // をdocumentで直接止める(viewport metaのmaximum-scale/user-scalableは
    // iOS Safariが無視するため、Android Chrome等の側の対策として別途index.htmlに
    // ある)。ゲーム内の二本指カメラズーム(touch-controls.tsのPointerEvent実装)は
    // ブラウザ既定動作と独立しているため影響しない
    document.addEventListener("gesturestart", (e) => e.preventDefault());
    document.addEventListener("gesturechange", (e) => e.preventDefault());
  }

  async start(): Promise<void> {
    // 全部(22個・約1.4MB)を待ってから始めると、モンスターの種類が増える
    // たびに起動が延びる。地下1階に要るぶんだけ待って先に遊べる状態にし、
    // 残りは背景で追いかける。まだ届いていないモデルは Stage/DungeonView 側が
    // その回だけ飛ばし、届いた次のターンに拾うので、表示は破綻しない
    await this.assets.loadAll(essentialModelNames());
    this.assets.loadInBackground(modelNames());
    document.querySelector<HTMLElement>("#loading")!.style.display = "none";

    // セーブ枠(plan/save-slots.md)導入前の単一キーが残っていれば、slot0へ1回だけ移行する
    migrateLegacySaveIfNeeded();
    this.slotSelect.show(
      listSaveSlotSummaries(),
      (slot) => this.beginWithSlot(slot),
      (slot) => {
        deleteSaveSlot(slot);
        this.slotSelect.refresh(listSaveSlotSummaries());
      },
    );
  }

  /** セーブ枠を選び終えたら、その枠のデータで拠点/ダイブ再開を組み立てる */
  private beginWithSlot(slot: number): void {
    setActiveSlot(slot);
    this.slotSelect.hide();
    this.save = loadSave();
    this.applyFontSize();
    this.applyAudioSettings();
    this.applyLocale();

    // ダイブ中オートセーブ(plan/mid-dive-autosave.md)が残っていれば、
    // 拠点画面を経由せずそのままダイブの続きから再開する
    const snapshot = loadRunSnapshot();
    if (snapshot && snapshot.status === "playing") {
      this.resumeRun(snapshot);
    } else {
      if (snapshot) clearRunSnapshot(); // 正規に終わったあとの残骸(あるはずはないが念のため)
      // 先に1階を組んでおく。拠点の裏で洞窟が見えているほうが雰囲気が出る
      this.newRun([]);
      this.showTown();
    }
    this.loop();
  }

  /** 潜る前の拠点。倉庫から持ち込む道具・出発地点・鍛え方・仲間を選ぶ */
  private showTown(): void {
    this.hud.hideOverlay();
    this.audio.setBgm("village");
    // 気分の視覚演出(plan/mood-visual-effects.md): design/world.mdの
    // 「麓は現実側」という方針どおり、拠点では常に既定の見た目に戻す
    // (拠点の裏に見えている洞窟がダンジョン中の気分の色調を引きずらないように)
    this.renderer.setMoodVisual(MOOD_VISUALS[DEFAULT_MOOD_ID]);
    // 依頼板(plan/quest-board.md): 日付が変わっていれば、受注していない残り枠を補充する
    this.save = refreshBoard(this.save, todayKey());
    // 衣装(plan/costumes.md): 拠点に戻るたびに、新たに満たした解放条件が無いか確認する
    this.save = refreshUnlockedCostumes(this.save);
    // 章立て(plan/story-chapters.md): 拠点帰還のたびに、新しく跨いだ章が無いか確認する
    this.checkStoryChapterTransition();
    // 拠点の3D化(plan/town-3d-exploration.md): 従来はここで即座に拠点画面
    // (TownScreen)を開いていたが、まず村なかの3D空間を表示し、建物に
    // 近づいて確定したときだけ`openTownScreen`経由でTownScreenを開く
    this.setVillageActive(true);
    // 衣装(plan/game/archive/costumes.md): 村なかの自分の姿にも同じ色替えを反映する
    this.village.setCostumeTint(costumeById(this.save.equippedCostume).tint ?? null);
    this.village.reset();
  }

  /**
   * 村なか歩き(plan/game/archive/town-3d-exploration.md)の出入り。
   * ダイブ用のHUD(階数・HP・なかま・ミニマップ・ログ・メッセージ帯)は
   * 村では意味を持たず、直前のダイブの内容が残って見えてしまうので隠す。
   *
   * `#ui`ごと隠さないのは、仮想パッド・アクションボタン(`#touch`)が
   * その中にあるため。まとめて隠すとタッチ端末で村を歩けなくなる
   * (図鑑ギャラリーは移動しないので`#ui`ごと隠して差し支えない)。
   * 個々の要素のstyle.displayはそれぞれの描画処理が持っているので、
   * こちらはクラスの付け外しだけにして状態を奪わない
   */
  private setVillageActive(active: boolean): void {
    this.villageActive = active;
    this.uiRoot.classList.toggle("village-mode", active);
    // 建物ヒントはrenderVillage()の中でしか更新されない。村を出ると
    // 呼ばれなくなるため、「近くに建物があった」表示のまま固定されないよう
    // ここで必ず消す
    if (!active) this.villageHintEl.style.display = "none";
  }

  /**
   * 建物・村人ごとの役割メニュー(plan/game/archive/village-scoped-menus.md)。
   * 村なかで近づいた建物に対応する「開ける列の集合」と見出し(建物名)を
   * 指定して、既存のTownScreenをそのまま開く。TownScreen自身の中身
   * (各列の一覧・操作)は一切変えていない
   */
  private openTownScreen(
    openColumns: readonly number[],
    heading: string,
    initialColumn: number = openColumns[0] ?? 0,
    systemMenuMode = false,
    onClose?: () => void,
  ): void {
    this.setVillageActive(false);
    this.town.show(
      this.save,
      (carry, storage, startDepth, trainingFocus, bringAllyUids, difficulty, dungeonId) => {
        const { save: afterTake, taken } = takeFromHut(
          setDifficulty(setTrainingFocus({ ...this.save, storage }, trainingFocus), difficulty),
          bringAllyUids,
        );
        // 装備図鑑(plan/equipment-compendium.md): 出発時点で倉庫・持ち込み品を
        // まとめて走査し、入手・強化・刻印の記録を確定させる
        // 実績帳(plan/achievements.md): 続けて強化・刻印系の実績も確定させる
        this.save = checkAchievements(checkEquipmentCompendium(afterTake, carry), carry);
        saveData(this.save);
        this.newRun(carry, startDepth, trainingFocus, taken, difficulty, dungeonId);
      },
      (axisUid, foodUid) => {
        const fused = fuseMonsters(this.save, axisUid, foodUid);
        if (!fused) return;
        this.save = fused.save;
        this.town.refreshSave(this.save);
      },
      (uid, current) => {
        this.namingDialog.show("名前を付け直す", current, (value) => {
          const renamed = renameStoredMonster(this.save, uid, value);
          if (!renamed) return;
          this.save = renamed;
          this.town.refreshSave(this.save);
        });
      },
      (id) => {
        this.save = setEquippedTitle(this.save, id);
        this.town.refreshSave(this.save);
      },
      (defId) => {
        this.save = acceptQuest(this.save, defId);
        this.town.refreshSave(this.save);
      },
      (defId) => {
        this.save = abandonQuest(this.save, defId);
        this.town.refreshSave(this.save);
      },
      (uid) => {
        this.save = releaseCompanion(this.save, uid);
        this.town.refreshSave(this.save);
      },
      () => {
        this.save = developVillage(this.save);
        this.town.refreshSave(this.save);
      },
      (fontSize) => {
        this.save = setFontSize(this.save, fontSize);
        this.applyFontSize();
        this.town.refreshSave(this.save);
      },
      (costumeId) => {
        this.save = equipCostume(this.save, costumeId);
        this.town.refreshSave(this.save);
      },
      (npcId) => {
        // NPCサイドストーリー第1弾(plan/side-stories-part1.md)。話すこと自体は
        // 絆を上げない(絆は依頼達成・素材献上でのみ上がる)。新たに解放された
        // 一言があれば、拠点画面のNPCと話す列に表示する
        const { save: next, message } = talkToNpc(this.save, npcId);
        this.save = next;
        this.town.refreshSave(this.save);
        if (message) this.town.showNpcMessage(message);
      },
      (npcId, defId) => {
        this.save = giftMaterial(this.save, npcId, defId);
        saveData(this.save);
        this.town.refreshSave(this.save);
      },
      (uid) => {
        const toggled = toggleFavorite(this.save, uid);
        if (!toggled) return;
        this.save = toggled;
        this.town.refreshSave(this.save);
      },
      () => {
        const url = buildBugReportUrl({
          depth: this.game.depth,
          hp: this.game.player.hp,
          maxHp: this.game.player.maxHp,
          satiety: this.game.player.satiety,
          recentLog: this.hud.recentLog,
          userAgent: navigator.userAgent,
        });
        window.open(url, "_blank");
      },
      (defId) => {
        this.save = buyFestivalItem(this.save, defId);
        saveData(this.save);
        this.town.refreshSave(this.save);
      },
      (muted) => {
        this.save = setAudioMuted(this.save, muted);
        this.applyAudioSettings();
        this.town.refreshSave(this.save);
      },
      (volume) => {
        this.save = setAudioVolume(this.save, volume);
        this.applyAudioSettings();
        this.town.refreshSave(this.save);
      },
      (speed) => {
        this.save = setMessageSpeed(this.save, speed);
        this.town.refreshSave(this.save);
      },
      (locale) => {
        this.save = setSaveLocale(this.save, locale);
        this.applyLocale();
        this.town.refreshSave(this.save);
      },
      initialColumn,
      openColumns,
      heading,
      systemMenuMode,
      onClose,
    );
  }

  /**
   * 村なかで近づいた建物へ、確定キーで入る
   * (plan/game/archive/village-scoped-menus.md)。建物ごとの`columns`
   * (開ける列の集合)をそのまま渡す。宵祭りの出店(村の広場の17列目)だけは
   * 開催日でなければ最初から候補から外す(列自体は既存どおり非開催時の
   * 案内を出すが、建物への滞在中に左右キーで無駄に立ち寄らせないため)
   */
  private tryEnterVillageBuilding(): void {
    const building = this.village.nearBuilding();
    if (!building) return;
    const columns =
      building.id === "npcSquare" && !isYoimatsuri(todayKey())
        ? building.columns.filter((c) => c !== 17)
        : building.columns;
    this.openTownScreen(columns, building.label, columns[0] ?? 0, columns.length === 0, () =>
      this.setVillageActive(true),
    );
  }

  /**
   * システム系の「≡」メニュー(plan/game/archive/village-scoped-menus.md)。
   * アクセシビリティ・音・設定は、世界の中の場所(建物)ではなくゲームの外の
   * 設定なので、どの建物からも切り離し、村でもダイブ中でも共通のこの入口
   * から開く。ダイブ中に開いても、Spaceキーでの即時出発は起きない
   * (TownScreen側のsystemMenuMode)。閉じたら、村を歩いていたなら村へ、
   * ダイブ中だったならそのままダイブへ戻る
   */
  private openSystemMenu(): void {
    const wasVillageActive = this.villageActive;
    this.openTownScreen(SYSTEM_TOWN_COLUMNS, "設定", SYSTEM_TOWN_COLUMNS[0], true, () => {
      if (wasVillageActive) this.setVillageActive(true);
    });
  }

  /**
   * 章立て(plan/story-chapters.md)。新しく章の境目を跨いでいれば、その章の
   * 導入メッセージを1回だけ流す
   */
  private checkStoryChapterTransition(): void {
    const chapter = storyChapter(this.save.deepest, this.save.storyCleared);
    if (chapter === 0) return;
    const eventId = storyChapterEventId(chapter);
    if (this.save.seenVillageEvents.includes(eventId)) return;
    this.save = markVillageEventSeen(this.save, eventId);
    saveData(this.save);
    this.hud.log(STORY_CHAPTER_MESSAGES[chapter]);
    // 第三章「仲間探し」の崩落イベント(plan/chapter3-collapse-event.md): 章突入時、
    // モグラ婆から崩落を越えるための助言を追加で流す(design/story.mdの
    // 「ゲンドかモグラ婆の助言を受け」を受けての判断。育ての親・倉庫番という
    // 役割がら、仲間探しの助言役として自然だと判断した)
    if (chapter === 3) {
      this.hud.log("モグラ婆:「崩落の向こうへ進むには、瓦礫を砕ける仲間が要りそうだね」");
    }
  }

  private newRun(
    carry: readonly StoredItem[],
    startDepth = 1,
    trainingFocus: TrainingFocus = "balance",
    bringAllies: readonly StoredMonster[] = [],
    difficulty: DifficultyMode = "normal",
    dungeonId: string = MAIN_CAVE_ID,
  ): void {
    this.diveDefeats = 0;
    this.diveCaptures = 0;
    this.diveHuntKills = {};
    this.diveNewlySeenCount = 0;
    this.mountainCoreClearedThisRun = false;
    this.trueAwakeningClearedThisRun = false;
    this.diveReachedDepths = [];
    const startingItems: Item[] = carry.map((stored, index) => fromStored(stored, index + 1));
    this.game = new Game({
      seed: (Math.random() * 0xffffffff) >>> 0,
      startingItems,
      startDepth,
      trainingFocus,
      bringAllies: [...bringAllies],
      compendiumComplete: isCompendiumComplete(this.save),
      trueAwakeningCleared: this.save.trueAwakeningCleared,
      // ヨリシロの気分(plan/yorishiro-moods.md): 実際の日付から今日の気分を決める
      moodOverride: moodForDate(todayKey()).id,
      difficulty,
      dungeonId,
      deepest: this.save.deepest,
    });
    this.presentFloor();
    // 樽比べ(plan/tarukurabe-minigame.md): 通常ダイブの「階段をさがそう」は
    // 移動もできない専用モードでは的外れなので、専用の案内に差し替える
    if (dungeonId === TARUKURABE_ID) {
      this.hud.log(`タルは${this.game.tarukurabeBarrelsLeft}個。Fで持ち上げ、Gで投げて的を狙おう。`);
    } else {
      this.hud.log(`地下${this.game.depth}階。最深記録は ${this.save.deepest} 階。`);
      this.hud.log("洞窟に降りた。階段をさがそう。");
      // 「移動と攻撃」だけは特定のGameEventに紐づかないので、ここで直接出す
      this.showTutorialTip("moveAndAttack");
    }
  }

  /**
   * ダイブ中オートセーブ(plan/mid-dive-autosave.md)からの復帰。
   * スナップショットは読み込んだ瞬間に消費し、以後の何度目かの再読み込みでは
   * 復帰できないようにする(「1回限りのクラッシュ対策」であり、
   * セーブ&ロードによるやり直しは想定していない)。
   */
  private resumeRun(snapshot: RunSnapshot): void {
    // オートセーブは記録の間(plan/records-hall.md)の途中集計までは持たないため、
    // 復帰後ぶんだけを数える(クラッシュ前の分は失われるが、致命的ではない)
    this.diveDefeats = 0;
    this.diveCaptures = 0;
    this.diveHuntKills = {};
    this.diveNewlySeenCount = 0;
    this.mountainCoreClearedThisRun = false;
    this.trueAwakeningClearedThisRun = false;
    this.diveReachedDepths = [];
    this.game = new Game({ seed: 0, resume: snapshot });
    clearRunSnapshot();
    this.presentFloor();
    this.hud.log("前回の続きから再開します。");
  }

  /** 新しいダイブ・復帰したダイブ、どちらでも共通の画面まわりの初期化 */
  private presentFloor(): void {
    this.ended = false;
    this.lock = 0;
    this.menu.hide();
    this.stanceMenu.hide();
    this.artsMenu.hide();
    this.hud.hideOverlay();
    this.stage.enterFloor(this.game.floor);
    this.applyCostumeTint();
    this.applyCarriedBarrelVisual();
    this.renderer.setFocus(this.game.player.pos, true);
    this.hud.update(this.game.player, this.game.depth, this.game.allyList);
    this.minimap.draw(this.game.floor, this.game.player);
    this.updateDiveBgm();
    // 気分の視覚演出(plan/mood-visual-effects.md): ダイブ中に気分が変わることは
    // ないので、ダイブ開始・オートセーブ復帰のこの1回だけで確定させる
    this.renderer.setMoodVisual(MOOD_VISUALS[this.game.moodId]);
  }

  /**
   * サウンド再生(plan/audio-playback.md)。地方境界・地方ボスの階・真の目覚めの
   * 局面をまたいだときにBGMを切り替える。同じidならAudioPlayer側で無視される
   */
  private updateDiveBgm(): void {
    const bgm = this.bgmForDive(this.game.dungeonId, this.game.depth);
    if (bgm) this.audio.setBgm(bgm);
  }

  private bgmForDive(dungeonId: string, depth: number): string | undefined {
    if (dungeonId === TRUE_AWAKENING_ID) return "true-awakening";
    if (dungeonId === MAIN_CAVE_ID) {
      if (REGION_BOSS_FLOORS[depth]) return "boss";
      const regionIndex = Math.floor((depth - 1) / REGION_SIZE);
      return `region${regionIndex + 1}`;
    }
    // 近道屋の裏穴(plan/sound/archive/bgm-shortcut-back-hole.md)。5階通しで1曲
    if (dungeonId === "shortcutBackHole") return "shortcut";
    // 腕試しの間(plan/sound/archive/bgm-trial-chamber.md)。ボスごとに切り替えず通しで1曲
    if (dungeonId === TRIAL_CHAMBER_ID) return "trial-chamber";
    // 山の芯(plan/sound/archive/bgm-mountain-core.md)。3階通しで1曲
    if (dungeonId === MOUNTAIN_CORE_ID) return "mountain-core";
    // 樽比べ(plan/sound/archive/bgm-tarukurabe.md)
    if (dungeonId === TARUKURABE_ID) return "tarukurabe";
    // 夜ごとの夢(plan/sound/archive/bgm-nightly-dream.md)。深さ・周回数では曲を変えない
    if (dungeonId === NIGHTLY_DREAM_ID) return "nightly-dream";
    // 忘れ物蔵(plan/sound/bgm-lost-and-found-vault.md、別PRで対応予定)は
    // 現時点では未接続。直前のBGMを維持する
    return undefined;
  }

  /**
   * 衣装(plan/costumes.md)。フロアに入り直すたびにプレイヤーの見た目を
   * 作り直すので、そのつど装備中の衣装の色替えを掛け直す
   */
  private applyCostumeTint(): void {
    const costume = costumeById(this.save.equippedCostume);
    if (!costume.tint) return;
    this.stage.viewOf(this.game.player.id)?.applyTint(costume.tint);
  }

  /**
   * タルを抱えたまま階段を降りる等でフロアが切り替わると、
   * `Stage.enterFloor`がプレイヤーのActorViewを作り直すため、抱えている
   * タルの見た目(setCarriedで付けていた3Dモデル)だけが引き継がれずに
   * 消えてしまう(#185)。抱えている状態(player.carrying)はロジック側で
   * 保持され続けているので、フロアに入り直すたびに見た目を作り直す
   */
  private applyCarriedBarrelVisual(): void {
    const barrel = this.game.player.carrying;
    if (!barrel) return;
    this.stage.viewOf(this.game.player.id)?.setCarried(this.assets.instantiate(BARREL_MODELS[barrel.kind]).root);
  }

  /** その場方式のチュートリアルヒント。まだ見ていなければ表示して既読にする */
  private showTutorialTip(id: TutorialTipId): void {
    if (this.save.seenTutorialTips.includes(id)) return;
    this.save = markTutorialTipSeen(this.save, id);
    // 文言のタッチ対応(plan/game/mobile-layout-redesign.md): キー名を含むtipは
    // タッチ端末では言い換えを出す
    this.hud.log(tutorialTipText(id, currentInputMode()));
  }

  /**
   * 仲間になった瞬間の一時停止(plan/game/archive/companion-recruit-showcase.md)。
   * turnPlaybackの先頭の再生単位を再生する。末尾がrecruitイベントなら、
   * pendingRecruitShowcaseに記録するだけに留める。ここではまだダイアログを
   * 開かない(タルが飛んでいく等、recruit直前までの演出をlockが切れるまで
   * 最後まで見せたいので、loop()側でthis.lock<=0を待ってから開く)
   */
  private advanceTurnPlayback(): void {
    const playback = this.turnPlayback;
    if (!playback) return;
    const segment = playback.segments.shift();
    if (!segment) {
      this.turnPlayback = null;
      return;
    }
    this.lock = this.stage.applyEvents(segment, playback.floor, playback.hurry, playback.scale);
    const last = segment[segment.length - 1];
    if (last?.type === "recruit") {
      this.pendingRecruitShowcase = { actorId: last.actorId, name: last.name };
    } else if (playback.segments.length > 0) {
      // recruit以外で区切りが生まれることは無いはずだが、念のため止めずに続ける
      this.advanceTurnPlayback();
    } else {
      // これが最後の再生単位だった。次のsubmit()まで参照されないが、
      // 使い終わったfloorへの参照を持ち続けないようにここで手放す
      this.turnPlayback = null;
    }
  }

  /**
   * 仲間になった直後に名前をつけるか尋ねる(plan/game/archive/companion-naming.md)。
   * Escで「あとで」を選べ、ねむり小屋でいつでも改名できる。
   *
   * plan/game/archive/companion-recruit-showcase.md: 図鑑ギャラリーと同じ
   * GalleryView(回転台)にこの個体のモデルを乗せ、ダンジョンの描画を
   * 一時的にそちらへ丸ごと差し替える。HUDも図鑑ギャラリー・フォトモードと
   * 同じくこの間は隠す(uiRootの中に#namingがあるため、隠す前に確定させる)
   */
  private showRecruitShowcase(actorId: number, speciesName: string): void {
    const ally = this.game.allyList.find((a) => a.id === actorId);
    if (!ally) {
      // 万一見つからなければ(理論上起きないはずだが)ダイアログを出さず、
      // 保留していた残りの再生単位だけ続ける
      this.advanceTurnPlayback();
      return;
    }
    this.recruitShowcaseActive = true;
    this.recruitShowcaseModel = ally.model;
    this.uiRoot.style.display = "none";
    this.namingRoot.classList.add("naming-showcase");
    this.namingDialog.show(`${speciesName}に名前をつける?`, ally.nickname, (value) => {
      ally.nickname = value;
      this.hud.update(this.game.player, this.game.depth, this.game.allyList);
    });
  }

  /**
   * 命名ダイアログを閉じた(Enter確定・Escあとで、どちらも)直後にloop()から
   * 呼ばれる。隠していたHUDを戻し、保留していた残りの再生単位を再開する
   */
  private endRecruitShowcase(): void {
    this.recruitShowcaseActive = false;
    this.recruitShowcaseModel = null;
    this.uiRoot.style.display = "";
    this.namingRoot.classList.remove("naming-showcase");
    this.gallery.clear();
    this.advanceTurnPlayback();
  }

  /**
   * 仲間になった瞬間の見せ場(plan/game/archive/companion-recruit-showcase.md)。
   * 図鑑ギャラリーと同じ`renderGallery`の描画差し替えパターンを踏襲する。
   * 捕まえた直後なのでシルエットにはしない(silhouette=false)
   */
  private renderRecruitShowcase(dt: number): void {
    if (!this.recruitShowcaseModel) return;
    this.gallery.show(this.recruitShowcaseModel, false);
    this.gallery.update(dt);
    this.gallery.setAspect(this.renderer.camera.aspect);
    this.renderer.renderer.render(this.gallery.scene, this.gallery.camera);
  }

  /**
   * 図鑑ギャラリー(plan/gallery-mode.md)。ダンジョンの代わりに1体のモデルを
   * 回転台に乗せて表示する。「見た」段階はシルエット、「捕まえた」段階は
   * はっきり見える(`plan/achievements.md`の「隠さない」方針とは別の、
   * 図鑑そのものの到達感を守るための演出)
   */
  private renderGallery(dt: number, speciesId: string): void {
    if (!this.galleryWasOpen) {
      // フォトモード(issue #462)と同じ理由でCSSクラス方式にしてある。
      // #uiごと隠すと、その中にある#touchまで消えてタッチ端末では戻れなくなる
      this.uiRoot.classList.add("gallery-mode");
      this.galleryInfoEl.style.display = "block";
    }
    const species = speciesById(speciesId);
    const status = this.town.galleryStatus;
    this.gallery.show(species.model, status === "seen");
    this.gallery.update(dt);
    this.gallery.setAspect(this.renderer.camera.aspect);

    const lore = status === "captured" ? speciesLore(speciesId) : undefined;
    this.galleryInfoEl.innerHTML = "";
    const h = document.createElement("h2");
    h.textContent = status === "captured" ? species.name : "???";
    const p = document.createElement("p");
    p.textContent = lore ?? (status === "captured" ? "生態はまだ記録されていない。" : "実物を見ればもっとわかるかもしれない。");
    const hint = document.createElement("p");
    hint.className = "hint";
    // 文言のタッチ対応(plan/game/mobile-layout-redesign.md): 「Esc」はキーボード前提の表記
    hint.textContent = resolveText(
      { keyboard: "Escで戻る", touch: "決定ボタンで戻る" },
      currentInputMode(),
    );
    this.galleryInfoEl.append(h, p, hint);

    this.renderer.renderer.render(this.gallery.scene, this.gallery.camera);
  }

  /**
   * 拠点の3D化(plan/town-3d-exploration.md)。図鑑ギャラリーと同じく、
   * `Renderer`本体(ダンジョン用のシーン・カメラ)には触れず、
   * 生の`renderer.renderer`にだけ相乗りして別シーンを描く
   */
  private renderVillage(): void {
    this.village.setAspect(this.renderer.camera.aspect);
    this.renderer.renderer.render(this.village.scene, this.village.camera);

    const building = this.village.nearBuilding();
    // 建物・村人ごとの役割メニュー(plan/game/archive/village-scoped-menus.md):
    // ヒントに役割の一言を添える(例:「ゲンドの工房(強化・合成)」)
    const buildingLabel = building ? `${building.label}(${building.role})` : "";
    // 文言のタッチ対応(plan/game/mobile-layout-redesign.md): 「Space」はキーボード前提の表記
    this.villageHintEl.textContent = building
      ? resolveText(
          { keyboard: `Space: ${buildingLabel}へ`, touch: `決定ボタン: ${buildingLabel}へ` },
          currentInputMode(),
        )
      : "";
    this.villageHintEl.style.display = building ? "block" : "none";
  }

  // ------------------------------------------------------------ ループ

  private loop = (): void => {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.elapsed += dt;

    this.step(dt);

    // メッセージ帯とモーダルのゾーンが衝突する(issue #461)。開閉のたびに
    // 呼び出し口を増やすと漏れるので、毎フレーム今の開閉をそのまま渡す
    // (Hud側は変化が無ければ何もしない)
    this.hud.setBannerModalOpen(this.anyModalOpen());

    // 拠点画面はタッチUIを丸ごと覆ってしまう(issue #483)。開いているあいだ
    // だけ#touchを前に出すためのクラス。こちらも毎フレーム今の開閉を渡す
    this.uiRoot.classList.toggle("town-open", this.town.isOpen);

    // 仲間になった瞬間の一時停止(plan/game/archive/companion-recruit-showcase.md):
    // ダイアログが閉じていれば、隠していたHUDを戻して保留していた残りの
    // 演出を再開する(1ターンで複数体が同時に仲間になった場合は、続けて
    // 次のpendingRecruitShowcaseが立つ)。逆に、recruit直前までの演出
    // (タルが飛んでいく等)がまだ再生中(lock>0)のあいだはダイアログを
    // 開かず、通常のダンジョン描画のまま最後まで見せてから切り替える
    if (this.recruitShowcaseActive && !this.namingDialog.isOpen) {
      this.endRecruitShowcase();
    } else if (this.pendingRecruitShowcase && this.lock <= 0) {
      const { actorId, name } = this.pendingRecruitShowcase;
      this.pendingRecruitShowcase = null;
      this.showRecruitShowcase(actorId, name);
    }

    const gallerySpeciesId = this.town.gallerySpeciesId;
    if (this.recruitShowcaseActive) {
      this.renderRecruitShowcase(dt);
    } else if (gallerySpeciesId) {
      this.renderGallery(dt, gallerySpeciesId);
    } else if (this.villageActive) {
      this.renderVillage();
    } else {
      if (this.galleryWasOpen) {
        this.uiRoot.classList.remove("gallery-mode");
        this.galleryInfoEl.style.display = "none";
        this.gallery.clear();
      }
      this.stage.update(dt, this.elapsed);
      // 松明はプレイヤーの見た目の位置に付いてくる。マス単位の座標ではなく
      // 補間中の位置を使わないと、光だけが先に動いてしまう
      const here = this.stage.playerWorld(this.game.player);
      this.renderer.playerLight.position.set(here.x, 2.0, here.z);
      this.renderer.setFocus(this.game.player.pos);
      this.renderer.update(dt);
      this.drainDamageFx();
      // 1ターンの再生が流れているあいだは絵が動くので、影も追従させる。
      // 止まっているあいだは前のフレームの影マップをそのまま使う
      if (this.lock > 0) this.renderer.requestShadowUpdate();
      // 拠点は画面のほとんどを覆う(不透明度0.88)。裏で洞窟がうっすら見える
      // 演出は残したいので描画を止めはせず、更新の間隔だけ落とす。
      // 覆われている間に毎フレーム描いても、ほとんど誰にも見えない
      // (モバイルでは電池と発熱に直結する)
      if (!this.town.isOpen) {
        this.renderer.render();
      } else if (this.elapsed - this.lastCoveredRender >= COVERED_RENDER_INTERVAL) {
        this.lastCoveredRender = this.elapsed;
        this.renderer.render();
      }
    }
    this.galleryWasOpen = gallerySpeciesId !== null;

    requestAnimationFrame(this.loop);
  };

  /** menu.ts/stance.ts/arts.ts/stairsConfirm/town.ts/naming-dialog.tsのいずれかのモーダルが開いているか */
  private anyModalOpen(): boolean {
    return (
      this.menu.isOpen ||
      this.stanceMenu.isOpen ||
      this.artsMenu.isOpen ||
      this.stairsConfirm.isOpen ||
      this.town.isOpen ||
      this.namingDialog.isOpen
    );
  }

  private step(dt: number): void {
    this.lock = Math.max(0, this.lock - dt);
    // 画面基準の入力をワールドの方角へ直すための補正(issue #463)。
    // 村なかのカメラは回らない固定視点なので、そちらでは補正しない
    this.input.cameraQuadrant = this.villageActive ? 0 : this.renderer.cameraQuadrant;
    // 一歩/ダッシュ(plan/step-movement-and-dash.md): ロック中・メニュー
    // 表示中でも押している実時間はそのまま数えたいので、下の早期returnより
    // 前、毎フレーム欠かさず呼ぶ
    this.input.update(dt);

    // カメラ操作はいつでも受け付ける
    let action = this.input.takeAction();
    while (action) {
      if (this.handleGlobalAction(action)) {
        action = this.input.takeAction();
        continue;
      }
      // 拠点の3D化(plan/town-3d-exploration.md): 村なかでは、確定キーで
      // 近くの建物へ入る以外の行動(もちもの・技・タル等)は意味を持たないので捨てる
      if (this.villageActive) {
        if (action === "confirm") this.tryEnterVillageBuilding();
      } else if (
        !this.ended &&
        !this.anyModalOpen() &&
        !this.photoMode &&
        !this.helpVisible &&
        this.lock <= 0
      ) {
        this.handleAction(action);
      }
      action = this.input.takeAction();
    }

    if (this.villageActive) {
      this.village.update(dt, this.input.direction());
      return;
    }

    if (this.ended || this.anyModalOpen() || this.photoMode || this.helpVisible || this.lock > 0) {
      return;
    }

    const dir = this.input.direction();
    if (dir === null) return;
    if (this.input.turnOnly) {
      this.submit({ type: "face", dir });
      return;
    }

    // 一歩/ダッシュ(plan/step-movement-and-dash.md): 押した瞬間の1回は
    // 必ず一歩ぶん送る(タップ)。しきい値を超えて押し続けているあいだは
    // 従来どおり毎フレーム送り続ける(ダッシュ)
    if (!this.input.consumeTapMove() && !this.input.isDashing()) return;

    const before = this.game.player.pos;
    this.submit({ type: "move", dir });
    // 壁バンプ・敵の押し出しなど、その場に留まった場合はダッシュを打ち切る
    // (押し出しは移動コマンドとしては成立するが、プレイヤー自身は動かない
    // ので、壁にぶつかったときと同じ「その場で止まる」扱いにする)
    if (eq(this.game.player.pos, before)) this.input.cancelDash();
  }

  /** メニュー中でも受け付ける操作 */
  private handleGlobalAction(action: string): boolean {
    switch (action) {
      case "rotateLeft":
        // 手動カメラ操作(plan/gallery-interactive-camera.md): 図鑑ギャラリー表示中は
        // ダンジョンのカメラではなく回転台を回す
        if (this.town.gallerySpeciesId) this.gallery.rotate(1);
        else this.renderer.rotate(1);
        return true;
      case "rotateRight":
        if (this.town.gallerySpeciesId) this.gallery.rotate(-1);
        else this.renderer.rotate(-1);
        return true;
      case "zoomIn":
        if (this.town.gallerySpeciesId) this.gallery.zoom(-1);
        else this.renderer.zoom(-1.5);
        return true;
      case "zoomOut":
        if (this.town.gallerySpeciesId) this.gallery.zoom(1);
        else this.renderer.zoom(1.5);
        return true;
      case "photoMode":
        this.togglePhotoMode();
        return true;
      case "help":
        this.toggleHelp();
        return true;
      case "systemMenu":
        // システム系の「≡」メニュー(plan/game/archive/village-scoped-menus.md):
        // 他のモーダル・図鑑ギャラリー・写真モード・操作説明表示中、終了後は
        // 二重に開かない
        if (!this.anyModalOpen() && !this.ended && !this.photoMode && !this.helpVisible) {
          this.openSystemMenu();
        }
        return true;
      case "confirm":
        if (this.photoMode) {
          this.takePhoto();
          return true;
        }
        return false;
      case "restart":
        if (this.ended) {
          this.returnToTownAfterRun();
          return true;
        }
        // 生きていてめざめの階段の上にいれば、そこで区切って持ち帰る
        if (
          !this.anyModalOpen() &&
          !this.photoMode &&
          !this.helpVisible &&
          eq(this.game.player.pos, this.game.floor.stairs)
        ) {
          this.submit({ type: "bank" });
          return true;
        }
        return false;
      default:
        return false;
    }
  }

  /**
   * ダイブが終わったあと(全滅・踏破・樽比べ終了)に拠点へ戻る。
   * Rキーと、終了オーバーレイの「拠点にもどる」ボタン
   * (plan/game/gameover-touch-return.md)の共通の出口。
   * タッチ端末ではオーバーレイが画面全体を覆ってタッチUIを塞ぐため、
   * ボタンが無いと戻る手段が1つも無くなる
   */
  private returnToTownAfterRun(): void {
    // エンドロール(plan/ending-sequence.md): 物語クリアで初めてstoryCleared
    // が立った回だけ、拠点へ戻る前に挟む
    if (this.pendingEndingSequence) {
      this.pendingEndingSequence = false;
      this.endingScreen.show(() => this.showTown());
    } else {
      this.showTown();
    }
  }

  /**
   * 操作の一括確認(plan/difficulty-modes.md アクセシビリティ節)。
   * 現在使っているキー配置をいつでも呼び出せる
   */
  private toggleHelp(): void {
    if (this.helpVisible) {
      this.helpVisible = false;
      this.hud.hideOverlay();
      return;
    }
    if (this.anyModalOpen() || this.photoMode || this.villageActive || this.ended) {
      return;
    }
    this.helpVisible = true;
    // 操作説明一覧のタッチ対応(plan/game/mobile-layout-redesign.md):
    // タッチ端末では、キー名の代わりにパッド・ボタン名で書かれた一覧と、
    // 「≡」から閉じる案内を出す
    const touchMode = currentInputMode() === "touch";
    this.hud.showKeyHelp(
      touchMode ? KEY_REFERENCE_TOUCH : KEY_REFERENCE,
      touchMode ? t("hud.keyHelpHintTouch") : undefined,
      // タッチ端末では「≡」ボタンがオーバーレイの下に隠れて押せなくなるため、
      // オーバーレイ自体をタップしても閉じられるようにする(行き止まり防止)
      touchMode ? () => this.toggleHelp() : undefined,
    );
  }

  /**
   * アクセシビリティ(plan/difficulty-modes.md)。メッセージログ・メニューの
   * 文字サイズを`document.body`のdata属性に反映する(CSS側で拾う)
   */
  private applyFontSize(): void {
    document.body.dataset.fontSize = this.save.fontSize;
  }

  /** サウンド再生(plan/audio-playback.md)。セーブされたミュート・音量をAudioPlayerへ反映する */
  private applyAudioSettings(): void {
    this.audio.setMuted(this.save.audioMuted);
    this.audio.setMasterVolume(this.save.audioVolume);
  }

  /**
   * 多言語対応の土台(plan/i18n-foundation.md)。セーブされたlocaleに応じて
   * i18nの辞書を切り替える。第1段階時点はjaの辞書しか無いため、実質的には
   * 常にjaを適用するだけ(en.ts追加時にsave.localeで分岐させる)
   */
  private applyLocale(): void {
    applyLocaleDict(jaDict);
  }

  /**
   * フォトモード(plan/gallery-mode.md)の切り替え。HUDを隠し、既存の
   * カメラ操作(回転・ズーム)だけで画角を調整できるようにする。
   * ターン制なので、そもそも入力しない限り時間は進まない。
   *
   * 隠し方は村なか歩きと同じCSSクラス方式(`#ui.photo-mode`)。`#ui`ごと
   * display:noneにすると、その中にある`#touch`(仮想パッド・アクション
   * ボタン・「≡」)まで消えて、タッチ端末では撮影もフォトモードを抜けることも
   * できなくなる(issue #462)。撮影した写真はcanvasから起こすので、
   * タッチUIを残しても写り込まない
   */
  private togglePhotoMode(): void {
    if (this.photoMode) {
      this.photoMode = false;
      this.uiRoot.classList.remove("photo-mode");
      return;
    }
    if (this.anyModalOpen() || this.helpVisible || this.villageActive || this.ended) {
      return;
    }
    this.photoMode = true;
    this.uiRoot.classList.add("photo-mode");
  }

  /** 描画結果をそのまま画像として端末に保存する(セーブデータには含めない) */
  private takePhoto(): void {
    this.renderer.render();
    const dataUrl = this.canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `garudo-dungeon-${Date.now()}.png`;
    link.click();
  }

  private handleAction(action: string): void {
    switch (action) {
      case "inventory":
        this.menu.show(this.game.player, (cmd) => this.submit(cmd));
        break;
      case "wait":
        this.submit({ type: "wait" });
        break;
      case "liftBarrel":
        this.submit({ type: "liftBarrel" });
        break;
      case "throwBarrel":
        this.submit({ type: "throwBarrel" });
        break;
      case "attack":
        this.submit({ type: "attack" });
        break;
      case "orders":
        if (this.game.allyList.length === 0) {
          this.hud.log("指示できる仲間がいない。");
        } else {
          this.stanceMenu.show(this.game.allyList, (cmd) => this.submit(cmd));
        }
        break;
      case "arts":
        this.artsMenu.show(this.game.player, (cmd) => this.submit(cmd));
        break;
      case "confirm":
        // 足元の状況に応じて、階段を降りるか拾うかを選ぶ
        if (eq(this.game.player.pos, this.game.floor.stairs)) {
          // タルを抱えている場合はモーダルを開かせず、既存の警告
          // (plan/archive/barrel-stairs-safeguard.md)にそのまま委ねる
          if (this.game.player.carrying) {
            this.submit({ type: "descend" });
          } else {
            this.stairsConfirm.show(() => this.submit({ type: "descend" }));
          }
        } else {
          this.submit({ type: "pickup" });
        }
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------ コマンド実行

  /**
   * submit()の記録・進行管理。以前は同じevent.typeへの分岐が複数箇所に
   * 分かれて並んでいた(die・checkpoint・recruitがそれぞれ2箇所)ため、
   * 1種別=1エントリに統合した。1つのエントリの中の実行順は、統合前の
   * ソース上の並び順(上から下)をそのまま保っている
   */
  private buildSubmitEventHandlers(): SubmitEventHandlers {
    const noop = (): void => {};
    return {
      move: noop,
      bump: noop,
      face: noop,
      attack: noop,
      damage: noop,
      heal: noop,
      miss: noop,
      // 記録の間(plan/records-hall.md): 倒した数。依頼板: 討伐依頼の判定材料も集計する
      die: (event) => {
        if (event.kind !== "monster") return;
        this.diveDefeats++;
        if (event.speciesId) {
          this.diveHuntKills[event.speciesId] = (this.diveHuntKills[event.speciesId] ?? 0) + 1;
        }
      },
      spawn: noop,
      status: noop,
      statusEnd: noop,
      levelUp: noop,
      pickup: noop,
      drop: noop,
      useItem: noop,
      throwItem: noop,
      equip: noop,
      trap: noop,
      teleport: noop,
      swap: noop,
      liftBarrel: noop,
      putBarrel: noop,
      throwBarrel: noop,
      barrelBreak: noop,
      explosion: noop,
      // 記録の間(plan/records-hall.md): 捕まえた数
      capture: () => {
        this.diveCaptures++;
      },
      captureFailed: noop,
      // 名前を尋ねる・モデルを見せる処理そのものは、Stageの演出再生と
      // タイミングを合わせるためsubmit()側(advanceTurnPlayback)に移した。
      // ここでは記録だけを行う(plan/game/archive/companion-recruit-showcase.md)
      recruit: (event) => {
        const ally = this.game.allyList.find((a) => a.id === event.actorId);
        if (ally?.speciesId) this.save = markSpeciesCaptured(this.save, ally.speciesId);
      },
      descend: noop,
      // めざめの階段は、ダイブの結果によらず足を踏み入れた瞬間に記録する
      checkpoint: (event) => {
        this.save = addKnownCheckpoint(this.save, event.depth);
        this.diveReachedDepths.push(event.depth);
      },
      hungerWarning: noop,
      gameOver: noop,
      message: (event) => {
        this.hud.log(event.text);
      },
      tutorialTip: (event) => {
        this.showTutorialTip(event.id);
      },
      // モンスター図鑑(plan/monster-compendium.md): 見た・捕まえたを記録する。
      // 「知識は失われない」原則により、全滅した場合でも取り消さない
      monsterSighted: (event) => {
        // 依頼板(plan/quest-board.md): 図鑑依頼は「セーブ上まだ未確認だった」種族だけを数える
        // (このダイブで初めて見た、ではなく、これまでの記録として初めて見た、という判定)
        if (this.save.compendium[event.speciesId] === undefined) this.diveNewlySeenCount++;
        this.save = markSpeciesSeen(this.save, event.speciesId);
      },
      // 忘れ物蔵(plan/lost-and-found-vault.md): 隠し通路を見つけた瞬間に記録する。
      // ダイブの結果によらず記録されるべき事実なので、checkpointと同じ扱いにする
      secretPassageFound: (event) => {
        this.save = addFoundVaultPassage(this.save, event.regionId);
      },
      crackWarning: noop,
      // 山の芯(plan/mountain-core.md): 最終フロアの会話イベントを経験した記録
      mountainCoreCleared: () => {
        this.mountainCoreClearedThisRun = true;
      },
      // 真の目覚め(plan/true-awakening.md): 「はじめの夢」との決着イベントを経験した記録
      trueAwakeningCleared: () => {
        this.trueAwakeningClearedThisRun = true;
      },
      // 樽比べ(plan/tarukurabe-minigame.md): 実際の終了処理はgameOverと同じく
      // 下のevents.find(over)側で行う(finishTarukurabeがgame.tarukurabeScoreを
      // 直接読む)。このイベント自体はUI側への通知用で、ハンドラは無し
      tarukurabeFinished: noop,
    };
  }

  private submit(cmd: Command): void {
    const beforeDepth = this.game.depth;
    const events = this.game.command(cmd);
    if (events.length === 0) return;

    // このループの中の記録まわり(めざめの階段・図鑑・隠し通路)は、それぞれが
    // セーブ全体を書き出す作りになっている。1ターンで何度も同期書き込みが走ると
    // その場で操作が引っかかるので、書き込みは最後の1回にまとめる
    batchSaves(() => {
      const handlers = this.buildSubmitEventHandlers();
      for (const event of events) {
        (handlers[event.type] as (event: GameEvent) => void)(event);
      }
    });

    const changedFloor = this.game.depth !== beforeDepth;
    if (changedFloor) {
      this.stage.enterFloor(this.game.floor);
      this.applyCostumeTint();
      this.applyCarriedBarrelVisual();
      this.renderer.setFocus(this.game.player.pos, true);
      this.lock = 0.25;
      this.save = recordDeepest(this.save, this.game.depth);
      this.updateDiveBgm();
    } else {
      this.stage.syncActors(this.game.floor);
      // 仲間になった瞬間の一時停止(plan/game/archive/companion-recruit-showcase.md):
      // recruitイベントの直後で区切り、区切りごとに再生する。区切りが1つ
      // (recruit無し)なら、これまでどおり1回のapplyEventsで完結する
      this.turnPlayback = {
        segments: splitEventsAtRecruits(events),
        floor: this.game.floor,
        hurry: this.input.direction() !== null,
        scale: messageSpeedScale(this.save.messageSpeed),
      };
      this.advanceTurnPlayback();
      this.stage.updateActorVisibility(this.game.floor);
    }

    this.stage.dungeon.refresh(this.game.floor);
    this.hud.update(this.game.player, this.game.depth, this.game.allyList);
    this.minimap.draw(this.game.floor, this.game.player);
    // 盤面が変わったので、影も1度は作り直す(以後は再生が終わるまで毎フレーム更新)
    this.renderer.requestShadowUpdate();

    // ダイブ中オートセーブ(plan/mid-dive-autosave.md)。1ターンが解決するたびに
    // 現在の状態をまるごと書き出す。全滅・踏破・区切りで正規に終わったときは、
    // 続きから再開する必要がなくなるので消す(finish側でも消すが、ここでも
    // status の変化を漏れなく拾っておく)
    if (this.game.status === "playing") {
      saveRunSnapshot(this.game.toSnapshot());
    } else {
      clearRunSnapshot();
    }

    const over = events.find((e): e is Extract<GameEvent, { type: "gameOver" }> =>
      e.type === "gameOver",
    );
    if (over) {
      // 樽比べ(plan/tarukurabe-minigame.md): 通常のダイブ結果(持ち帰り・
      // 実績・依頼の集計)とは全く別物なので、finish()には通さない
      if (this.game.dungeonId === TARUKURABE_ID) {
        this.finishTarukurabe(over.reason);
      } else {
        this.finish(over.reason);
      }
    }
  }

  /**
   * 樽比べ(plan/tarukurabe-minigame.md)。recordRunは呼ばない(deepest・
   * 依頼板集計・持ち帰りといった通常ダイブの記録は一切発生しない、完全に
   * 独立したミニゲームのため)。自己ベスト・報酬・実績だけをrecordTarukurabeResult
   * にまとめて反映する
   */
  private finishTarukurabe(reason: string): void {
    this.ended = true;
    this.save = recordTarukurabeResult(this.save, this.game.tarukurabeScore);
    saveData(this.save);
    this.hud.showOverlay(
      "樽比べ終了!",
      `合計 ${this.game.tarukurabeScore} 点 ・ 自己ベスト ${this.save.tarukurabeBestScore} 点`,
      `${reason} — ${resolveText(RETURN_TO_TOWN_HINT, currentInputMode())}`,
      { label: RETURN_TO_TOWN_LABEL, onSelect: () => this.returnToTownAfterRun() },
    );
  }

  private finish(reason: string): void {
    this.ended = true;
    const cleared = this.game.status === "cleared";
    // エンドロール(plan/ending-sequence.md): 物語クリアで初めてstoryClearedが
    // 立つ回だけ、拠点へ戻る前にエンドロールを挟む。recordRunでsave.storyCleared
    // が更新される前に判定する必要がある
    this.pendingEndingSequence = this.mountainCoreClearedThisRun && !this.save.storyCleared;
    // 踏破したときだけ、持っていたもの・生きて連れていた仲間を持ち帰れる。倒れたら全部失う
    const broughtBack = cleared ? this.game.player.inventory.items : [];
    const broughtBackAllies = cleared ? [...this.game.allyList] : [];
    this.save = recordRun(this.save, {
      depth: this.game.depth,
      level: this.game.player.level,
      cleared,
      broughtBack,
      broughtBackAllies,
      // 倒した・捕まえた数は、全滅した回でも失わずに積み上げる
      // (design/balance-philosophy.mdの「知識・記録はロストしない」原則)
      defeats: this.diveDefeats,
      captures: this.diveCaptures,
      // 依頼板(plan/quest-board.md): 所持金は踏破・区切りでのみ持ち帰る。
      // 討伐・図鑑・探索の判定材料は全滅時でも記録として残す(こちらもロストしない)
      goldBroughtBack: cleared ? this.game.player.gold : 0,
      huntKills: this.diveHuntKills,
      newlySeenCount: this.diveNewlySeenCount,
      reachedDepths: this.diveReachedDepths,
      dungeonId: this.game.dungeonId,
      // 腕試しの間(plan/hidden-dungeon.md)の記録用
      turns: this.game.turnCount,
      damageTaken: this.game.damageTakenThisRun,
      // 実績帳「挑戦」カテゴリ(plan/challenge-achievements.md)
      usedItem: this.game.usedItemThisRun,
      usedMultipleWeapons: this.game.usedMultipleWeaponsThisRun,
      // 山の芯(plan/mountain-core.md): 倒した・全滅にかかわらず記録する
      defeatedRegionBosses: [...this.game.defeatedRegionBossesThisRun],
      mountainCoreCleared: this.mountainCoreClearedThisRun,
      trueAwakeningCleared: this.trueAwakeningClearedThisRun,
    });
    const detail = cleared
      ? `${reason}  持ち帰った ${broughtBack.length} 個を倉庫に、${broughtBackAllies.length} 体をねむり小屋にしまった。`
      : `${reason}  持ち込んだ道具・仲間はすべて失った。`;
    // エンドロール(plan/ending-sequence.md): 真の目覚めの締めくくりは、
    // エンドロールをまるごと再度流さず、短い一言だけを添える
    const trueAwakeningLine = this.trueAwakeningClearedThisRun ? " はじめの夢は、もう独りではないと知った。" : "";
    this.hud.showOverlay(
      cleared ? "だっしゅつ成功!" : "ちからつきた……",
      detail + trueAwakeningLine,
      `Lv ${this.game.player.level} / ${this.game.turnCount} ターン ・ ` +
        `最深記録 ${this.save.deepest} 階 — ${resolveText(RETURN_TO_TOWN_HINT, currentInputMode())}`,
      { label: RETURN_TO_TOWN_LABEL, onSelect: () => this.returnToTownAfterRun() },
    );
  }

  private drainDamageFx(): void {
    const queue = this.stage.damageQueue;
    while (queue.length > 0) {
      const fx = queue.shift()!;
      this.hud.spawnDamage(fx, this.renderer.camera, this.canvas);
    }
  }

  // ---------------------------------------------------------- 動作確認用

  /** 階段まで歩かずに次の階へ。ヘッドレスでの通し確認に使う */
  debugDescend(): void {
    this.game.player.pos = { ...this.game.floor.stairs };
    this.submit({ type: "descend" });
  }

  /**
   * 一番近いモンスターの隣に立ち、向かせたうえで、殴りかかるべきキー
   * (攻撃専用キー。plan/attack-button.md)を返す。移動キーでは「押し出し」に
   * なってしまい殴り合いにならないため、あらかじめfaceで向きだけ合わせておく
   */
  debugFightNearest(): { key: string; name: string } | { key: null; name: string } {
    const player = this.game.player;
    // 「殴り合いの流れを見せる」だけのテストで運悪く力尽きると、後続のタル/仲間の
    // 検証まで巻き添えで失敗する。ここは倒す側を見せたいので、プレイヤー側だけ
    // 底上げしておく(モンスター側はそのまま — 撃破までの流れは変えない)。
    player.maxHp = Math.max(player.maxHp, 999);
    player.hp = player.maxHp;
    const floor = this.game.floor;
    const monsters = floor.actors.filter((a) => a.kind === "monster" && a.alive);
    if (monsters.length === 0) return { key: null, name: "モンスターがいない" };

    let nearest = monsters[0]!;
    for (const m of monsters) {
      if (chebyshev(m.pos, player.pos) < chebyshev(nearest.pos, player.pos)) nearest = m;
    }
    // モンスターの西隣が空いていればそこへ(東を向く)、駄目なら東隣へ(西を向く)
    for (const [dx, dir] of [
      [-1, 2],
      [1, 6],
    ] as const) {
      const spot = { x: nearest.pos.x + dx, y: nearest.pos.y };
      if (!walkableAt(floor, spot)) continue;
      if (floor.actors.some((a) => a.alive && a.pos.x === spot.x && a.pos.y === spot.y)) continue;
      player.pos = spot;
      this.stage.viewOf(player.id)?.setPosition(spot);
      this.submit({ type: "face", dir });
      this.renderer.setFocus(player.pos, true);
      return { key: ATTACK_KEY_CODE, name: nearest.name };
    }
    return { key: null, name: `${nearest.name} の隣が空いていない` };
  }

  debugGive(defId: string): void {
    this.game.giveItem(defId);
    this.hud.update(this.game.player, this.game.depth, this.game.allyList);
  }

  /** 正面が開けている方向を向く。タルの落下先を確保するために使う */
  debugFaceOpenSide(): number | null {
    for (let dir = 0; dir < 8; dir++) {
      const d = DIRS[dir]!;
      const spot = { x: this.game.player.pos.x + d.x, y: this.game.player.pos.y + d.y };
      if (isFree(this.game.floor, spot)) {
        this.submit({ type: "face", dir: dir as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 });
        return dir;
      }
    }
    return null;
  }

  /** タルを抱えさせる。ヘッドレスでの確認用 */
  debugGiveBarrel(kind: "empty" | "bomb" | "caught", speciesId?: string): void {
    const barrel = this.game.giveBarrel(kind, speciesId);
    this.stage
      .viewOf(this.game.player.id)
      ?.setCarried(this.assets.instantiate(BARREL_MODELS[barrel.kind]).root);
    this.hud.update(this.game.player, this.game.depth, this.game.allyList);
  }

  /**
   * 目の前にモンスターを置いて、タルをぶつけられる状態にする。
   * 返す`key`は攻撃専用キー(plan/attack-button.md)。既にfaceで向かせて
   * あるので、押しっぱなしの移動(押し出しになってしまう)ではなく
   * この攻撃キーをtapして弱らせる想定
   */
  debugMonsterInFront(): { name: string; key: string } | null {
    const player = this.game.player;
    const monster = this.game.floor.actors.find((a) => a.kind === "monster" && a.alive);
    if (!monster) return null;
    for (const dir of [2, 6, 4, 0] as const) {
      const d = DIRS[dir]!;
      const spot = { x: player.pos.x + d.x, y: player.pos.y + d.y };
      if (!walkableAt(this.game.floor, spot)) continue;
      monster.pos = spot;
      // 吸い込みを試すあいだ倒れないよう頑丈にする。そのぶん殴り返してくるので、
      // プレイヤー側も検証が最後まで届くように底上げしておく
      monster.maxHp = 400;
      monster.hp = 400;
      this.game.player.maxHp = 400;
      this.game.player.hp = 400;
      this.submit({ type: "face", dir });
      this.stage.syncActors(this.game.floor);
      this.stage.viewOf(monster.id)?.setPosition(spot);
      return { name: monster.name, key: ATTACK_KEY_CODE };
    }
    return null;
  }

  /**
   * アニメーションの再生が終わって、次の入力を受け付けられる状態か。
   *
   * 通しプレイ(tools/playtest.mjs)の待ち合わせ用。固定時間で待つと、
   * 遅い環境では再生が終わる前に次の操作へ進んでしまい、後続の検査が
   * 巻き添えで落ちる。逆に速い環境では無駄に待つことになる。
   */
  debugIdle(): boolean {
    return this.lock <= 0;
  }

  /** 拠点の3D化(plan/town-3d-exploration.md)。通しプレイ(tools/playtest.mjs、
   * tools/auto-tester.mjs)が、村なかを歩いている最中かを判定するための入口 */
  debugVillageActive(): boolean {
    return this.villageActive;
  }

  /** 村なかで確定キーを押したときに入れる建物があれば、そのidを返す */
  debugVillageNearBuildingId(): string | null {
    return this.village.nearBuilding()?.id ?? null;
  }

  /**
   * 建物・村人ごとの役割メニュー(plan/game/archive/village-scoped-menus.md)。
   * 通しプレイ(tools/playtest.mjs)が特定の建物まで自律的に歩かせるための、
   * 村なかの現在位置
   */
  debugVillagePos(): { x: number; z: number } | null {
    return this.villageActive ? this.village.playerPos : null;
  }

  /**
   * 建物・村人ごとの役割メニュー(plan/game/archive/village-scoped-menus.md)。
   * 通しプレイ(tools/playtest.mjs)が、村マップの座標を見ながら狙った建物まで
   * 歩かせるための道しるべ(id・座標だけの一覧)
   */
  debugVillageBuildings(): { id: string; x: number; z: number }[] {
    return VILLAGE_BUILDINGS.map((b) => ({ id: b.id, x: b.x, z: b.z }));
  }

  /** 倒れたときの流れを確かめるために、わざと力尽きさせる */
  debugKill(): void {
    this.game.player.hp = 1;
    this.game.player.satiety = 0;
    this.submit({ type: "wait" });
  }

  debugStats(): Record<string, unknown> {
    const floor = this.game.floor;
    return {
      depth: this.game.depth,
      turn: this.game.turnCount,
      status: this.game.status,
      hp: `${this.game.player.hp}/${this.game.player.maxHp}`,
      satiety: Math.round(this.game.player.satiety),
      monsters: floor.actors.filter((a) => a.kind === "monster" && a.alive).length,
      allies: this.game.allyList.map((a) => `${a.name}(${a.hp}/${a.maxHp})`),
      barrels: floor.barrels.map((b) => b.kind),
      carrying: this.game.player.carrying?.kind ?? null,
      items: floor.items.length,
      traps: floor.traps.length,
      rooms: floor.rooms.length,
      log: [...document.querySelectorAll("#log div")].map((d) => d.textContent),
      exploredTiles: floor.tiles.filter((t) => t.explored).length,
      visibleTiles: floor.tiles.filter((t) => t.visible).length,
      drawCalls: this.renderer.renderer.info.render.calls,
      triangles: this.renderer.renderer.info.render.triangles,
    };
  }
}

const app = new App();
(globalThis as unknown as { __app: App }).__app = app;
app.start().catch((error: unknown) => {
  const loading = document.querySelector<HTMLElement>("#loading");
  if (loading) {
    loading.innerHTML = `<h1>読み込みに失敗しました</h1><p>${String(error)}</p>`;
  }
  console.error(error);
});
