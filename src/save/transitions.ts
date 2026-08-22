import type { AllyActor, Item } from "../core/types";
import type { TutorialTipId } from "../core/tutorial";
import { achievementDef } from "../entities/achievements";
import { COSTUMES, type CostumeDef } from "../entities/costumes";
import type { DifficultyMode } from "../entities/difficulty";
import {
  NIGHTLY_DREAM_ID,
  REGION_DUNGEON_IDS,
  REGION_SIZE,
  TRIAL_CHAMBER_ID,
  isRegionDungeonId,
} from "../entities/dungeons";
import { FESTIVAL_SHOP_OFFERS, isYoimatsuri } from "../entities/festivals";
import { HOKORA_DUST_DEF_ID, MARK_STONE_DEF_ID, MARKS, MAX_PLUS } from "../entities/forging";
import { MAX_ACTIVE_QUESTS, questDef, questsForDate, todayKey } from "../entities/quests";
import type { TrainingFocus } from "../entities/player";
import type { MessageSpeed } from "../entities/settings";
import type { LocaleId } from "../i18n";
import { type BondStage, bondStage } from "../entities/companionBond";
import {
  OTAMA_VISIT_STORY,
  type SideStoryDef,
  type SideStoryStage,
  sideStoryFor,
} from "../entities/sideStories";
import { storyChapter } from "../entities/story";
import {
  canDevelopVillage,
  hutCapacity,
  nextVillageStageRequirement,
  type VillageNpcId,
} from "../entities/village";
import { HAJIME_NO_YUME_ID, REGION_BOSS_ORDER, SPECIES } from "../entities/species";
import type { FontSize, SaveData, StoredItem, StoredMonster } from "./types";
import { TARUKURABE_PERFECT_SCORE, toStored } from "./types";
import {
  VALID_EQUIPMENT_DEF_IDS,
  VALID_MATERIAL_DEF_IDS,
  VALID_REGION_IDS,
  VALID_VILLAGE_NPC_IDS,
  WEAPON_DEF_IDS,
  clamp01,
} from "./initial";
import { saveData } from "./localStorage";
import { actorToStoredMonster } from "./storedMonster";

/** 最深記録(deepest)を、既存の記録より深ければ更新する。ダイブ中フロアを移動するたびに呼ぶ */
export function recordDeepest(current: SaveData, depth: number): SaveData {
  return { ...current, deepest: Math.max(current.deepest, depth) };
}

/**
 * チュートリアルヒントを既読にする。すでに既読なら何もしない
 * (呼び出し側は既読かどうかを問わず毎回呼んでよい)。
 */
export function markTutorialTipSeen(current: SaveData, id: TutorialTipId): SaveData {
  if (current.seenTutorialTips.includes(id)) return current;
  const next: SaveData = {
    ...current,
    seenTutorialTips: [...current.seenTutorialTips, id],
  };
  saveData(next);
  return next;
}

/** 鍛え方を保存する。次に拠点を開いたときの既定値になる */
export function setTrainingFocus(current: SaveData, focus: TrainingFocus): SaveData {
  if (current.trainingFocus === focus) return current;
  const next: SaveData = { ...current, trainingFocus: focus };
  saveData(next);
  return next;
}

/**
 * 難易度モード(plan/difficulty-modes.md)を保存する。あとから拠点でいつでも
 * 変更でき、ペナルティは無い(次回ダイブから反映される)
 */
export function setDifficulty(current: SaveData, difficulty: DifficultyMode): SaveData {
  if (current.difficulty === difficulty) return current;
  const next: SaveData = { ...current, difficulty };
  saveData(next);
  return next;
}

/** アクセシビリティ(plan/difficulty-modes.md)。メッセージログ・メニューの文字サイズを切り替える */
export function setFontSize(current: SaveData, fontSize: FontSize): SaveData {
  if (current.fontSize === fontSize) return current;
  const next: SaveData = { ...current, fontSize };
  saveData(next);
  return next;
}

/** サウンド再生(plan/audio-playback.md)。ミュートの切り替え */
export function setAudioMuted(current: SaveData, muted: boolean): SaveData {
  if (current.audioMuted === muted) return current;
  const next: SaveData = { ...current, audioMuted: muted };
  saveData(next);
  return next;
}

/** 設定画面(plan/settings-screen.md)。メッセージ・演出の速さを切り替える */
export function setMessageSpeed(current: SaveData, messageSpeed: MessageSpeed): SaveData {
  if (current.messageSpeed === messageSpeed) return current;
  const next: SaveData = { ...current, messageSpeed };
  saveData(next);
  return next;
}

/**
 * 多言語対応の土台(plan/i18n-foundation.md)。表示言語を切り替える。
 * i18n側の`setLocale`(現在の辞書を切り替える)と名前が衝突するため、
 * SaveDataフィールドの切り替えであることが分かるよう`setSaveLocale`と命名した
 */
export function setSaveLocale(current: SaveData, locale: LocaleId): SaveData {
  if (current.locale === locale) return current;
  const next: SaveData = { ...current, locale };
  saveData(next);
  return next;
}

