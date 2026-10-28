/** Permanent garage progression. Prices and effects are deliberately centralised. */
export const UPGRADE_IDS = ['engine', 'handling', 'nitro', 'magnet'] as const;
export type UpgradeId = typeof UPGRADE_IDS[number];
export type UpgradeLevels = Record<UpgradeId, number>;
export interface UpgradeDefinition {
  id: UpgradeId;
  name: string;
  description: string;
  baseCost: number;
  iconKey: string;
}
export const UPGRADE_DEFINITIONS: readonly UpgradeDefinition[] = [
  { id: 'engine', name: 'Engine Tune', description: 'More road speed. More overtakes. More earning potential.', baseCost: 25, iconKey: 'gauge' },
  { id: 'handling', name: 'Precision Steering', description: 'Faster steering response and less sway for tighter passes.', baseCost: 20, iconKey: 'steer' },
  { id: 'nitro', name: 'Nitro System', description: 'Longer boosts and faster charge recovery.', baseCost: 30, iconKey: 'spark' },
  { id: 'magnet', name: 'Point Multiplier', description: 'Increase every point payout, then invest it in your next upgrade.', baseCost: 35, iconKey: 'trophy' },
];

export function defaultUpgradeLevels(): UpgradeLevels { return { engine: 0, handling: 0, nitro: 0, magnet: 0 }; }
export function isUpgradeId(value: unknown): value is UpgradeId {
  return typeof value === 'string' && UPGRADE_IDS.includes(value as UpgradeId);
}
export function normalizeUpgradeLevels(value: unknown): UpgradeLevels {
  const levels = defaultUpgradeLevels();
  if (!value || typeof value !== 'object') return levels;
  for (const id of UPGRADE_IDS) {
    const raw = (value as Record<string, unknown>)[id];
    if (typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0) levels[id] = raw;
  }
  return levels;
}

/** No gameplay level cap; the numeric limit prevents unsafe prices or overflow. */
export function upgradeCost(id: UpgradeId, level: number): number {
  if (!isUpgradeId(id) || !Number.isSafeInteger(level) || level < 0) return Number.MAX_SAFE_INTEGER;
  const base = UPGRADE_DEFINITIONS.find(upgrade => upgrade.id === id)!.baseCost;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.ceil(base * 1.35 ** level + level * 5));
}
export interface UpgradeEffects {
  speedMultiplier: number;
  steeringMultiplier: number;
  steeringResponseMultiplier: number;
  swayMultiplier: number;
  boostDurationMultiplier: number;
  boostRechargeMultiplier: number;
  scoreMultiplier: number;
}

/** Handling and nitro approach usable limits; speed and income keep progressing. */
export function upgradeEffects(value: unknown): UpgradeEffects {
  const levels = normalizeUpgradeLevels(value);
  const handling = levels.handling / (levels.handling + 8);
  const nitro = levels.nitro / (levels.nitro + 8);
  return {
    speedMultiplier: 1 + 0.08 * Math.log2(1 + levels.engine),
    steeringMultiplier: 1 + 0.55 * handling,
    steeringResponseMultiplier: 1 + 0.7 * handling,
    swayMultiplier: 1 - 0.65 * handling,
    boostDurationMultiplier: 1 + 1.2 * nitro,
    boostRechargeMultiplier: 1 + 1.8 * nitro,
    scoreMultiplier: 1 + levels.magnet * 0.15,
  };
}
