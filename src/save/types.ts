import type { TutorialTipId } from "../core/tutorial";
import type { Item, MarkId } from "../core/types";
import type { DifficultyMode } from "../entities/difficulty";
import type { TrainingFocus } from "../entities/player";
import type { MessageSpeed } from "../entities/settings";
import type { LocaleId } from "../i18n";
import type { VillageStage } from "../entities/village";
import type { StoredMonster } from "../entities/storedMonster";
import { TARUKURABE_PERFECT_SCORE, type RunSnapshot, type RunStatus } from "../game";

export type { StoredMonster, RunSnapshot, RunStatus };
export { TARUKURABE_PERFECT_SCORE };

/** スロット選択画面の一覧表示用の要約 */
export interface SaveSlotSummary {
  slot: number;
  /** そのスロットにセーブデータが存在するか。falseなら「はじめる」表記にする */
  exists: boolean;
  deepest: number;
  villageStage: VillageStage;
  /** ISO8601。existsがfalseならundefined */
  lastPlayedAt?: string;
}

/** 倉庫に預けてあるアイテム。uid は挑戦ごとに振り直すので保存しない */
export interface StoredItem {
  defId: string;
  charges?: number;
  /** 強化値(+n)。武器・盾のみ。plan/equipment-forging.md 参照 */
  plus?: number;
  /** 刻んだ印。武器・盾のみ、最大2件(plan/dual-mark-equipment.md) */
  markIds?: MarkId[];
}

export interface SaveData {
  /** これまでに到達した最も深い階 */
  deepest: number;
  /** 挑戦した回数 */
  runs: number;
  /** 踏破した回数 */
  clears: number;
  /** 最高到達レベル */
  bestLevel: number;
  /** 拠点の倉庫 */
  storage: StoredItem[];
  /** 表示済みのチュートリアルヒントid(plan/tutorial.md、アーカイブ済み) */
  seenTutorialTips: TutorialTipId[];
  /**
   * 鍛え方(plan/protagonist-training.md、アーカイブ済み)。拠点で選んだ
   * 方針を次回も引き継ぐ。一度決めておけば以後は何も聞かれない。
   */
  trainingFocus: TrainingFocus;
  /**
   * ねむり小屋(plan/monster-fusion.md、アーカイブ済み)に預けてある仲間。
   * 収容数の上限は設けない(倉庫と同じ扱い)。
   */
  hut: StoredMonster[];
  /** ねむり小屋の次の連番。uidの衝突を避けるためだけに使う */
  nextHutUid: number;
  /**
   * 記録の間(plan/records-hall.md)。累計ダイブ回数(runs)・踏破回数
   * (clears)・最深記録(deepest)は既存フィールドをそのまま流用する
   */
  records: DiveRecords;
  /**
   * モンスター図鑑(plan/monster-compendium.md)。種族idごとに
   * "seen"(見た)/"captured"(捕まえた)を記録する。未登録キーは「未確認」扱い
   */
  compendium: Record<string, CompendiumStatus>;
  /**
   * 実績帳(plan/achievements.md)。実績id → 達成日時(ISO文字列)。
   * 一度記録した実績は、条件を後から満たさなくなっても取り消さない
   * (design/balance-philosophy.md の「知識・記録はロストしない」原則)
   */
  achievements: Record<string, string>;
  /** 現在身につけている称号の実績id。未選択ならundefined */
  equippedTitle?: string;
  /**
   * 装備図鑑(plan/equipment-compendium.md)。武器・頭防具・装身具のdefIdごとに
   * "owned"(入手済み)/"mastered"(極めた)を記録する。武器は+9かつ印を刻んで
   * 初めて"mastered"になり、頭防具・装身具は入手した時点で自動的に"mastered"
   * (強化・刻印の概念が無いため)
   */
  equipmentCompendium: Record<string, EquipmentCompendiumStatus>;
  /** 装備図鑑: 一度でも刻んだことのある印(plan/equipment-forging.md)。defIdではなくMarkIdをキーにする */
  markCompendium: Record<string, "owned">;
  /** 装備図鑑: 一度でも入手したことのある素材(ほこら粉・刻印石) */
  materialCompendium: Record<string, "owned">;
  /**
   * 難易度モード(plan/difficulty-modes.md)。拠点でいつでも選び直せる。
   * 次回ダイブから反映される(ダイブ中の切り替えは想定しない)
   */
  difficulty: DifficultyMode;
  /**
   * 持ち帰った所持金(plan/shops-and-thieves.md)。ダイブ中の`PlayerState.gold`
   * は毎回0から始まり、踏破・区切りで帰還した分だけここに積み上がる
   * (道具・仲間と同じロスト規則)
   */
  gold: number;
  /** 依頼板(plan/quest-board.md)。最後に依頼板を更新した日付キー(YYYY-MM-DD) */
  boardDate: string;
  /** 依頼板に並んでいる、まだ受注していない依頼id(最大 MAX_ACTIVE_QUESTS 件からactiveQuestsの分を引いた数) */
  boardOffers: string[];
  /** 受注中の依頼。最大 MAX_ACTIVE_QUESTS 件 */
  activeQuests: { defId: string; progress: number }[];
  /** 達成した依頼idの履歴。ロストしない */
  completedQuestIds: string[];
  /**
   * 複数のダンジョン(plan/multiple-dungeons.md)。「夜ごとの夢」(終わりのない
   * 周回モード)で過去に到達した最も深い階。表の寝穴のdeepestとは別に持つ
   * (上限のあるダンジョンと単純比較できないため)
   */
  nightlyDreamBestDepth: number;
  /**
   * 村の発展(plan/village-development.md)。既定は1(始まりの村)。
   * ねむり小屋の収容数上限(hutCapacity)はここから算出する
   */
  villageStage: VillageStage;
  /**
   * アクセシビリティ(plan/difficulty-modes.md)。メッセージログ・メニューの
   * 文字サイズ。既定は"normal"
   */
  fontSize: FontSize;
  /** 衣装・見た目カスタマイズ(plan/costumes.md)。解放済みの衣装id一覧("default"は常に含む) */
  unlockedCostumes: string[];
  /** 現在身につけている衣装id。既定は"default" */
  equippedCostume: string;
  /** 腕試しの間(plan/hidden-dungeon.md)。踏破するたびに記録が積み上がる。削除されない */
  arenaRecords: ArenaRecord[];
  /** 村の暮らし(plan/village-life.md)。NPCのid → 絆レベル(0始まり) */
  bonds: Record<string, number>;
  /** 村の暮らし: 一度見た挿話のid(演出の再生防止)。例: "bond:mogurababa:familiar" */
  seenVillageEvents: string[];
  /** 村の暮らし: NPCのid → 最後に素材を渡した日付キー(YYYY-MM-DD)。1日1回の献上制限に使う */
  lastGiftDates: Record<string, string>;
  /** 忘れ物蔵(plan/lost-and-found-vault.md)。見つけた隠し通路の地方id("region1"〜"region8")。削除されない */
  foundVaultPassages: string[];
  /**
   * セーブ枠(plan/save-slots.md)。ISO8601、最後にこのスロットへ書き込んだ日時。
   * スロット選択画面の一覧表示用。saveDataが呼ばれるたびに更新される
   */
  lastPlayedAt: string;
  /**
   * 山の芯(plan/mountain-core.md)。撃破済みの地方ボスのspeciesId一覧。
   * 初出のIDだけ追加し、重複しない。design/postgame.mdの「全地方ボス撃破」
   * 判定にも使い回せる
   */
  defeatedRegionBosses: string[];
  /**
   * 山の芯(plan/mountain-core.md)。3階の会話イベントを経験した時点でtrueになる。
   * design/postgame.mdが前提とする「物語クリア」の直接判定に使う
   */
  storyCleared: boolean;
  /**
   * 真の目覚め(plan/true-awakening.md)。「はじめの夢」との決着イベントを
   * 経験した時点でtrueになる。一度trueになったら戻らない(実績・かがやきの
   * 夢のかけら出現率ボーナスの判定に使う恒久フラグ)
   */
  trueAwakeningCleared: boolean;
  /**
   * ひなたの寝穴(plan/game/tutorial-dungeon.md)。チュートリアル専用ダンジョンを
   * 踏破済みかどうか。第一地方の解放条件・初回自動誘導の停止条件に使う
   */
  hinataCleared: boolean;
  /** サウンド再生(plan/audio-playback.md)。ミュート中かどうか */
  audioMuted: boolean;
  /** サウンド再生(plan/audio-playback.md)。マスター音量(0..1)。既定0.7 */
  audioVolume: number;
  /** 設定画面(plan/settings-screen.md)。メッセージ・演出の速さ。既定"normal" */
  messageSpeed: MessageSpeed;
  /** 樽比べ(plan/tarukurabe-minigame.md)。自己ベスト得点(0〜TARUKURABE_PERFECT_SCORE)。既定0 */
  tarukurabeBestScore: number;
  /**
   * 多言語対応の土台(plan/i18n-foundation.md)。表示言語。既定"ja"。
   * 第1段階時点では"en"の翻訳テーブルが無いため、実際に選べるのは"ja"のみ(LOCALES参照)
   */
  locale: LocaleId;
}

