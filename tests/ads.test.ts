import { describe, expect, it, vi } from 'vitest';
import { DemoAdProvider } from '../src/services/ads';

describe('demo reward and interstitial policy', () => {
  it('only grants a reward after explicit successful completion', async () => {
    const runDemo = vi.fn().mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('no fill')).mockResolvedValueOnce(true);
    const ads = new DemoAdProvider(runDemo);
    await expect(ads.rewarded('bird')).resolves.toBe(false);
    await expect(ads.rewarded('bird')).resolves.toBe(false);
    await expect(ads.rewarded('bird')).resolves.toBe(true);
    await expect(ads.rewarded('  ')).resolves.toBe(false);
    expect(runDemo).toHaveBeenCalledTimes(3);
  });

  it('prevents simultaneous reward placements and releases the lock after completion', async () => {
    let finish!: (completed: boolean) => void;
    const runner = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
    const ads = new DemoAdProvider(runner);
    const pending = ads.rewarded('continue');
    await expect(ads.rewarded('bird')).resolves.toBe(false);
    expect(runner).toHaveBeenCalledTimes(1);
    finish(true);
    await expect(pending).resolves.toBe(true);
    const next = ads.rewarded('bird');
    finish(false);
    await expect(next).resolves.toBe(false);
  });

  it('waits for enough completed runs and respects the time cooldown', async () => {
    let now = 0;
    const runner = vi.fn().mockResolvedValue(true);
    const ads = new DemoAdProvider(runner, { now: () => now });
    await ads.interstitial();
    await ads.interstitial();
    expect(runner).not.toHaveBeenCalled();
    await ads.interstitial();
    expect(runner).toHaveBeenCalledExactlyOnceWith('interstitial');
    for (let i = 0; i < 5; i++) await ads.interstitial();
    expect(runner).toHaveBeenCalledTimes(1);
    now = 120_000;
    await ads.interstitial();
    expect(runner).toHaveBeenCalledTimes(2);
  });

  it('remove-ads suppresses forced ads but preserves voluntary rewards', async () => {
    const runner = vi.fn().mockResolvedValue(true);
    const ads = new DemoAdProvider(runner, { adsDisabled: true, minRuns: 1, cooldownMs: 0 });
    await ads.interstitial();
    expect(runner).not.toHaveBeenCalled();
    await expect(ads.rewarded('bird')).resolves.toBe(true);
    ads.setAdsDisabled(false);
    await ads.interstitial();
    expect(runner).toHaveBeenLastCalledWith('interstitial');
  });
});
