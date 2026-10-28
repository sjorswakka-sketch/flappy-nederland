import { afterEach, describe, expect, it, vi } from 'vitest';
import { DemoAdProvider, getDisplayAdConfig, mountDisplayAd } from '../src/services/ads';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('demo reward and interstitial policy', () => {
  it('only grants a reward after explicit successful completion', async () => {
    const runDemo = vi.fn().mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('no fill')).mockResolvedValueOnce(true);
    const ads = new DemoAdProvider(runDemo);
    await expect(ads.rewarded('car')).resolves.toBe(false);
    await expect(ads.rewarded('car')).resolves.toBe(false);
    await expect(ads.rewarded('car')).resolves.toBe(true);
    await expect(ads.rewarded('  ')).resolves.toBe(false);
    expect(runDemo).toHaveBeenCalledTimes(3);
  });

  it('prevents simultaneous reward placements and releases the lock after completion', async () => {
    let finish!: (completed: boolean) => void;
    const runner = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
    const ads = new DemoAdProvider(runner);
    const pending = ads.rewarded('continue');
    await expect(ads.rewarded('car')).resolves.toBe(false);
    expect(runner).toHaveBeenCalledTimes(1);
    finish(true);
    await expect(pending).resolves.toBe(true);
    const next = ads.rewarded('car');
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
    await expect(ads.rewarded('car')).resolves.toBe(true);
    ads.setAdsDisabled(false);
    await ads.interstitial();
    expect(runner).toHaveBeenLastCalledWith('interstitial');
  });
});

describe('real display-ad configuration and consent boundary', () => {
  const valid = { client: 'ca-pub-1234567890123456', slot: '1234567890' };

  it('only accepts complete publisher and unit identifiers', () => {
    expect(getDisplayAdConfig({})).toBeNull();
    expect(getDisplayAdConfig({ VITE_ADSENSE_CLIENT: valid.client })).toBeNull();
    expect(getDisplayAdConfig({ VITE_ADSENSE_CLIENT: 'ca-pub-placeholder', VITE_ADSENSE_SLOT: valid.slot })).toBeNull();
    expect(getDisplayAdConfig({ VITE_ADSENSE_CLIENT: valid.client, VITE_ADSENSE_SLOT: '<script>' })).toBeNull();
    expect(getDisplayAdConfig({ VITE_ADSENSE_CLIENT: ` ${valid.client} `, VITE_ADSENSE_SLOT: valid.slot })).toEqual(valid);
  });

  it('does not touch the DOM or request anything without both configuration and consent', () => {
    const createElement = vi.fn(() => { throw new Error('Unexpected network-capable script creation'); });
    vi.stubGlobal('document', { createElement });
    const element = {} as HTMLElement;
    const onStatus = vi.fn();
    expect(() => mountDisplayAd(element, null, { consent: true, onStatus })()).not.toThrow();
    expect(() => mountDisplayAd(element, valid, { consent: false, onStatus })()).not.toThrow();
    expect(() => mountDisplayAd(element, valid)()).not.toThrow();
    expect(createElement).not.toHaveBeenCalled();
    expect(onStatus.mock.calls.every(([status]) => status === 'unavailable')).toBe(true);
  });

  it('distinguishes a requested ad from actual fill and does not queue a disposed unit', async () => {
    vi.useFakeTimers();
    vi.resetModules();
    const { mountDisplayAd: mount } = await import('../src/services/ads');
    let mutation!: () => void;
    const disconnect = vi.fn();
    vi.stubGlobal('MutationObserver', class {
      constructor(callback: () => void) { mutation = callback; }
      observe() {} disconnect = disconnect;
    });
    const attributes = new Map<string, string>();
    const unit = {
      style: {}, dataset: {}, isConnected: true, className: '',
      setAttribute: (name: string, value: string) => attributes.set(name, value),
      getAttribute: (name: string) => attributes.get(name), remove: vi.fn(),
    };
    const script = { dataset: {}, onload: () => {}, remove: vi.fn() };
    const append = vi.fn();
    const createElement = vi.fn((tag: string) => tag === 'script' ? script : unit);
    vi.stubGlobal('document', { createElement, head: { append } });
    const push = vi.fn();
    vi.stubGlobal('window', { adsbygoogle: { push } });
    const element = { dataset: {}, replaceChildren: vi.fn() } as unknown as HTMLElement;
    const status = vi.fn();
    const cleanup = mount(element, valid, { consent: true, onStatus: status });
    expect(append).toHaveBeenCalledTimes(1);
    expect(status).toHaveBeenLastCalledWith('loading');
    expect(push).not.toHaveBeenCalled();
    script.onload();
    await Promise.resolve();
    expect(push).toHaveBeenCalledTimes(1);
    // SDK load and queueing are not evidence that inventory was returned.
    expect(status).not.toHaveBeenCalledWith('active');
    attributes.set('data-ad-status', 'filled'); mutation();
    expect(status).toHaveBeenLastCalledWith('active');
    attributes.set('data-ad-status', 'unfilled'); mutation();
    expect(status).toHaveBeenLastCalledWith('unavailable');
    cleanup();
    const removeSecond = mount(element, valid, { consent: true });
    removeSecond();
    await Promise.resolve();
    expect(append).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(2);
  });
});