/**
 * 樽比べ(plan/tarukurabe-minigame.md)。得点に応じた段階的な報酬(ほこら粉・
 * 刻印石)。計画書の未決事項だった具体的な品・個数は実装時に決定した。
 * 印は「ツブテガエルの印(タルを投げたときのダメージ+2)」を固定で選んだ
 * (5種の中で唯一タル投げに直接関わる印で、この的当てミニゲームと題材が
 * 揃うため。抽選にはせず、常に同じ印にすることでrng不要のまま組める)
 */
function tarukurabeReward(score: number): StoredItem[] {
  const dust = (n: number) => Array.from({ length: n }, () => ({ defId: HOKORA_DUST_DEF_ID }));
  const stone = (n: number) => Array.from({ length: n }, () => ({ defId: MARK_STONE_DEF_ID.tsubute }));
  if (score >= TARUKURABE_PERFECT_SCORE) return [...dust(5), ...stone(2)]; // 満点(上位)
  if (score >= 5) return [...dust(3), ...stone(1)]; // 中位
  if (score >= 3) return dust(2); // 下位
  return [];
}

/**
 * 樽比べ(plan/tarukurabe-minigame.md)。専用モード終了時に呼ぶ。自己ベストを
 * 更新し、得点段階に応じた報酬を倉庫に加え、実績を確認する
 */
export function recordTarukurabeResult(current: SaveData, score: number): SaveData {
  const reward = tarukurabeReward(score);
  const next: SaveData = {
    ...current,
    tarukurabeBestScore: Math.max(current.tarukurabeBestScore, score),
    storage: [...current.storage, ...reward],
  };
  const withAchievements = checkAchievements(next);
  saveData(withAchievements);
  return withAchievements;
}

/**
 * ひなたの寝穴(plan/game/tutorial-dungeon.md)。3階のめざめの階段で
 * 「区切って持ち帰る」を選んだときだけ呼ぶ(全滅時は呼ばない=hinataClearedは
 * 立たない。次回起動時にまた自動でひなたの寝穴へ誘導される)。
 * recordRunは呼ばない――踏破数・最深記録・依頼板の集計対象に含めない
 * (修練場のため)という本文の指示どおり、通常ダイブの記録を一切発生させない
 */
export function recordHinataClear(
  current: SaveData,
  broughtBack: Item[],
  broughtBackAllies: AllyActor[],
): SaveData {
  let nextHutUid = current.nextHutUid;
  const remainingHutCapacity = Math.max(0, hutCapacity(current.villageStage) - current.hut.length);
  const newlyStored: StoredMonster[] = broughtBackAllies.slice(0, remainingHutCapacity).map((actor) => {
    const stored = actorToStoredMonster(nextHutUid, actor);
    nextHutUid++;
    return stored;
  });
  const next: SaveData = {
    ...current,
    hinataCleared: true,
    storage: [...current.storage, ...broughtBack.map(toStored)],
    hut: [...current.hut, ...newlyStored],
    nextHutUid,
    compendium: newlyStored.reduce(
      (acc, m) => (m.speciesId ? { ...acc, [m.speciesId]: "captured" as const } : acc),
      current.compendium,
    ),
  };
  const withAchievements = checkAchievements(next);
  saveData(withAchievements);
  return withAchievements;
}

/** サウンド再生(plan/audio-playback.md)。マスター音量(0..1)を設定する */
export function setAudioVolume(current: SaveData, volume: number): SaveData {
  const clamped = clamp01(volume);
  if (current.audioVolume === clamped) return current;
  const next: SaveData = { ...current, audioVolume: clamped };
  saveData(next);
  return next;
}

function isCostumeUnlocked(costume: CostumeDef, save: SaveData): boolean {
  if (costume.unlock === "always") return true;
  switch (costume.unlock.kind) {
    case "compendiumComplete":
      return isCompendiumComplete(save);
    case "villageStage":
      return save.villageStage >= costume.unlock.stage;
    case "nightlyDreamDepth":
      return save.nightlyDreamBestDepth >= costume.unlock.depth;
    // NPCサイドストーリー(plan/side-stories-part2.md): 自動判定はしない。
    // talkToNpc側が対応する段の解放時に直接unlockedCostumesへ加える
    case "npcSideStory":
      return false;
  }
}

/**
 * 衣装(plan/costumes.md): 満たしている解放条件を確認し、新たに解放された
 * ものを記録に加える。実績帳と同じ「一度解放すれば記録はロストしない」方針
 */
export function refreshUnlockedCostumes(current: SaveData): SaveData {
  const newlyUnlocked = COSTUMES.filter(
    (c) => !current.unlockedCostumes.includes(c.id) && isCostumeUnlocked(c, current),
  ).map((c) => c.id);
  if (newlyUnlocked.length === 0) return current;
  const next: SaveData = { ...current, unlockedCostumes: [...current.unlockedCostumes, ...newlyUnlocked] };
  saveData(next);
  return next;
}

