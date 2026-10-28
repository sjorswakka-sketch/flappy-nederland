import { describe, expect, it } from 'vitest';
import {
  LEADERBOARD_STORAGE_KEY, LocalLeaderboardService, normalizePlayerName, periodStart,
  type LeaderboardEntry,
} from '../src/services/leaderboard';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

describe('UTC leaderboard calendar periods', () => {
  it('uses midnight UTC, Monday ISO weeks, and calendar months across year boundaries', () => {
    const now = new Date('2027-01-03T23:59:59Z'); // Sunday, still in the previous ISO week.
    expect(periodStart('all', now)).toBeNull();
    expect(periodStart('daily', now)?.toISOString()).toBe('2027-01-03T00:00:00.000Z');
    expect(periodStart('weekly', now)?.toISOString()).toBe('2026-12-28T00:00:00.000Z');
    expect(periodStart('monthly', now)?.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(periodStart('weekly', new Date('2027-01-04T00:00:00Z'))?.toISOString()).toBe('2027-01-04T00:00:00.000Z');
  });

  it('filters exact boundaries, future entries, and the selected continent', async () => {
    const row = (runId: string, createdAt: string, continent = 'Europe'): LeaderboardEntry => ({
      id: `local:${runId}`, runId, createdAt, name: runId, score: 1000,
      continent: continent as LeaderboardEntry['continent'], source: 'local',
    });
    const storage = memoryStorage({ [LEADERBOARD_STORAGE_KEY]: JSON.stringify({ version: 1, entries: [
      row('boundary', '2026-10-28T00:00:00.000Z'),
      row('yesterday', '2026-10-27T23:59:59.999Z'),
      row('other-region', '2026-10-28T05:00:00.000Z', 'Asia'),
      row('future', '2026-10-29T00:00:00.000Z'),
    ] }) });
    const board = new LocalLeaderboardService({ now: () => new Date('2026-10-28T12:00:00Z'), storage });
    const daily = await board.list({ scope: 'continent', continent: 'Europe', period: 'daily' });
    expect(daily.filter(entry => entry.source === 'local').map(entry => entry.runId)).toEqual(['boundary']);
    const all = await board.list({ scope: 'worldwide', period: 'all' });
    expect(all.filter(entry => entry.source === 'local')).toHaveLength(3);
    expect(all.some(entry => entry.runId === 'future')).toBe(false);
  });
});

describe('local leaderboard adapter', () => {
  it('updates a continued run without duplicating, lowering score, or refreshing its date', async () => {
    let now = new Date('2026-10-28T12:00:00Z');
    const storage = memoryStorage();
    const board = new LocalLeaderboardService({ now: () => now, storage });
    const input = { name: 'Pilot', score: 1000, continent: 'Europe' as const, runId: 'one-flight' };
    const original = await board.submit(input);
    now = new Date('2026-10-29T12:00:00Z');
    const continued = await board.submit({ ...input, score: 1002 });
    expect(continued.createdAt).toBe(original.createdAt);
    expect((await board.submit({ ...input, score: 5 })).score).toBe(1002);
    const reloaded = new LocalLeaderboardService({ now: () => now, storage });
    const all = await reloaded.list({ scope: 'worldwide', period: 'all' });
    expect(all.filter(entry => entry.runId === 'one-flight')).toHaveLength(1);
    expect((await reloaded.list({ scope: 'worldwide', period: 'daily' })).some(entry => entry.runId === 'one-flight')).toBe(false);
  });

  it('returns a sorted top ten and does not expose mutable internal rows', async () => {
    const board = new LocalLeaderboardService({ storage: null });
    for (let index = 0; index < 12; index++) {
      await board.submit({ name: `Pilot ${index}`, score: 1000 + index, continent: 'Oceania', runId: `run-${index}` });
    }
    const top = await board.list({ scope: 'worldwide', period: 'all' });
    expect(top).toHaveLength(10);
    expect(top.map(entry => entry.score)).toEqual([1011, 1010, 1009, 1008, 1007, 1006, 1005, 1004, 1003, 1002]);
    top[0]!.score = 0;
    expect((await board.list({ scope: 'worldwide', period: 'all' }))[0]!.score).toBe(1011);
  });

  it('works with corrupt or denied storage and rejects malformed submissions', async () => {
    const corrupt = memoryStorage({ [LEADERBOARD_STORAGE_KEY]: '{not json' });
    const board = new LocalLeaderboardService({ storage: corrupt });
    expect((await board.list({ scope: 'worldwide', period: 'all' })).every(entry => entry.source === 'demo')).toBe(true);
    const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } } as unknown as Storage;
    const fallback = new LocalLeaderboardService({ storage: denied });
    const valid = { name: 'Pilot', score: 999, continent: 'Africa' as const, runId: 'safe' };
    await expect(fallback.submit(valid)).resolves.toMatchObject({ score: 999 });
    expect((await fallback.list({ scope: 'worldwide', period: 'all' }))[0]!.runId).toBe('safe');
    for (const score of [-1, 0.5, NaN, Infinity]) await expect(board.submit({ ...valid, score })).rejects.toThrow();
    await expect(board.submit({ ...valid, runId: '' })).rejects.toThrow();
    await expect(board.submit({ ...valid, continent: 'Mars' as 'Africa' })).rejects.toThrow();
  });

  it('normalizes names as short plain text while retaining Unicode', () => {
    expect(normalizePlayerName('  <Pílót>\u0000  ')).toBe('Pílót');
    expect(Array.from(normalizePlayerName('🐤'.repeat(30)))).toHaveLength(20);
    expect(normalizePlayerName('  ')).toBe('Night Driver');
  });
});
