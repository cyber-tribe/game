export interface DamageResult {
  damage: number;
  critical: boolean;
}

export interface DamageOptions {
  /** 会心率に上乗せする分(例: 双樽鉤の+0.15) */
  critBonus?: number;
  /** 会心を強制する(例: 双樽鉤のそのラン最初の1手、不意打ち) */
  forceCrit?: boolean;
}