/** 衣装(plan/costumes.md): 解放済みの衣装だけを身につけられる */
export function equipCostume(current: SaveData, id: string): SaveData {
  if (current.equippedCostume === id) return current;
  if (!current.unlockedCostumes.includes(id)) return current;
  const next: SaveData = { ...current, equippedCostume: id };
  saveData(next);
  return next;
}

/**
 * 村の発展(plan/village-development.md)。次の段階の条件(撃破済み地方ボス数・
 * ゴールド)を満たしていなければ何もしない
 */
export function developVillage(current: SaveData): SaveData {
  if (!canDevelopVillage(current.villageStage, current.defeatedRegionBosses.length, current.gold)) return current;
  const requirement = nextVillageStageRequirement(current.villageStage);
  if (!requirement) return current;
  const next: SaveData = {
    ...current,
    villageStage: requirement.stage,
    gold: current.gold - requirement.cost,
  };
  saveData(next);
  return next;
}

/**
 * 宵祭りの出店(plan/yoimatsuri-festival.md)。宵祭りの日以外、または
 * 所持金が足りない場合は何もしない。品揃え・価格は固定(補充・売り切れの概念は持たない)
 */
export function buyFestivalItem(current: SaveData, defId: string, dateKey: string = todayKey()): SaveData {
  if (!isYoimatsuri(dateKey)) return current;
  const offer = FESTIVAL_SHOP_OFFERS.find((o) => o.defId === defId);
  if (!offer || current.gold < offer.price) return current;
  const next: SaveData = {
    ...current,
    gold: current.gold - offer.price,
    storage: [...current.storage, { defId: offer.defId }],
  };
  saveData(next);
  return next;
}

