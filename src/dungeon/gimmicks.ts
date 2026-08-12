import type { Rng } from "../core/rng";
import type { FloorGimmickKind } from "../core/types";
import { REGION_SIZE } from "../entities/dungeons";

/** フロア生成のたびにギミックが乗る確率 */
const GIMMICK_CHANCE = 0.3;

/**
 * 暗さを地方の個性にする(plan/region-darkness.md)。表の寝穴限定
 * (地方の概念を持たない他のダンジョンでは、従来どおり一様抽選のまま)。
 * 第一〜第三地方(1〜REGION_SIZE*3階)は「くらやみの階」を候補から除外し、
 * 第四地方以降(REGION_SIZE*3+1階〜)は抽選重みを引き上げる
 */
const DARKNESS_EARLY_REGION_END = REGION_SIZE * 3;
/** 第四地方以降、くらやみの階の抽選重みに掛ける倍率。数値は初期案 */
const DARKNESS_HEAVY_REGION_WEIGHT = 3;

const ALL_GIMMICKS: readonly FloorGimmickKind[] = [
  "darkness",
  "alert",
  "pitfall",
  "feast",
  "windfall",
  "silence",
];

export const GIMMICK_NAMES: Record<FloorGimmickKind, string> = {
  darkness: "くらやみの階",
  alert: "ざわめきの階",
  pitfall: "おちあなの階",
  feast: "ほうふくの階",
  windfall: "山分けの階",
  silence: "しじまの階",
};

/** 階に入った瞬間に表示する一言演出 */
export const GIMMICK_MESSAGES: Record<FloorGimmickKind, string> = {
  darkness: "――あたりが急に暗くなった。",
  alert: "――何かの気配がざわめいている。",
  pitfall: "――足元が崩れやすくなっている気がする。",
  feast: "――満ち足りた空気が漂っている。",
  windfall: "――ここには何かがたくさんありそうだ。",
  silence: "――やけに静まりかえっている。",
};

/**
 * 次のフロアに乗せるギミックを抽選する。
 *
 * - `depth <= 1` (第一地方の1階目に相当) には乗せない。
 * - 直前の階と同じギミックは選ばない。
 * - 抽選に外れれば `undefined`(いつも通りの階)。
 * - 表の寝穴では、くらやみの階の出やすさが地方ごとに変わる
 *   (plan/region-darkness.md)。
 */
export function pickFloorGimmick(
  rng: Rng,
  depth: number,
  previous?: FloorGimmickKind,
  /** 難易度モード(plan/difficulty-modes.md)による出現率の倍率。省略時は1 */
  chanceMultiplier = 1,
  /** 表の寝穴かどうか(plan/region-darkness.md)。地方の概念を持つのは表の寝穴だけ */
  isMainCave = false,
): FloorGimmickKind | undefined {
  if (depth <= 1) return undefined;
  if (!rng.chance(GIMMICK_CHANCE * chanceMultiplier)) return undefined;
  const excludeDarkness = isMainCave && depth <= DARKNESS_EARLY_REGION_END;
  const options = ALL_GIMMICKS.filter((g) => g !== previous && (!excludeDarkness || g !== "darkness"));
  if (options.length === 0) return undefined;
  const heavyDarkness = isMainCave && depth > DARKNESS_EARLY_REGION_END;
  if (!heavyDarkness) return rng.pick(options);
  return rng.pickWeighted(options, (g) => (g === "darkness" ? DARKNESS_HEAVY_REGION_WEIGHT : 1));
}
