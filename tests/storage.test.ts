import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; }, clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

beforeEach(() => { vi.resetModules(); vi.stubGlobal('localStorage', memoryStorage()); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('versioned browser profile', () => {
  it('starts with exactly one free car and recovers from corrupt data', async () => {
    const store = await import('../src/services/storage');
    expect(store.loadProfile()).toEqual(store.defaultProfile());
    expect(store.loadProfile().unlockedSkins).toEqual(['starter']);
    localStorage.setItem(store.PROFILE_STORAGE_KEY, '{broken');
    expect(store.loadProfile()).toEqual(store.defaultProfile());
  });

  it('derives score unlocks, rejects unknown cars, and falls back from a locked selection', async () => {
    const store = await import('../src/services/storage');
    store.saveProfile({ ...store.defaultProfile(), best: 75, selectedSkin: 'neon', unlockedSkins: ['starter', 'invented'] });
    const loaded = store.loadProfile();
    expect(loaded.unlockedSkins).toEqual(['starter', 'midnight', 'bubblegum']);
    expect(loaded.selectedSkin).toBe('starter');
    loaded.unlockedSkins.length = 0;
    expect(store.loadProfile().unlockedSkins).toContain('starter');
  });

  it('keeps the next car locked until its score milestone is reached', async () => {
    const store = await import('../src/services/storage');
    store.saveProfile({ ...store.defaultProfile(), best: 24 });
    expect(store.loadProfile().unlockedSkins).toEqual(['starter']);
    store.saveProfile({ ...store.defaultProfile(), best: 25 });
    expect(store.loadProfile().unlockedSkins).toEqual(['starter', 'midnight']);
  });

  it('preserves previously earned or rewarded cars after milestone balancing', async () => {
    const store = await import('../src/services/storage');
    localStorage.setItem(store.PROFILE_STORAGE_KEY, JSON.stringify({
      version: 1,
      profile: { ...store.defaultProfile(), best: 10, selectedSkin: 'neon', unlockedSkins: ['starter', 'neon'] },
    }));
    expect(store.loadProfile()).toMatchObject({ best: 10, selectedSkin: 'neon', unlockedSkins: ['starter', 'neon'] });
  });

  it('retains session progress when storage access or writes are denied', async () => {
    vi.stubGlobal('localStorage', { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); } });
    const store = await import('../src/services/storage');
    expect(() => store.saveProfile({ ...store.defaultProfile(), best: 300, name: 'Night Driver' })).not.toThrow();
    expect(store.loadProfile()).toMatchObject({ best: 300, name: 'Night Driver' });
    expect(store.loadProfile().unlockedSkins).toContain('roadking');
  });

  it('migrates old profiles without inventing spendable points or losing progress', async () => {
    const store = await import('../src/services/storage');
    localStorage.setItem(store.PROFILE_STORAGE_KEY, JSON.stringify({ version: 1, profile: {
      best: 150, selectedSkin: 'taxi', unlockedSkins: ['starter', 'taxi'], name: 'Existing Driver', continent: 'Europe', sound: true, adsRemoved: true,
    } }));
    expect(store.loadProfile()).toMatchObject({ best: 150, selectedSkin: 'taxi', name: 'Existing Driver', sound: true, adsRemoved: true,
      wallet: 0, lifetimeEarned: 0, upgrades: { engine: 0, handling: 0, nitro: 0, magnet: 0 }, runCredits: [] });
  });

  it('preserves banked points, upgrades and the continuation checkpoint across reloads', async () => {
    let store = await import('../src/services/storage');
    const economy = await import('../src/services/economy');
    const profile = store.defaultProfile();
    economy.creditRun(profile, 'saved-run', 100);
    economy.purchaseUpgrade(profile, 'handling');
    store.saveProfile(profile);
    profile.upgrades.handling = 99;
    profile.runCredits[0].score = 999;
    vi.resetModules();
    store = await import('../src/services/storage');
    const loaded = store.loadProfile();
    expect(loaded).toMatchObject({ wallet: 80, lifetimeEarned: 100, upgrades: { handling: 1 }, runCredits: [{ runId: 'saved-run', score: 100 }] });
    expect(economy.creditRun(loaded, 'saved-run', 100)).toBe(0);
    expect(economy.creditRun(loaded, 'saved-run', 125)).toBe(25);
    loaded.upgrades.handling = 77;
    loaded.runCredits[0].score = 333;
    expect(store.loadProfile()).toMatchObject({ upgrades: { handling: 1 }, runCredits: [{ score: 100 }] });
  });

  it('sanitizes corrupt balances, levels and checkpoint records independently', async () => {
    const store = await import('../src/services/storage');
    localStorage.setItem(store.PROFILE_STORAGE_KEY, JSON.stringify({ version: 1, profile: { ...store.defaultProfile(),
      wallet: -2, lifetimeEarned: 0.5, upgrades: { engine: 2, handling: -4, nitro: 1.5, magnet: 4 },
      runCredits: [{ runId: 'same', score: 20 }, { runId: 'same', score: 8 }, { runId: '', score: 12 }, { runId: 'negative', score: -2 }],
    } }));
    expect(store.loadProfile()).toMatchObject({ wallet: 0, lifetimeEarned: 0, upgrades: { engine: 2, handling: 0, nitro: 0, magnet: 4 }, runCredits: [{ runId: 'same', score: 20 }] });
  });
});
