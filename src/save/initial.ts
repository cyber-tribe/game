import type { DreamArtId, MarkId, SkillId } from "../core/types";
import { TUTORIAL_TIP_IDS, type TutorialTipId } from "../core/tutorial";
import { ACHIEVEMENTS, achievementDef } from "../entities/achievements";
import { COSTUMES, DEFAULT_COSTUME_ID } from "../entities/costumes";
import { DIFFICULTY_MODES, type DifficultyMode } from "../entities/difficulty";
import { MARKS, MAX_MARK_SLOTS, MAX_PLUS } from "../entities/forging";
import { MAX_ACTIVE_QUESTS, QUESTS } from "../entities/quests";
import type { TrainingFocus } from "../entities/player";
import { MESSAGE_SPEEDS, type MessageSpeed } from "../entities/settings";
import { LOCALES, type LocaleId } from "../i18n";
import { DREAM_ARTS, MAX_DREAM_ARTS } from "../entities/dreamArts";
import { VILLAGE_NPCS, type VillageStage } from "../entities/village";
import { MAX_RECENT_FUSION_MATERIALS } from "../entities/evolution";
import { SKILLS } from "../entities/skills";
import { SPECIES } from "../entities/species";
import { ITEMS } from "../items/catalog";
import type { StoredMonster } from "../entities/storedMonster";
import {
  type ArenaRecord,
  type CompendiumStatus,
  DEFAULT_AUDIO_VOLUME,
  type DiveRecords,
  type EquipmentCompendiumStatus,
  type SaveData,
  type StoredItem,
} from "./types";

export type { SaveFieldSpec };

/** 一番最初の持ち物。手ぶらで放り出さない程度に */
const STARTER: StoredItem[] = [
  { defId: "healLeaf" },
  { defId: "healLeaf" },
  { defId: "hardBread" },
  { defId: "hatchet" },
];

const VALID_IDS = new Set(ITEMS.map((i) => i.id));

/**
 * SaveDataの1フィールドぶんの仕様(plan外のリファクタリング、Martin Fowler
 * PR14)。以前はSaveData33フィールドがinterface宣言・initialSave()・
 * loadSave()の3箇所に個別に列挙されており、フィールドを1つ足すたびに
 * 3箇所すべてに手を入れる必要があった。ここでは値レベルの情報源を
 * SAVE_FIELDS 1箇所にまとめ、initialSave/loadSaveはそこから機械的に
 * 組み立てる。recordRun()はフィールドごとに合流ルールが異なる
 * (加算・上限更新・条件付き更新など)本質的な複雑さのため、この表には
 * 含めていない
 */
interface SaveFieldSpec<T> {
  /** 新規セーブでの初期値。配列・オブジェクトは呼び出しのたびに新しいインスタンスを作る関数で渡す */
  default: T | (() => T);
  /** JSON.parse直後の(信頼できない)Partial<SaveData>から、妥当な値を1つ取り出す */
  sanitize: (parsed: Partial<SaveData>) => T;
}

type SaveFieldSpecs = { [K in keyof SaveData]-?: SaveFieldSpec<SaveData[K]> };

