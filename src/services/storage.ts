import { SKINS } from '../data/skins';
import { CONTINENTS, normalizePlayerName, type Continent } from './leaderboard';

export { normalizePlayerName } from './leaderboard';
export interface Profile {
  best: number;
  selectedSkin: string;
  unlockedSkins: string[];
  name: string;
  continent: Continent;
  sound: boolean;
  adsRemoved: boolean;
}
export const PROFILE_STORAGE_KEY = 'drunken-joyride:profile:v1';
let memory: Profile | null = null;
export function defaultProfile(): Profile {
  return { best: 0, selectedSkin: 'starter', unlockedSkins: ['starter'], name: 'Night Driver', continent: 'Europe', sound: false, adsRemoved: false };
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
  return { ...profile, unlockedSkins: [...profile.unlockedSkins] };
}

export function saveProfile(profile: Profile): void {
  memory = normalizeProfile(profile);
  try { localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ version: 1, profile: memory })); }
  catch { /* In-memory persistence keeps the app usable without localStorage. */ }
}
