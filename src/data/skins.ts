/** Add a bird here to make it available to the renderer and skin picker. */
export interface BirdSkin {
  id: string;
  name: string;
  body: string;
  wing: string;
  accent: string;
  shape: 'round' | 'slim' | 'royal';
  effect: 'none' | 'sparkle' | 'trail';
  unlockScore: number;
}

export const SKINS: BirdSkin[] = [
  { id: 'oranje', name: 'Oranje', body: '#F87932', wing: '#D65228', accent: '#FFE4AA', shape: 'round', effect: 'none', unlockScore: 0 },
  { id: 'delft', name: 'Delft Blue', body: '#427DAA', wing: '#24527A', accent: '#EAF6F8', shape: 'round', effect: 'none', unlockScore: 5 },
  { id: 'tulip', name: 'Tulip', body: '#E98598', wing: '#BC526F', accent: '#FCE4BD', shape: 'slim', effect: 'none', unlockScore: 10 },
  { id: 'stroopwafel', name: 'Stroopwafel', body: '#C38B4C', wing: '#805133', accent: '#FFE4A0', shape: 'round', effect: 'none', unlockScore: 20 },
  { id: 'koning', name: 'The King', body: '#EAB744', wing: '#CE8130', accent: '#FFF5C2', shape: 'royal', effect: 'sparkle', unlockScore: 35 },
  { id: 'polder', name: 'Polder Mint', body: '#79BA9C', wing: '#398670', accent: '#E5F3CA', shape: 'slim', effect: 'trail', unlockScore: 50 },
  { id: 'nacht', name: 'Midnight', body: '#45516D', wing: '#293B58', accent: '#C9D9EB', shape: 'slim', effect: 'sparkle', unlockScore: 75 },
  { id: 'aurora', name: 'Northern Light', body: '#A695CB', wing: '#6B66A4', accent: '#C9F4DC', shape: 'royal', effect: 'trail', unlockScore: 100 },
];