export const SAVE_FIELDS: SaveFieldSpecs = {
  deepest: { default: 0, sanitize: (p) => numberOr(p.deepest, 0) },
  runs: { default: 0, sanitize: (p) => numberOr(p.runs, 0) },
  clears: { default: 0, sanitize: (p) => numberOr(p.clears, 0) },
  bestLevel: { default: 1, sanitize: (p) => numberOr(p.bestLevel, 1) },
  storage: { default: () => STARTER.map((s) => ({ ...s })), sanitize: (p) => sanitizeStorage(p.storage) },
  seenTutorialTips: { default: () => [], sanitize: (p) => sanitizeTutorialTips(p.seenTutorialTips) },
  trainingFocus: { default: "balance", sanitize: (p) => sanitizeTrainingFocus(p.trainingFocus) },
  hut: { default: () => [], sanitize: (p) => sanitizeHut(p.hut) },
  nextHutUid: { default: 1, sanitize: (p) => numberOr(p.nextHutUid, nextHutUidFrom(sanitizeHut(p.hut))) },
  records: {
    default: () => ({ totalDefeats: 0, totalCaptures: 0 }),
    sanitize: (p) => sanitizeRecords(p.records),
  },
  compendium: { default: () => ({}), sanitize: (p) => sanitizeCompendium(p.compendium) },
  achievements: { default: () => ({}), sanitize: (p) => sanitizeAchievements(p.achievements) },
  equippedTitle: {
    default: undefined,
    sanitize: (p) => sanitizeEquippedTitle(p.equippedTitle, sanitizeAchievements(p.achievements)),
  },
  equipmentCompendium: {
    default: () => ({}),
    sanitize: (p) => sanitizeEquipmentCompendium(p.equipmentCompendium),
  },
  markCompendium: { default: () => ({}), sanitize: (p) => sanitizeMarkCompendium(p.markCompendium) },
  materialCompendium: { default: () => ({}), sanitize: (p) => sanitizeMaterialCompendium(p.materialCompendium) },
  difficulty: { default: "normal", sanitize: (p) => sanitizeDifficulty(p.difficulty) },
  gold: { default: 0, sanitize: (p) => Math.max(0, numberOr(p.gold, 0)) },
  boardDate: { default: "", sanitize: (p) => (typeof p.boardDate === "string" ? p.boardDate : "") },
  boardOffers: { default: () => [], sanitize: (p) => sanitizeQuestIdList(p.boardOffers) },
  activeQuests: { default: () => [], sanitize: (p) => sanitizeActiveQuests(p.activeQuests) },
  completedQuestIds: { default: () => [], sanitize: (p) => sanitizeQuestIdList(p.completedQuestIds) },
  nightlyDreamBestDepth: { default: 0, sanitize: (p) => Math.max(0, numberOr(p.nightlyDreamBestDepth, 0)) },
  villageStage: { default: 1, sanitize: (p) => sanitizeVillageStage(p.villageStage) },
  fontSize: { default: "normal", sanitize: (p) => (p.fontSize === "large" ? "large" : "normal") },
  unlockedCostumes: {
    default: () => [DEFAULT_COSTUME_ID],
    sanitize: (p) => sanitizeUnlockedCostumes(p.unlockedCostumes),
  },
  equippedCostume: {
    default: DEFAULT_COSTUME_ID,
    sanitize: (p) => sanitizeEquippedCostume(p.equippedCostume, sanitizeUnlockedCostumes(p.unlockedCostumes)),
  },
  arenaRecords: { default: () => [], sanitize: (p) => sanitizeArenaRecords(p.arenaRecords) },
  bonds: { default: () => ({}), sanitize: (p) => sanitizeBonds(p.bonds) },
  seenVillageEvents: { default: () => [], sanitize: (p) => sanitizeStringList(p.seenVillageEvents) },
  lastGiftDates: { default: () => ({}), sanitize: (p) => sanitizeLastGiftDates(p.lastGiftDates) },
  foundVaultPassages: { default: () => [], sanitize: (p) => sanitizeFoundVaultPassages(p.foundVaultPassages) },
  lastPlayedAt: {
    default: () => new Date().toISOString(),
    sanitize: (p) => (typeof p.lastPlayedAt === "string" ? p.lastPlayedAt : new Date(0).toISOString()),
  },
  defeatedRegionBosses: {
    default: () => [],
    sanitize: (p) => sanitizeDefeatedRegionBosses(p.defeatedRegionBosses),
  },
  storyCleared: { default: false, sanitize: (p) => p.storyCleared === true },
  trueAwakeningCleared: { default: false, sanitize: (p) => p.trueAwakeningCleared === true },
  hinataCleared: { default: false, sanitize: (p) => p.hinataCleared === true },
  audioMuted: { default: false, sanitize: (p) => p.audioMuted === true },
  audioVolume: {
    default: DEFAULT_AUDIO_VOLUME,
    sanitize: (p) => clamp01(numberOr(p.audioVolume, DEFAULT_AUDIO_VOLUME)),
  },
  messageSpeed: { default: "normal", sanitize: (p) => sanitizeMessageSpeed(p.messageSpeed) },
  tarukurabeBestScore: { default: 0, sanitize: (p) => Math.max(0, numberOr(p.tarukurabeBestScore, 0)) },
  locale: { default: "ja", sanitize: (p) => sanitizeLocale(p.locale) },
};

const SAVE_FIELD_KEYS = Object.keys(SAVE_FIELDS) as (keyof SaveData)[];

function resolveDefault<T>(spec: SaveFieldSpec<T>): T {
  return typeof spec.default === "function" ? (spec.default as () => T)() : (spec.default as T);
}

/** equippedTitleのように値がundefinedなフィールドは、キー自体を持たせない(元のinitialSave()と同じ挙動) */
export function buildSaveData(resolve: (key: keyof SaveData) => unknown): SaveData {
  const out: Record<string, unknown> = {};
  for (const key of SAVE_FIELD_KEYS) {
    const value = resolve(key);
    if (value !== undefined) out[key] = value;
  }
  return out as unknown as SaveData;
}