export function recordRun(
  current: SaveData,
  result: {
    depth: number;
    level: number;
    cleared: boolean;
    broughtBack: Item[];
    /**
     * 踏破・区切りで生きて連れ帰った仲間(plan/monster-fusion.mdの
     * 「帰還時の処理」)。全滅時は呼び出し側が空配列を渡す(道具と同じ扱い)
     */
    broughtBackAllies?: AllyActor[];
    /** 記録の間(plan/records-hall.md)。このダイブ中に倒した・捕まえた数 */
    defeats?: number;
    captures?: number;
    /** 踏破・区切りで持ち帰った所持金(plan/shops-and-thieves.md)。全滅時は0(持ち物と同じロスト規則) */
    goldBroughtBack?: number;
    /** 依頼板(plan/quest-board.md): このダイブ中に種族ごとに倒した数(討伐依頼の判定用) */
    huntKills?: Record<string, number>;
    /** 依頼板: このダイブ中に新たに図鑑「見た」にした種族数(図鑑依頼の判定用) */
    newlySeenCount?: number;
    /** 依頼板: このダイブ中に到達しためざめの階段の階(探索依頼の判定用) */
    reachedDepths?: number[];
    /** 複数のダンジョン(plan/multiple-dungeons.md): 潜っていたダンジョンid。省略時は表の寝穴 */
    dungeonId?: string;
    /** 腕試しの間(plan/hidden-dungeon.md): このダイブの経過ターン数・被ダメージ累計 */
    turns?: number;
    damageTaken?: number;
    /** 実績帳「挑戦」カテゴリ(plan/challenge-achievements.md): このダイブ中に道具(杖・巻物・食料等)を使ったか */
    usedItem?: boolean;
    /** 実績帳「挑戦」カテゴリ: このダイブ中に武器を持ち替えたか(素手・未装備からの初回装備は数えない) */
    usedMultipleWeapons?: boolean;
    /** 山の芯(plan/mountain-core.md): このダイブ中に撃破した地方ボスのspeciesId */
    defeatedRegionBosses?: string[];
    /** 山の芯(plan/mountain-core.md): このダイブで最終フロアの会話イベントを経験したか */
    mountainCoreCleared?: boolean;
    /** 真の目覚め(plan/true-awakening.md): このダイブで「はじめの夢」との決着イベントを経験したか */
    trueAwakeningCleared?: boolean;
  },
): SaveData {
  let nextHutUid = current.nextHutUid;
  // 村の発展(plan/village-development.md): ねむり小屋の収容数上限を超える分は
  // 連れ帰れない(小屋がいっぱいならそのぶんは夢の中に置いてくる)
  const remainingHutCapacity = Math.max(0, hutCapacity(current.villageStage) - current.hut.length);
  const newlyStored: StoredMonster[] = (result.broughtBackAllies ?? [])
    .slice(0, remainingHutCapacity)
    .map((actor) => {
      const stored = actorToStoredMonster(nextHutUid, actor);
      nextHutUid++;
      return stored;
    });

  const next: SaveData = {
    deepest: Math.max(current.deepest, result.depth),
    runs: current.runs + 1,
    clears: current.clears + (result.cleared ? 1 : 0),
    bestLevel: Math.max(current.bestLevel, result.level),
    hinataCleared: current.hinataCleared,
    // 踏破して帰ってきたぶんだけが倉庫に加わる。倒れた場合は持ち込み品が丸ごと消える
    storage: [...current.storage, ...result.broughtBack.map(toStored)],
    seenTutorialTips: current.seenTutorialTips,
    trainingFocus: current.trainingFocus,
    // 生きて連れ帰った仲間だけがねむり小屋に加わる。全滅時は何も加わらない
    hut: [...current.hut, ...newlyStored],
    nextHutUid,
    records: {
      totalDefeats: current.records.totalDefeats + (result.defeats ?? 0),
      totalCaptures: current.records.totalCaptures + (result.captures ?? 0),
    },
    // 図鑑(plan/monster-compendium.md): 生きて連れ帰った仲間の種族を「捕まえた」にする
    compendium: newlyStored.reduce(
      (acc, m) => (m.speciesId ? { ...acc, [m.speciesId]: "captured" as const } : acc),
      current.compendium,
    ),
    achievements: current.achievements,
    equippedTitle: current.equippedTitle,
    equipmentCompendium: current.equipmentCompendium,
    markCompendium: current.markCompendium,
    materialCompendium: current.materialCompendium,
    difficulty: current.difficulty,
    gold: current.gold + (result.goldBroughtBack ?? 0),
    boardDate: current.boardDate,
    boardOffers: current.boardOffers,
    activeQuests: current.activeQuests,
    completedQuestIds: current.completedQuestIds,
    nightlyDreamBestDepth:
      result.dungeonId === NIGHTLY_DREAM_ID
        ? Math.max(current.nightlyDreamBestDepth, result.depth)
        : current.nightlyDreamBestDepth,
    villageStage: current.villageStage,
    fontSize: current.fontSize,
    unlockedCostumes: current.unlockedCostumes,
    equippedCostume: current.equippedCostume,
    // 腕試しの間(plan/hidden-dungeon.md): 踏破したときだけ記録を1件積む。ロストしない
    arenaRecords:
      result.dungeonId === TRIAL_CHAMBER_ID && result.cleared
        ? [
            ...current.arenaRecords,
            {
              clearedAt: new Date().toISOString(),
              turns: result.turns ?? 0,
              damageTaken: result.damageTaken ?? 0,
            },
          ]
        : current.arenaRecords,
    bonds: current.bonds,
    seenVillageEvents: current.seenVillageEvents,
    lastGiftDates: current.lastGiftDates,
    foundVaultPassages: current.foundVaultPassages,
    lastPlayedAt: current.lastPlayedAt,
    defeatedRegionBosses: Array.from(
      new Set([...current.defeatedRegionBosses, ...(result.defeatedRegionBosses ?? [])]),
    ),
    storyCleared: current.storyCleared || (result.mountainCoreCleared ?? false),
    trueAwakeningCleared: current.trueAwakeningCleared || (result.trueAwakeningCleared ?? false),
    audioMuted: current.audioMuted,
    audioVolume: current.audioVolume,
    messageSpeed: current.messageSpeed,
    // 樽比べ(plan/tarukurabe-minigame.md): recordRunでは変化しない
    // (専用モードの結果はrecordTarukurabeResultが別途反映する)
    tarukurabeBestScore: current.tarukurabeBestScore,
    // 多言語対応の土台(plan/i18n-foundation.md): recordRunでは変化しない
    locale: current.locale,
  };
  // 依頼板(plan/quest-board.md): 受注中の依頼を判定し、達成していれば報酬を渡して外す
  const withQuests = resolveQuests(next, result);
  // 装備図鑑(plan/equipment-compendium.md): 持ち帰った装備・素材を反映してから、
  // 実績帳(plan/achievements.md)の判定に渡す
  const withEquipmentCompendium = checkEquipmentCompendium(withQuests);
  let withAchievements = checkAchievements(withEquipmentCompendium);
  // 難易度モード(plan/difficulty-modes.md): 「きびしい」専用の称号
  if (result.cleared && current.difficulty === "hard") {
    withAchievements = unlockAchievement(withAchievements, "hardModeClear");
  }
  withAchievements = checkChallengeAchievements(withAchievements, result);
  saveData(withAchievements);
  return withAchievements;
}

/**
 * 実績帳「挑戦」カテゴリ(plan/challenge-achievements.md、縛りプレイ実績)。
 * ダイブ結果に応じた即時判定。討伐累計等の「積み上がる系」の実績
 * (checkAchievements)とは別枠で扱う(性質が違うため無理に同じ関数にまとめない)。
 */
