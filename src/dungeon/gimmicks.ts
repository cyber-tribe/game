import type { Rng } from "../core/rng";
import type { FloorGimmickKind } from "../core/types";

/** フロア生成のたびにギミックが乗る確率 */
const GIMMICK_CHANCE = 0.3;

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
 */
export function pickFloorGimmick(
  rng: Rng,
  depth: number,
  previous?: FloorGimmickKind,
): FloorGimmickKind | undefined {
  if (depth <= 1) return undefined;
  if (!rng.chance(GIMMICK_CHANCE)) return undefined;
  const options = ALL_GIMMICKS.filter((g) => g !== previous);
  return rng.pick(options);
}