export function initialSave(): SaveData {
  return buildSaveData((key) => resolveDefault(SAVE_FIELDS[key] as SaveFieldSpec<unknown>));
}

const VALID_MARK_IDS = new Set(MARKS.map((m) => m.id));

/**
 * セーブ内の3つの繰り返しパターンをまとめた汎用コンビネータ(plan外の
 * リファクタリング、Martin Fowler PR13)。壊れたセーブ・改変されたセーブへの
 * 耐性(ADR 0009)はここに集約し、個々のsanitizeXxxは「何が妥当か」だけを
 * 渡す薄いラッパーにする。field-by-fieldで複雑な検証をする関数
 * (sanitizeStorage・sanitizeHut等)はこの3パターンに当てはまらないため、
 * 従来どおり個別に書く
 */

/** 配列フィールド: validIdsに無い要素は捨てる。dedupなら初出順を保って重複除去する */
function sanitizeIdList<T extends string>(
  value: unknown,
  validIds: ReadonlySet<T>,
  opts?: { dedup?: boolean },
): T[] {
  if (!Array.isArray(value)) return [];
  const filtered = value.filter((v): v is T => typeof v === "string" && validIds.has(v as T));
  return opts?.dedup ? [...new Set(filtered)] : filtered;
}

/** Record<id, 値>フィールド: validKeysに無いキーと、sanitizeValueがundefinedを返した値は捨てる */
function sanitizeRecordOf<K extends string, V>(
  value: unknown,
  validKeys: ReadonlySet<K>,
  sanitizeValue: (raw: unknown) => V | undefined,
): Record<K, V> {
  const out = {} as Record<K, V>;
  if (typeof value !== "object" || value === null) return out;
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!validKeys.has(key as K)) continue;
    const sanitized = sanitizeValue(raw);
    if (sanitized !== undefined) out[key as K] = sanitized;
  }
  return out;
}

/** 単一の値フィールド: validValuesのどれとも一致しなければfallbackに差し替える */
function sanitizeEnum<T>(value: unknown, validValues: readonly T[], fallback: T): T {
  return (validValues as readonly unknown[]).includes(value) ? (value as T) : fallback;
}