function checkChallengeAchievements(
  current: SaveData,
  result: { depth: number; cleared: boolean; dungeonId?: string; usedItem?: boolean; usedMultipleWeapons?: boolean },
): SaveData {
  if (!result.cleared) return current;
  // 「地方」は地方ダンジョン(plan/game/dungeon-per-region.md)だけの概念。他の
  // ダンジョンは全階がチェックポイントになる(design/multiple-dungeons.mdどおり
  // 地方の区切りを持たない)ため、挑戦実績の対象も地方ダンジョンに限る
  const dungeonId = result.dungeonId ?? REGION_DUNGEON_IDS[0];
  if (!isRegionDungeonId(dungeonId)) return current;
  let next = current;
  // 「1地方踏破」の判定は、地方ダンジョンの最終階(=ボスの間、地方ボス撃破階)
  // まで到達したかどうかで見る。区切って持ち帰ったタイミングと自然に一致する
  if (!result.usedItem && result.depth === REGION_SIZE) {
    next = unlockAchievement(next, "noItemRegion");
  }
  // 「表の寝穴フルクリア」は、最後の第八地方(めざめの前庭)ダンジョンの
  // クリアに読み替える。第八地方は第一〜第七地方を順に踏破しないと解放
  // されないため、ここへ到達しクリアした時点で全地方踏破済みと言える
  // (旧来の「48階連続ノーアイテム」から「第八地方単体ノーアイテム」に
  // 難度が変わる点は、地方ごとに入口を分けた設計上の帰結として受け入れる)
  const isFullClear = dungeonId === REGION_DUNGEON_IDS[REGION_DUNGEON_IDS.length - 1] && result.depth === REGION_SIZE;
  if (!isFullClear) return next;
  if (!result.usedItem) next = unlockAchievement(next, "noItemFullClear");
  if (!result.usedMultipleWeapons) next = unlockAchievement(next, "singleWeapon");
  if (!result.usedItem && !result.usedMultipleWeapons) {
    next = unlockAchievement(next, "noItemSingleWeapon");
  }
  return next;
}

/**
 * 依頼板(plan/quest-board.md)。受注中の依頼それぞれについて、このダイブの
 * 成果から達成条件を満たしたかを判定する。全滅時(result.broughtBack が
 * 空)は採取依頼が判定材料を失うため自然に不達成のままになる
 * (`design/balance-philosophy.md`の「その場の持ち物はロストする」原則どおり)。
 */
function resolveQuests(
  current: SaveData,
  result: {
    broughtBack: Item[];
    huntKills?: Record<string, number>;
    newlySeenCount?: number;
    reachedDepths?: number[];
  },
): SaveData {
  let gold = current.gold;
  let storage = current.storage;
  const remaining: { defId: string; progress: number }[] = [];
  const completed: string[] = [];

  for (const active of current.activeQuests) {
    const def = questDef(active.defId);
    if (!def) continue;
    const achieved = (() => {
      switch (def.kind) {
        case "hunt":
          return (result.huntKills?.[def.target.speciesId ?? ""] ?? 0) >= def.target.count;
        case "gather":
          return (
            result.broughtBack.filter((i) => i.defId === def.target.itemDefId).length >= def.target.count
          );
        case "explore":
          return (result.reachedDepths ?? []).includes(def.target.depth ?? -1);
        case "compendium":
          return (result.newlySeenCount ?? 0) >= def.target.count;
      }
    })();

    if (!achieved) {
      remaining.push(active);
      continue;
    }
    completed.push(def.id);
    gold += def.reward.gold ?? 0;
    for (const material of def.reward.materials ?? []) {
      storage = [...storage, ...Array.from({ length: material.count }, () => ({ defId: material.defId }))];
    }
  }

  if (completed.length === 0) return current;
  // 村の暮らし(plan/village-life.md): 依頼達成は肝いりのオトネの絆を上げる
  // (依頼板の「顔」がオトネであるため、達成数ぶん一律で加算する単純な割り当て)
  const bonds = { ...current.bonds, otone: (current.bonds.otone ?? 0) + completed.length };
  return {
    ...current,
    gold,
    storage,
    activeQuests: remaining,
    completedQuestIds: [...current.completedQuestIds, ...completed],
    bonds,
  };
}

/**
 * 依頼板(plan/quest-board.md)。日付が変わっていれば、受注していない
 * 残り枠だけを新しいオファーで補充する。受注済みの依頼(activeQuests)は
 * 日付が変わっても消えない
 */
export function refreshBoard(current: SaveData, dateKey: string): SaveData {
  if (current.boardDate === dateKey) return current;
  const activeIds = new Set(current.activeQuests.map((q) => q.defId));
  const excluded = new Set([...activeIds, ...current.completedQuestIds]);
  const openSlots = Math.max(0, MAX_ACTIVE_QUESTS - current.activeQuests.length);
  const offers = questsForDate(dateKey)
    .filter((q) => !excluded.has(q.id))
    .slice(0, openSlots)
    .map((q) => q.id);
  const next: SaveData = { ...current, boardDate: dateKey, boardOffers: offers };
  saveData(next);
  return next;
}

/** 依頼を受注する。既に3件受注済み、または既に受注中/達成済みなら何もしない */
export function acceptQuest(current: SaveData, defId: string): SaveData {
  if (current.activeQuests.length >= MAX_ACTIVE_QUESTS) return current;
  if (current.activeQuests.some((q) => q.defId === defId)) return current;
  if (current.completedQuestIds.includes(defId)) return current;
  if (!questDef(defId)) return current;
  const next: SaveData = {
    ...current,
    activeQuests: [...current.activeQuests, { defId, progress: 0 }],
    boardOffers: current.boardOffers.filter((id) => id !== defId),
  };
  saveData(next);
  return next;
}

