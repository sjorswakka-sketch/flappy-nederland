/**
 * The garage is data-driven. Add a stable ID and a score milestone here.
 * Shapes are shared by both renderers: round = compact, slim = sports car,
 * royal = luxury coupe. `wing` is retained as the trim/detail colour.
 */
export interface VehicleSkin {
  id: string;
  name: string;
  body: string;
  wing: string;
  accent: string;
  shape: 'round' | 'slim' | 'royal';
  effect: 'none' | 'sparkle' | 'trail';
  unlockScore: number;
}

export const SKINS: VehicleSkin[] = [
  { id: 'starter', name: 'Rust Bucket', body: '#E97C41', wing: '#9E4931', accent: '#FFD7A2', shape: 'round', effect: 'none', unlockScore: 0 },
  { id: 'midnight', name: 'Midnight GT', body: '#638CC7', wing: '#314A72', accent: '#C0DDF7', shape: 'slim', effect: 'none', unlockScore: 5 },
  { id: 'bubblegum', name: 'Bubblegum', body: '#E787B2', wing: '#A34B7F', accent: '#FFD4E7', shape: 'round', effect: 'none', unlockScore: 10 },
  { id: 'taxi', name: 'Taxi', body: '#EDBE4F', wing: '#8B6633', accent: '#FFF1A5', shape: 'round', effect: 'none', unlockScore: 20 },
  { id: 'roadking', name: 'Road King', body: '#D9A365', wing: '#8E5E37', accent: '#FFE5B6', shape: 'royal', effect: 'sparkle', unlockScore: 35 },
  { id: 'mint', name: 'Mint Condition', body: '#82C6AD', wing: '#3D816F', accent: '#CDF8E5', shape: 'slim', effect: 'trail', unlockScore: 50 },
  { id: 'blackout', name: 'Blackout', body: '#616E7A', wing: '#2E3943', accent: '#B7DBDF', shape: 'royal', effect: 'sparkle', unlockScore: 75 },
  { id: 'neon', name: 'Neon Runner', body: '#AF8AE5', wing: '#665194', accent: '#C9F98C', shape: 'slim', effect: 'trail', unlockScore: 100 },
];