function sanitizeStorage(value: unknown): StoredItem[] {
  if (!Array.isArray(value)) return initialSave().storage;
  const out: StoredItem[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const defId = (entry as StoredItem).defId;
    if (typeof defId !== "string" || !VALID_IDS.has(defId)) continue;
    const stored: StoredItem = { defId };
    const charges = (entry as StoredItem).charges;
    if (typeof charges === "number") stored.charges = charges;
    const plus = (entry as StoredItem).plus;
    if (typeof plus === "number" && Number.isInteger(plus) && plus >= 0 && plus <= MAX_PLUS) {
      stored.plus = plus;
    }
    // dual-mark-equipment.md以前のセーブは単数形markIdを持つ。
    // markIds: [markId] へ読み替える(この1箇所限りのマイグレーション)
    const legacyMarkId = (entry as { markId?: unknown }).markId;
    const rawMarkIds = (entry as { markIds?: unknown }).markIds;
    let markIds: MarkId[] | undefined;
    if (Array.isArray(rawMarkIds)) {
      markIds = rawMarkIds.filter((m): m is MarkId => typeof m === "string" && VALID_MARK_IDS.has(m as MarkId));
    } else if (typeof legacyMarkId === "string" && VALID_MARK_IDS.has(legacyMarkId as MarkId)) {
      markIds = [legacyMarkId as MarkId];
    }
    if (markIds && markIds.length > 0) {
      stored.markIds = markIds.slice(0, MAX_MARK_SLOTS);
    }
    out.push(stored);
  }
  return out;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function sanitizeRecords(value: unknown): DiveRecords {
  const v = (value ?? {}) as Partial<DiveRecords>;
  return {
    totalDefeats: numberOr(v.totalDefeats, 0),
    totalCaptures: numberOr(v.totalCaptures, 0),
  };
}

const VALID_COMPENDIUM_STATUSES: readonly CompendiumStatus[] = ["seen", "captured"];

function sanitizeCompendium(value: unknown): Record<string, CompendiumStatus> {
  return sanitizeRecordOf<string, CompendiumStatus>(value, VALID_SPECIES_IDS, (status) =>
    sanitizeEnum<CompendiumStatus | undefined>(status, VALID_COMPENDIUM_STATUSES, undefined),
  );
}

const VALID_QUEST_IDS = new Set(QUESTS.map((q) => q.id));

function sanitizeQuestIdList(value: unknown): string[] {
  return sanitizeIdList(value, VALID_QUEST_IDS);
}

function sanitizeActiveQuests(value: unknown): { defId: string; progress: number }[] {
  if (!Array.isArray(value)) return [];
  const out: { defId: string; progress: number }[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const defId = (entry as { defId?: unknown }).defId;
    const progress = (entry as { progress?: unknown }).progress;
    if (typeof defId !== "string" || !VALID_QUEST_IDS.has(defId)) continue;
    out.push({ defId, progress: typeof progress === "number" && Number.isFinite(progress) ? progress : 0 });
  }
  return out.slice(0, MAX_ACTIVE_QUESTS);
}

function sanitizeAchievements(value: unknown): Record<string, string> {
  return sanitizeRecordOf<string, string>(value, VALID_ACHIEVEMENT_IDS, (date) =>
    typeof date === "string" ? date : undefined,
  );
}

export const VALID_EQUIPMENT_DEF_IDS = new Set(
  ITEMS.filter((i) => i.category === "weapon" || i.category === "head" || i.category === "charm").map(
    (i) => i.id,
  ),
);
export const VALID_MATERIAL_DEF_IDS = new Set(ITEMS.filter((i) => i.category === "material").map((i) => i.id));
export const WEAPON_DEF_IDS = new Set(ITEMS.filter((i) => i.category === "weapon").map((i) => i.id));

function sanitizeEquipmentCompendium(value: unknown): Record<string, EquipmentCompendiumStatus> {
  return sanitizeRecordOf<string, EquipmentCompendiumStatus>(value, VALID_EQUIPMENT_DEF_IDS, (status) =>
    status === "owned" || status === "mastered" ? status : undefined,
  );
}

function sanitizeEquippedTitle(value: unknown, achievements: Record<string, string>): string | undefined {
  if (typeof value !== "string") return undefined;
  if (achievements[value] === undefined) return undefined;
  if (!achievementDef(value)?.title) return undefined;
  return value;
}

function sanitizeMarkCompendium(value: unknown): Record<string, "owned"> {
  return sanitizeRecordOf<string, "owned">(value, VALID_MARK_IDS, (status) =>
    status === "owned" ? "owned" : undefined,
  );
}

function sanitizeMaterialCompendium(value: unknown): Record<string, "owned"> {
  return sanitizeRecordOf<string, "owned">(value, VALID_MATERIAL_DEF_IDS, (status) =>
    status === "owned" ? "owned" : undefined,
  );
}

/** 1階(入口)は常に知っている扱いにする */
const VALID_SPECIES_IDS = new Set(SPECIES.map((s) => s.id));
const VALID_SKILL_IDS = new Set(SKILLS.map((s) => s.id));
const VALID_ACHIEVEMENT_IDS = new Set(ACHIEVEMENTS.map((a) => a.id));

function sanitizeHut(value: unknown): StoredMonster[] {
  if (!Array.isArray(value)) return [];
  const out: StoredMonster[] = [];
  const seenUids = new Set<number>();
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const m = entry as Partial<StoredMonster>;
    if (typeof m.uid !== "number" || !Number.isInteger(m.uid) || seenUids.has(m.uid)) continue;
    if (typeof m.speciesId !== "string" || !VALID_SPECIES_IDS.has(m.speciesId)) continue;
    if (typeof m.level !== "number" || !Number.isFinite(m.level) || m.level < 1) continue;
    const skills = Array.isArray(m.skills)
      ? m.skills.filter((s): s is SkillId => typeof s === "string" && VALID_SKILL_IDS.has(s))
      : [];
    seenUids.add(m.uid);
    const dreamArts = Array.isArray(m.dreamArts)
      ? m.dreamArts
          .filter((id): id is DreamArtId => typeof id === "string" && id in DREAM_ARTS)
          .slice(-MAX_DREAM_ARTS)
      : [];
    const monster: StoredMonster = {
      uid: m.uid,
      speciesId: m.speciesId,
      level: m.level,
      exp: typeof m.exp === "number" && Number.isFinite(m.exp) ? m.exp : 0,
      dreamArts,
      skills,
      nickname: typeof m.nickname === "string" ? m.nickname : undefined,
      bondSuccessCount:
        typeof m.bondSuccessCount === "number" && Number.isFinite(m.bondSuccessCount) && m.bondSuccessCount >= 0
          ? m.bondSuccessCount
          : 0,
      recentFusionMaterials: Array.isArray(m.recentFusionMaterials)
        ? m.recentFusionMaterials
            .filter((id): id is string => typeof id === "string" && VALID_SPECIES_IDS.has(id))
            .slice(-MAX_RECENT_FUSION_MATERIALS)
        : [],
    };
    if (m.favorite === true) monster.favorite = true;
    out.push(monster);
  }
  return out;
}

