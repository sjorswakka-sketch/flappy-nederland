import { isUpgradeId, upgradeCost, type UpgradeId, type UpgradeLevels } from '../data/upgrades';

export const MAX_RUN_CREDITS = 256;
export interface RunCredit { runId: string; score: number }
export interface EconomyProfile {
  wallet: number;
  lifetimeEarned: number;
  upgrades: UpgradeLevels;
  runCredits: RunCredit[];
}
export type PurchaseResult = { ok: boolean; reason?: 'insufficient' | 'invalid' | 'limit'; cost: number; level: number };

function validPoints(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Scores are cumulative within a run, including a rewarded continuation. Banking
 * only the new delta makes repeated score events and crash screens idempotent.
 * The caller saves the mutated profile after a positive payout.
 */
export function creditRun(profile: EconomyProfile, runId: string, score: number): number {
  if (typeof runId !== 'string' || !runId.trim() || runId.length > 100 || !validPoints(score)
    || !validPoints(profile.wallet) || !validPoints(profile.lifetimeEarned) || !Array.isArray(profile.runCredits)) return 0;
  const previous = profile.runCredits.find(credit => credit.runId === runId);
  const oldScore = previous?.score ?? 0;
  if (!validPoints(oldScore) || score <= oldScore) return 0;
  // Track the full score even if the practical numeric balance ceiling is met.
  // That prevents a later spend from paying the same score events twice.
  const payout = Math.min(score - oldScore, Number.MAX_SAFE_INTEGER - profile.wallet, Number.MAX_SAFE_INTEGER - profile.lifetimeEarned);
  if (previous) previous.score = score;
  else {
    profile.runCredits.push({ runId, score });
    if (profile.runCredits.length > MAX_RUN_CREDITS) profile.runCredits.splice(0, profile.runCredits.length - MAX_RUN_CREDITS);
  }
  profile.wallet += payout;
  profile.lifetimeEarned += payout;
  return payout;
}

/** A purchase changes only the spendable wallet and the selected permanent level. */
export function purchaseUpgrade(profile: EconomyProfile, id: UpgradeId): PurchaseResult {
  if (!isUpgradeId(id) || !profile.upgrades || !validPoints(profile.wallet)) return { ok: false, reason: 'invalid', cost: 0, level: 0 };
  const level = profile.upgrades[id];
  if (!validPoints(level)) return { ok: false, reason: 'invalid', cost: 0, level: 0 };
  const cost = upgradeCost(id, level);
  if (cost === Number.MAX_SAFE_INTEGER || level === Number.MAX_SAFE_INTEGER) return { ok: false, reason: 'limit', cost, level };
  if (profile.wallet < cost) return { ok: false, reason: 'insufficient', cost, level };
  profile.wallet -= cost;
  profile.upgrades[id] = level + 1;
  return { ok: true, cost, level: level + 1 };
}