/** 受注中の依頼を明示的に破棄する(達成扱いにはならない) */
export function abandonQuest(current: SaveData, defId: string): SaveData {
  if (!current.activeQuests.some((q) => q.defId === defId)) return current;
  const next: SaveData = {
    ...current,
    activeQuests: current.activeQuests.filter((q) => q.defId !== defId),
  };
  saveData(next);
  return next;
}

/**
 * 図鑑(plan/monster-compendium.md)に「見た」を記録する。既に「見た」以上
 * (見た・捕まえた)なら何もしない
 */
export function markSpeciesSeen(current: SaveData, speciesId: string): SaveData {
  if (current.compendium[speciesId] !== undefined) return current;
  const next: SaveData = { ...current, compendium: { ...current.compendium, [speciesId]: "seen" } };
  saveData(next);
  return next;
}

/**
 * 図鑑に「捕まえた」を記録する。タルで仲間にした、または夢あわせの
 * 糧にした種族のどちらもここを通る
 */
export function markSpeciesCaptured(current: SaveData, speciesId: string): SaveData {
  if (current.compendium[speciesId] === "captured") return current;
  const next: SaveData = { ...current, compendium: { ...current.compendium, [speciesId]: "captured" } };
  // 実績帳(plan/achievements.md): 図鑑を半分/全部埋めた実績をここで確定させる
  const withAchievements = checkAchievements(next);
  saveData(withAchievements);
  return withAchievements;
}

/**
 * 全種族を「捕まえた」まで埋めているか(かがやきの夢のかけらの出現率upの条件)。
 * 「はじめの夢」(plan/true-awakening.md)は判定対象から除く――isTrueAwakening
 * Unlockedがこの関数を条件のひとつに使っており、かつ「はじめの夢」自体は
 * その局面でしか出会えないため、含めてしまうと「図鑑を完成させないと局面に
 * 入れないが、その局面でしか捕まえられない種族がいる」という循環になって
 * しまう。「はじめの夢」ぶんは、文字どおりの完全制覇を望むプレイヤー向けの
 * おまけの捕獲対象という位置づけにする
 */
export function isCompendiumComplete(current: SaveData): boolean {
  return SPECIES.filter((s) => s.id !== HAJIME_NO_YUME_ID).every((s) => current.compendium[s.id] === "captured");
}

/**
 * 真の目覚め(隠し最終局面、plan/true-awakening.md)。design/postgame.md
 * どおり3系統のANDで判定する。3件目の実績数のしきい値は本文書の未決事項
 * だったため、現状の実績総数(trueAwakening自身を除く15件)の6〜7割
 * 程度を目安に、実装時の判断として10件とした
 */
const TRUE_AWAKENING_ACHIEVEMENT_THRESHOLD = 10;

export function isTrueAwakeningUnlocked(save: SaveData): boolean {
  return (
    isCompendiumComplete(save) &&
    REGION_BOSS_ORDER.every((id) => save.defeatedRegionBosses.includes(id)) &&
    Object.keys(save.achievements).length >= TRUE_AWAKENING_ACHIEVEMENT_THRESHOLD
  );
}

/**
 * 実績帳(plan/achievements.md)。指定した実績idを、まだ未達成なら現在日時で
 * 記録する。一度記録した実績は取り消さない(既に達成済みなら何もしない)
 */
export function unlockAchievement(current: SaveData, id: string): SaveData {
  if (current.achievements[id] !== undefined) return current;
  if (!achievementDef(id)) return current;
  const next: SaveData = {
    ...current,
    achievements: { ...current.achievements, [id]: new Date().toISOString() },
  };
  saveData(next);
  return next;
}

/**
 * 実績帳。既存のセーブフィールドから、しきい値ベースの実績をまとめて
 * 再評価する。達成イベント専用の監視処理を新設せず、記録の変わる箇所
 * (ダイブの成果反映・図鑑更新・拠点からの出発時など)で呼べばよい設計。
 * `extraItems` は、まだ倉庫に戻っていない持ち込み品(強化・刻印の実績判定に
 * 必要)を追加で走査したいときに渡す
 */
export function checkAchievements(current: SaveData, extraItems: readonly StoredItem[] = []): SaveData {
  let next = current;
  const captured = SPECIES.filter((s) => next.compendium[s.id] === "captured").length;
  if (captured * 2 >= SPECIES.length) next = unlockAchievement(next, "compendiumHalf");
  if (isCompendiumComplete(next)) next = unlockAchievement(next, "compendiumFull");
  if (next.records.totalDefeats >= 50) next = unlockAchievement(next, "defeats50");
  if (next.records.totalCaptures >= 10) next = unlockAchievement(next, "captures10");
  if (next.clears >= 1) next = unlockAchievement(next, "clear1");
  if (next.bestLevel >= 10) next = unlockAchievement(next, "level10");

  const items = [...next.storage, ...extraItems];
  if (items.some((i) => (i.plus ?? 0) >= MAX_PLUS)) next = unlockAchievement(next, "maxPlusReached");
  const forgedMarkIds = new Set(items.flatMap((i) => i.markIds ?? []));
  if (MARKS.every((m) => forgedMarkIds.has(m.id))) next = unlockAchievement(next, "allMarksForged");

  // 装備図鑑(plan/equipment-compendium.md): 武器図鑑コンプリートの称号
  if (isWeaponCompendiumComplete(next)) next = unlockAchievement(next, "weaponCompendiumComplete");

  // 真の目覚め(plan/true-awakening.md): 「はじめの夢」との決着イベントを経験した称号
  if (next.trueAwakeningCleared) next = unlockAchievement(next, "trueAwakening");

  // 樽比べ(plan/tarukurabe-minigame.md): 満点を出した記録
  if (next.tarukurabeBestScore >= TARUKURABE_PERFECT_SCORE) next = unlockAchievement(next, "tarukurabePerfect");

  return next;
}

