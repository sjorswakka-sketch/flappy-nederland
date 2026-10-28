/** Replace LocalLeaderboardService with an HTTP adapter implementing this interface. */
export const CONTINENTS = ['Europe', 'Asia', 'Africa', 'North America', 'South America', 'Oceania', 'Antarctica'] as const;
export type Continent = typeof CONTINENTS[number];
export type Period = 'all' | 'daily' | 'weekly' | 'monthly';
export interface LeaderboardEntry {
  id: string;
  name: string;
  score: number;
  continent: Continent;
  createdAt: string;
  source: 'demo' | 'local';
  runId: string;
}
export interface ScoreSubmission { name: string; score: number; continent: Continent; runId: string }
export interface LeaderboardQuery { scope: 'worldwide' | 'continent'; continent?: Continent; period: Period }
export interface LeaderboardService {
  submit(input: ScoreSubmission): Promise<LeaderboardEntry>;
  list(query: LeaderboardQuery): Promise<LeaderboardEntry[]>;
}

export const LEADERBOARD_STORAGE_KEY = 'drunken-joyride:leaderboard:v1';
const MAX_LOCAL_ENTRIES = 500;
const DAY = 86_400_000;

/** Names are plain text, max. 20 Unicode characters, with markup/control characters removed. */
export function normalizePlayerName(input: unknown): string {
  if (typeof input !== 'string') return 'Night Driver';
  const value = input.normalize('NFC').replace(/[\u0000-\u001F\u007F-\u009F<>\u202A-\u202E\u2066-\u2069]/g, '').trim();
  return Array.from(value).slice(0, 20).join('') || 'Night Driver';
}

/** UTC calendar periods; a week starts Monday (ISO convention), never a rolling seven days. */
export function periodStart(period: Period, now: Date): Date | null {
  if (period === 'all') return null;
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (period === 'weekly') start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  if (period === 'monthly') start.setUTCDate(1);
  return start;
}

function browserStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

function validEntry(value: unknown): value is LeaderboardEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<LeaderboardEntry>;
  return typeof entry.id === 'string' && entry.id.length <= 110
    && typeof entry.runId === 'string' && entry.runId.length > 0 && entry.runId.length <= 100
    && typeof entry.name === 'string' && entry.name.length <= 100
    && typeof entry.score === 'number' && Number.isSafeInteger(entry.score) && entry.score >= 0
    && CONTINENTS.includes(entry.continent as Continent) && entry.source === 'local'
    && typeof entry.createdAt === 'string' && Number.isFinite(Date.parse(entry.createdAt));
}

/** Clearly marked sample rivals are generated relative to this service's creation date. */
function demoEntries(now: Date): LeaderboardEntry[] {
  const names = ['Canal Cruiser', 'Midnight Max', 'Turbo Tulip', 'Asphalt Ace', 'Delft Drifter', 'Neon Nomad', 'Taxi Trouble', 'Road Runner', 'Little Gouda', 'Orange Comet', 'Bumper Belle', 'Lowland Legend'];
  const ages = [0, 0, 0, 1, 2, 3, 6, 8, 12, 20, 33, 65];
  return CONTINENTS.flatMap((continent, region) => names.map((name, index) => ({
    id: `demo:${region}:${index}`, runId: `demo:${region}:${index}`,
    name: names[(index + region * 3) % names.length] ?? name,
    score: Math.max(3, 91 - index * 6 - region * 3 + ((index * 11 + region * 7) % 14)),
    continent, createdAt: new Date(now.getTime() - (ages[index] ?? 0) * DAY).toISOString(), source: 'demo' as const,
  })));
}

export class LocalLeaderboardService implements LeaderboardService {
  private readonly storage: Storage | null;
  private readonly now: () => Date;
  private readonly demos: LeaderboardEntry[];
  private rows: LeaderboardEntry[] = [];

  constructor(options: { now?: () => Date; storage?: Storage | null } = {}) {
    this.now = options.now ?? (() => new Date());
    this.storage = options.storage === undefined ? browserStorage() : options.storage;
    this.demos = demoEntries(this.now());
    try {
      const raw: unknown = JSON.parse(this.storage?.getItem(LEADERBOARD_STORAGE_KEY) ?? 'null');
      if (raw && typeof raw === 'object' && 'version' in raw && raw.version === 1 && 'entries' in raw && Array.isArray(raw.entries)) {
        const unique = new Map<string, LeaderboardEntry>();
        for (const row of raw.entries.slice(-MAX_LOCAL_ENTRIES).filter(validEntry)) {
          if (Date.parse(row.createdAt) > this.now().getTime()) continue;
          const previous = unique.get(row.runId);
          if (!previous || row.score > previous.score) unique.set(row.runId, { ...row, name: normalizePlayerName(row.name) });
        }
        this.rows = [...unique.values()];
      }
    } catch { /* Denied, missing or malformed storage does not prevent playing. */ }
  }

  async submit(input: ScoreSubmission): Promise<LeaderboardEntry> {
    if (!Number.isSafeInteger(input.score) || input.score < 0) throw new Error('Score must be a non-negative integer.');
    if (!CONTINENTS.includes(input.continent)) throw new Error('Choose a valid continent.');
    if (typeof input.runId !== 'string' || input.runId.trim().length === 0 || input.runId.length > 100) throw new Error('A valid run ID is required.');
    const existing = this.rows.find(row => row.runId === input.runId);
    // A continued run updates its original entry and date; it cannot duplicate or refresh a period.
    const entry: LeaderboardEntry = {
      id: `local:${input.runId}`, runId: input.runId, name: normalizePlayerName(input.name),
      score: Math.max(input.score, existing?.score ?? 0), continent: input.continent,
      createdAt: existing?.createdAt ?? this.now().toISOString(), source: 'local',
    };
    this.rows = [...this.rows.filter(row => row.runId !== input.runId), entry].slice(-MAX_LOCAL_ENTRIES);
    try { this.storage?.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify({ version: 1, entries: this.rows })); }
    catch { /* Retain scores in this session when browser storage is unavailable. */ }
    return { ...entry };
  }

  async list(query: LeaderboardQuery): Promise<LeaderboardEntry[]> {
    const start = periodStart(query.period, this.now())?.getTime() ?? -Infinity;
    const now = this.now().getTime();
    return [...this.rows, ...this.demos]
      .filter(row => Date.parse(row.createdAt) >= start && Date.parse(row.createdAt) <= now)
      .filter(row => query.scope !== 'continent' || row.continent === (query.continent ?? 'Europe'))
      .sort((a, b) => b.score - a.score || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .slice(0, 10).map(row => ({ ...row }));
  }
}