function nextHutUidFrom(hut: readonly StoredMonster[]): number {
  return hut.reduce((max, m) => Math.max(max, m.uid), 0) + 1;
}

const VALID_TIP_IDS = new Set(TUTORIAL_TIP_IDS);

function sanitizeTutorialTips(value: unknown): TutorialTipId[] {
  return sanitizeIdList(value, VALID_TIP_IDS, { dedup: true });
}

export const VALID_TRAINING_FOCI: readonly TrainingFocus[] = ["offense", "defense", "balance"];

function sanitizeTrainingFocus(value: unknown): TrainingFocus {
  return sanitizeEnum(value, VALID_TRAINING_FOCI, "balance");
}

function sanitizeDifficulty(value: unknown): DifficultyMode {
  return sanitizeEnum(value, DIFFICULTY_MODES, "normal");
}

function sanitizeMessageSpeed(value: unknown): MessageSpeed {
  return sanitizeEnum(value, MESSAGE_SPEEDS, "normal");
}

/**
 * 多言語対応の土台(plan/i18n-foundation.md)。LOCALES(第1段階時点は"ja"のみ)に
 * 無い値は既定の"ja"に丸める。型上は"en"も許容するが、翻訳テーブルができるまでは
 * 実際には選ばせない
 */
function sanitizeLocale(value: unknown): LocaleId {
  return sanitizeEnum(value, LOCALES, "ja");
}

function sanitizeVillageStage(value: unknown): VillageStage {
  return sanitizeEnum<VillageStage>(value, [1, 2, 3, 4], 1);
}

const VALID_COSTUME_IDS = new Set(COSTUMES.map((c) => c.id));

/** 衣装・見た目カスタマイズ(plan/costumes.md): 既知の衣装idだけを残し、"default"は必ず含める */
function sanitizeUnlockedCostumes(value: unknown): string[] {
  const known = sanitizeIdList(value, VALID_COSTUME_IDS);
  return known.includes(DEFAULT_COSTUME_ID) ? known : [DEFAULT_COSTUME_ID, ...known];
}

function sanitizeEquippedCostume(value: unknown, unlocked: string[]): string {
  return sanitizeEnum(value, unlocked, DEFAULT_COSTUME_ID);
}

/** 腕試しの間(plan/hidden-dungeon.md): 壊れた要素は捨て、正しい形のものだけ残す */
function sanitizeArenaRecords(value: unknown): ArenaRecord[] {
  if (!Array.isArray(value)) return [];
  const out: ArenaRecord[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const r = entry as Partial<ArenaRecord>;
    if (typeof r.clearedAt !== "string") continue;
    if (typeof r.turns !== "number" || !Number.isFinite(r.turns) || r.turns < 0) continue;
    if (typeof r.damageTaken !== "number" || !Number.isFinite(r.damageTaken) || r.damageTaken < 0) continue;
    out.push({ clearedAt: r.clearedAt, turns: r.turns, damageTaken: r.damageTaken });
  }
  return out;
}

export const VALID_VILLAGE_NPC_IDS = new Set(VILLAGE_NPCS.map((n) => n.id));

/** 村の暮らし(plan/village-life.md): 既知のNPCidだけを残し、負の値は0に切り詰める */
function sanitizeBonds(value: unknown): Record<string, number> {
  return sanitizeRecordOf<string, number>(value, VALID_VILLAGE_NPC_IDS, (level) =>
    typeof level === "number" && Number.isFinite(level) ? Math.max(0, Math.floor(level)) : undefined,
  );
}

function sanitizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function sanitizeLastGiftDates(value: unknown): Record<string, string> {
  return sanitizeRecordOf<string, string>(value, VALID_VILLAGE_NPC_IDS, (date) =>
    typeof date === "string" ? date : undefined,
  );
}

export const VALID_REGION_IDS = new Set(Array.from({ length: 8 }, (_, i) => `region${i + 1}`));

/** 忘れ物蔵(plan/lost-and-found-vault.md): 既知の地方idだけを残す */
function sanitizeFoundVaultPassages(value: unknown): string[] {
  return sanitizeIdList(value, VALID_REGION_IDS, { dedup: true });
}

/** 山の芯(plan/mountain-core.md): 実在する種族idだけを残す。重複しない */
function sanitizeDefeatedRegionBosses(value: unknown): string[] {
  return sanitizeIdList(value, VALID_SPECIES_IDS, { dedup: true });
}