/** 称号を身につける/外す。titleを持たない実績・未達成の実績は無視する */
export function setEquippedTitle(current: SaveData, id: string | undefined): SaveData {
  if (id !== undefined && (current.achievements[id] === undefined || !achievementDef(id)?.title)) {
    return current;
  }
  const next: SaveData = { ...current, equippedTitle: id };
  saveData(next);
  return next;
}

/**
 * 装備図鑑(plan/equipment-compendium.md)。倉庫(+持ち込み品)を走査し、
 * 武器・頭防具・装身具・印・素材の入手/極めた状態をまとめて更新する。
 * `unlockAchievement`と同じく、一度記録した段階は取り消さない
 * (頭防具・装身具・素材・印は、入手した時点で自動的に"mastered"/"owned"扱い。
 * 強化・刻印の概念があるのは武器だけ)
 */
export function checkEquipmentCompendium(current: SaveData, extraItems: readonly StoredItem[] = []): SaveData {
  const items = [...current.storage, ...extraItems];
  const equipmentCompendium = { ...current.equipmentCompendium };
  const markCompendium = { ...current.markCompendium };
  const materialCompendium = { ...current.materialCompendium };

  for (const item of items) {
    if (VALID_EQUIPMENT_DEF_IDS.has(item.defId) && equipmentCompendium[item.defId] !== "mastered") {
      const isWeapon = WEAPON_DEF_IDS.has(item.defId);
      // 頭防具・装身具は強化・刻印の概念が無いので、入手した時点で自動的に極めた扱い。
      // 武器は+9かつ印を刻んで初めて極めたになる
      const mastered = !isWeapon || ((item.plus ?? 0) >= MAX_PLUS && (item.markIds?.length ?? 0) > 0);
      equipmentCompendium[item.defId] = mastered ? "mastered" : "owned";
    }
    if (VALID_MATERIAL_DEF_IDS.has(item.defId)) materialCompendium[item.defId] = "owned";
    for (const markId of item.markIds ?? []) markCompendium[markId] = "owned";
  }

  const next: SaveData = { ...current, equipmentCompendium, markCompendium, materialCompendium };
  saveData(next);
  return next;
}

/** 武器図鑑を全系統「極めた」まで埋めているか(称号「樽守りの目利き」の条件) */
export function isWeaponCompendiumComplete(current: SaveData): boolean {
  return [...WEAPON_DEF_IDS].every((id) => current.equipmentCompendium[id] === "mastered");
}

/** 村の暮らし(plan/village-life.md): NPCの絆を上げる。存在しないNPCidは無視する */
export function raiseBond(current: SaveData, npcId: VillageNpcId, amount = 1): SaveData {
  if (!VALID_VILLAGE_NPC_IDS.has(npcId) || amount <= 0) return current;
  const nextLevel = (current.bonds[npcId] ?? 0) + amount;
  return { ...current, bonds: { ...current.bonds, [npcId]: nextLevel } };
}

/** 村の暮らし(plan/village-life.md): 挿話を「見た」として記録する。重複しない */
export function markVillageEventSeen(current: SaveData, eventId: string): SaveData {
  if (current.seenVillageEvents.includes(eventId)) return current;
  return { ...current, seenVillageEvents: [...current.seenVillageEvents, eventId] };
}

/**
 * 村の暮らし(plan/village-life.md): 素材をNPCに献上して絆を+1する。
 * 対象の素材を1個以上持っていて、かつそのNPCへ今日まだ渡していない場合だけ成立する。
 * 条件を満たさない場合は何も変えずそのまま返す(既存のacceptQuest等と同じ、静かな失敗パターン)。
 */
export function giftMaterial(current: SaveData, npcId: VillageNpcId, defId: string): SaveData {
  if (!VALID_VILLAGE_NPC_IDS.has(npcId)) return current;
  const today = todayKey();
  if (current.lastGiftDates[npcId] === today) return current;
  const index = current.storage.findIndex((item) => item.defId === defId);
  if (index < 0) return current;
  const storage = [...current.storage];
  storage.splice(index, 1);
  return raiseBond(
    { ...current, storage, lastGiftDates: { ...current.lastGiftDates, [npcId]: today } },
    npcId,
  );
}

/** 村の暮らし(plan/village-life.md): NPCの絆段階が今の記録で新たに跨いだか確認するための補助 */
export function villageNpcBondStage(current: SaveData, npcId: VillageNpcId): ReturnType<typeof bondStage> {
  return bondStage(current.bonds[npcId] ?? 0);
}

