import { SKINS } from '../data/skins';
import { CONTINENTS, normalizePlayerName, type Continent } from './leaderboard';
import { defaultUpgradeLevels, normalizeUpgradeLevels, type UpgradeLevels } from '../data/upgrades';
import { MAX_RUN_CREDITS, type RunCredit } from './economy';

export { normalizePlayerName } from './leaderboard';
export interface Profile {
  best: number;
  selectedSkin: string;
  unlockedSkins: string[];
  name: string;
  continent: Continent;
  sound: boolean;
  adsRemoved: boolean;
  wallet: number;
  lifetimeEarned: number;
  upgrades: UpgradeLevels;
  runCredits: RunCredit[];
}
export const PROFILE_STORAGE_KEY = 'drunken-joyride:profile:v1';
let memory: Profile | null = null;
export function defaultProfile(): Profile {
  return { best: 0, selectedSkin: 'starter', unlockedSkins: ['starter'], name: 'Night Driver', continent: 'Europe', sound: false, adsRemoved: false,
    wallet: 0, lifetimeEarned: 0, upgrades: defaultUpgradeLevels(), runCredits: [] };
}

function nonnegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function normalizeRunCredits(value: unknown): RunCredit[] {
  if (!Array.isArray(value)) return [];
  const credits = new Map<string, number>();
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const { runId, score } = item as Partial<RunCredit>;
    if (typeof runId !== 'string' || !runId.trim() || runId.length > 100
      || typeof score !== 'number' || !Number.isSafeInteger(score) || score < 0) continue;
    credits.set(runId, Math.max(credits.get(runId) ?? 0, score));
  }
  return [...credits].slice(-MAX_RUN_CREDITS).map(([runId, score]) => ({ runId, score }));
}

function normalizeProfile(value: unknown): Profile {
  const fallback = defaultProfile();
  if (!value || typeof value !== 'object') return fallback;
  const raw = value as Partial<Profile>;
  const best = Number.isSafeInteger(raw.best) && (raw.best ?? -1) >= 0 ? raw.best! : 0;
  const saved = Array.isArray(raw.unlockedSkins) ? raw.unlockedSkins : [];
  // Score unlocks are derived again on load so the profile cannot lose an earned car.
  const unlockedSkins = SKINS.filter(skin => skin.unlockScore <= best || saved.includes(skin.id)).map(skin => skin.id);
  return {
    best, unlockedSkins,
    selectedSkin: typeof raw.selectedSkin === 'string' && unlockedSkins.includes(raw.selectedSkin) ? raw.selectedSkin : 'starter',
    name: normalizePlayerName(raw.name), continent: CONTINENTS.includes(raw.continent as Continent) ? raw.continent! : fallback.continent,
    sound: typeof raw.sound === 'boolean' ? raw.sound : fallback.sound,
    adsRemoved: typeof raw.adsRemoved === 'boolean' ? raw.adsRemoved : false,
    // Existing version-one saves gain an empty wallet; old highscores are never minted twice.
    wallet: nonnegativeInteger(raw.wallet),
    lifetimeEarned: Math.max(nonnegativeInteger(raw.wallet), nonnegativeInteger(raw.lifetimeEarned)),
    upgrades: normalizeUpgradeLevels(raw.upgrades),
    runCredits: normalizeRunCredits(raw.runCredits),
  };
}

export function loadProfile(): Profile {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) ?? 'null');
    if (value && typeof value === 'object' && 'version' in value && value.version === 1 && 'profile' in value) {
      memory = normalizeProfile(value.profile);
    }
  } catch { /* Private mode and corrupt saved data fall back to this session's profile. */ }
  const profile = memory ?? defaultProfile();
  return { ...profile, unlockedSkins: [...profile.unlockedSkins], upgrades: { ...profile.upgrades }, runCredits: profile.runCredits.map(credit => ({ ...credit })) };
}

export function saveProfile(profile: Profile): void {
  memory = normalizeProfile(profile);
  try { localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ version: 1, profile: memory })); }
  catch { /* In-memory persistence keeps the app usable without localStorage. */ }
}
