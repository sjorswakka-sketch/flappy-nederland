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
});