/** 腕試しの間(plan/hidden-dungeon.md)。踏破1回ぶんの記録 */
export interface ArenaRecord {
  clearedAt: string;
  turns: number;
  damageTaken: number;
}

/** アクセシビリティ(plan/difficulty-modes.md)。メッセージログ・メニューの文字サイズ */
export type FontSize = "normal" | "large";

/** "seen": 遭遇した。"captured": タルで捕まえた、または夢あわせの糧にした */
export type CompendiumStatus = "seen" | "captured";

export type EquipmentCompendiumStatus = "owned" | "mastered";

export interface DiveRecords {
  /** 倒したモンスターの累計数 */
  totalDefeats: number;
  /** タルで捕まえた累計数(夢に還した分も含む) */
  totalCaptures: number;
}

/** サウンド再生(plan/audio-playback.md)。マスター音量の既定値 */
export const DEFAULT_AUDIO_VOLUME = 0.7;

export function toStored(item: Item): StoredItem {
  const stored: StoredItem = { defId: item.defId };
  if (item.charges !== undefined) stored.charges = item.charges;
  if (item.plus !== undefined) stored.plus = item.plus;
  if (item.markIds !== undefined && item.markIds.length > 0) stored.markIds = item.markIds;
  return stored;
}

/** 倉庫のStoredItemを、ダイブに持ち込むItemへ戻す(uidはダイブごとに振り直す) */
export function fromStored(stored: StoredItem, uid: number): Item {
  const item: Item = { uid, defId: stored.defId };
  if (stored.charges !== undefined) item.charges = stored.charges;
  if (stored.plus !== undefined) item.plus = stored.plus;
  if (stored.markIds !== undefined && stored.markIds.length > 0) item.markIds = stored.markIds;
  return item;
}