const BOND_STAGE_RANK: readonly BondStage[] = ["none", "familiar", "close", "irreplaceable"];

/**
 * NPCサイドストーリー第1弾(plan/side-stories-part1.md)・第2弾(plan/
 * side-stories-part2.md)。話しかけた結果、新たに解放された一言があれば
 * `message`を返す(無ければ沈黙する)。モグラ婆・ゲンド・オトネ・おキヨ・
 * ポチは絆段階(+追加条件)、目覚めたおたまは訪問回数(seenVillageEvents
 * の件数)で段が進む
 */
export function talkToNpc(current: SaveData, npcId: VillageNpcId): { save: SaveData; message?: string } {
  const story = sideStoryFor(npcId);
  if (story) return talkSideStoryNpc(current, npcId, story);
  if (npcId === "otama") return talkToOtama(current);
  return { save: current };
}

/** おキヨ第2段(plan/side-stories-part2.md): 図鑑を半分以上「捕まえた」で埋めているか */
function isCompendiumHalf(save: SaveData): boolean {
  const captured = SPECIES.filter((s) => save.compendium[s.id] === "captured").length;
  return captured * 2 >= SPECIES.length;
}

function sideStoryStageMet(current: SaveData, bondStageOfNpc: BondStage, s: SideStoryStage): boolean {
  if (BOND_STAGE_RANK.indexOf(bondStageOfNpc) < BOND_STAGE_RANK.indexOf(s.minBondStage)) return false;
  if (s.minDeepest !== undefined && current.deepest < s.minDeepest) return false;
  if (s.minCompletedQuests !== undefined && current.completedQuestIds.length < s.minCompletedQuests) return false;
  if (s.minVillageStage !== undefined && current.villageStage < s.minVillageStage) return false;
  if (s.requiresCompendiumHalf && !isCompendiumHalf(current)) return false;
  if (s.requiresCompendiumComplete && !isCompendiumComplete(current)) return false;
  if (
    s.minStoryChapter !== undefined &&
    storyChapter(current.defeatedRegionBosses.length, current.storyCleared) < s.minStoryChapter
  ) {
    return false;
  }
  if (s.requiresStoryCleared && !current.storyCleared) return false;
  if (
    s.requiredMaterialDefIds &&
    !s.requiredMaterialDefIds.every((defId) => current.storage.some((item) => item.defId === defId))
  ) {
    return false;
  }
  return true;
}

function talkSideStoryNpc(
  current: SaveData,
  npcId: VillageNpcId,
  story: SideStoryDef,
): { save: SaveData; message?: string } {
  const stage = bondStage(current.bonds[npcId] ?? 0);
  let resolvedIndex = -1;
  story.stages.forEach((s, i) => {
    if (sideStoryStageMet(current, stage, s)) resolvedIndex = i;
  });
  if (resolvedIndex < 0) return { save: current };

  const eventId = `sideStory:${npcId}:${resolvedIndex}`;
  if (current.seenVillageEvents.includes(eventId)) return { save: current };

  const resolvedStage = story.stages[resolvedIndex]!;
  let next = markVillageEventSeen(current, eventId);
  if (resolvedStage.rewardItemDefId) {
    let storage = [...next.storage];
    for (const defId of resolvedStage.requiredMaterialDefIds ?? []) {
      const idx = storage.findIndex((item) => item.defId === defId);
      if (idx >= 0) storage.splice(idx, 1);
    }
    storage = [...storage, { defId: resolvedStage.rewardItemDefId }];
    next = { ...next, storage };
  }
  if (resolvedStage.rewardCostumeId && !next.unlockedCostumes.includes(resolvedStage.rewardCostumeId)) {
    next = { ...next, unlockedCostumes: [...next.unlockedCostumes, resolvedStage.rewardCostumeId] };
  }
  saveData(next);
  return { save: next, message: resolvedStage.text };
}

function talkToOtama(current: SaveData): { save: SaveData; message?: string } {
  const seenCount = current.seenVillageEvents.filter((id) => id.startsWith("sideStory:otama:")).length;
  if (seenCount >= OTAMA_VISIT_STORY.length) return { save: current };
  const stage = OTAMA_VISIT_STORY[seenCount]!;
  if (stage.requiresStoryChapter3 && storyChapter(current.defeatedRegionBosses.length, current.storyCleared) !== 3) {
    return { save: current };
  }
  const eventId = `sideStory:otama:${seenCount}`;
  const next = markVillageEventSeen(current, eventId);
  saveData(next);
  return { save: next, message: stage.text };
}

/** 忘れ物蔵(plan/lost-and-found-vault.md): 隠し通路を見つけた記録を追加する。重複しない */
export function addFoundVaultPassage(current: SaveData, regionId: string): SaveData {
  if (!VALID_REGION_IDS.has(regionId) || current.foundVaultPassages.includes(regionId)) return current;
  const next = { ...current, foundVaultPassages: [...current.foundVaultPassages, regionId] };
  saveData(next);
  return next;
}
