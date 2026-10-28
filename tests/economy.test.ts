import { describe, expect, it } from 'vitest';
import { creditRun, MAX_RUN_CREDITS, purchaseUpgrade } from '../src/services/economy';
import { defaultProfile } from '../src/services/storage';
import { defaultUpgradeLevels, normalizeUpgradeLevels, UPGRADE_IDS, upgradeCost, upgradeEffects } from '../src/data/upgrades';

describe('permanent upgrade economy', () => {
  it('banks only new cumulative points across repeated events, crashes and continuations', () => {
    const profile = defaultProfile();
    expect(creditRun(profile, 'run-one', 12)).toBe(12);
    expect(creditRun(profile, 'run-one', 12)).toBe(0);
    expect(creditRun(profile, 'run-one', 4)).toBe(0);
    expect(creditRun(profile, 'run-one', 21)).toBe(9);
    expect(profile).toMatchObject({ wallet: 21, lifetimeEarned: 21, runCredits: [{ runId: 'run-one', score: 21 }] });
    expect(creditRun(profile, 'run-two', 7)).toBe(7);
    expect(profile.wallet).toBe(28);
  });

  it('makes purchases atomic and keeps best score and lifetime earnings separate from spending', () => {
    const profile = { ...defaultProfile(), best: 99 };
    creditRun(profile, 'test', 40);
    expect(purchaseUpgrade(profile, 'handling')).toEqual({ ok: true, cost: 20, level: 1 });
    expect(profile).toMatchObject({ best: 99, wallet: 20, lifetimeEarned: 40, upgrades: { handling: 1 } });
    const before = structuredClone(profile);
    expect(purchaseUpgrade(profile, 'magnet')).toEqual({ ok: false, reason: 'insufficient', cost: 35, level: 0 });
    expect(profile).toEqual(before);
    expect(purchaseUpgrade(profile, 'invented' as 'engine').reason).toBe('invalid');
    expect(profile).toEqual(before);
  });

  it('supports earn, upgrade, earn more, and reinvest without replaying an old payout', () => {
    const profile = defaultProfile();
    creditRun(profile, 'first-run', 65);
    expect(purchaseUpgrade(profile, 'magnet').ok).toBe(true);
    expect(upgradeEffects(profile.upgrades).scoreMultiplier).toBe(1.15);
    const improvedRunScore = Math.round(200 * upgradeEffects(profile.upgrades).scoreMultiplier);
    expect(creditRun(profile, 'second-run', improvedRunScore)).toBe(230);
    expect(purchaseUpgrade(profile, 'engine')).toEqual({ ok: true, cost: 25, level: 1 });
    expect(profile).toMatchObject({ wallet: 235, lifetimeEarned: 295, upgrades: { engine: 1, magnet: 1 } });
    expect(creditRun(profile, 'first-run', 65)).toBe(0);
  });

  it('rejects invalid score events and bounds the retained checkpoint history', () => {
    const profile = defaultProfile();
    for (const score of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) expect(creditRun(profile, 'bad', score)).toBe(0);
    expect(creditRun(profile, '', 10)).toBe(0);
    expect(creditRun(profile, 'x'.repeat(101), 10)).toBe(0);
    expect(profile.wallet).toBe(0);
    for (let index = 0; index < MAX_RUN_CREDITS + 30; index++) creditRun(profile, 'run-' + index, 1);
    expect(profile.runCredits).toHaveLength(MAX_RUN_CREDITS);
    expect(profile.runCredits.at(-1)?.runId).toBe('run-' + (MAX_RUN_CREDITS + 29));
    expect(profile.wallet).toBe(MAX_RUN_CREDITS + 30);
  });

  it('does not overflow balances or allow a numeric-limit purchase', () => {
    const profile = defaultProfile();
    profile.wallet = Number.MAX_SAFE_INTEGER - 2;
    profile.lifetimeEarned = Number.MAX_SAFE_INTEGER - 2;
    expect(creditRun(profile, 'ceiling', 20)).toBe(2);
    expect(profile.wallet).toBe(Number.MAX_SAFE_INTEGER);
    profile.wallet -= 100;
    expect(creditRun(profile, 'ceiling', 20)).toBe(0);
    profile.upgrades.engine = 1000;
    const before = structuredClone(profile);
    expect(purchaseUpgrade(profile, 'engine').reason).toBe('limit');
    expect(profile).toEqual(before);
  });
});

describe('upgrade tuning', () => {
  it('starts with the unchanged driving and scoring baseline', () => {
    expect(upgradeEffects(defaultUpgradeLevels())).toEqual({
      speedMultiplier: 1, steeringMultiplier: 1, steeringResponseMultiplier: 1, swayMultiplier: 1,
      boostDurationMultiplier: 1, boostRechargeMultiplier: 1, scoreMultiplier: 1,
    });
    expect(normalizeUpgradeLevels({ engine: -1, handling: 2.5, nitro: 3, magnet: Infinity, unknown: 8 })).toEqual({ engine: 0, handling: 0, nitro: 3, magnet: 0 });
  });

  it('raises prices and the relevant benefit without a low progression cap', () => {
    for (const id of UPGRADE_IDS) {
      let previousPrice = 0;
      for (const level of [0, 1, 2, 5, 10, 20, 50]) {
        const cost = upgradeCost(id, level);
        expect(Number.isSafeInteger(cost)).toBe(true);
        expect(cost).toBeGreaterThan(previousPrice);
        previousPrice = cost;
      }
    }
    const weak = upgradeEffects({ engine: 1, handling: 1, nitro: 1, magnet: 1 });
    const strong = upgradeEffects({ engine: 40, handling: 40, nitro: 40, magnet: 40 });
    expect(strong.speedMultiplier).toBeGreaterThan(weak.speedMultiplier);
    expect(strong.steeringMultiplier).toBeGreaterThan(weak.steeringMultiplier);
    expect(strong.steeringResponseMultiplier).toBeGreaterThan(weak.steeringResponseMultiplier);
    expect(strong.swayMultiplier).toBeLessThan(weak.swayMultiplier);
    expect(strong.swayMultiplier).toBeGreaterThan(0);
    expect(strong.boostDurationMultiplier).toBeGreaterThan(weak.boostDurationMultiplier);
    expect(strong.boostRechargeMultiplier).toBeGreaterThan(weak.boostRechargeMultiplier);
    expect(strong.scoreMultiplier).toBeGreaterThan(weak.scoreMultiplier);
  });
});
