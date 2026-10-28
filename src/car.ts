import type { VehicleSkin } from './data/skins';

/** Original top-down vector art used by the logo, garage and reward preview. */
export function carSvg(s: VehicleSkin, size = 64): string {
  const sport = s.shape === 'slim';
  const luxury = s.shape === 'royal';
  const body = sport
    ? 'M37 12Q50 8 63 12L69 30 70 75Q68 88 62 89H38Q32 88 30 75L31 30Z'
    : luxury
      ? 'M36 10H64Q72 12 73 23L74 76Q73 91 63 92H37Q27 91 26 76L27 23Q28 12 36 10Z'
      : 'M38 14H62Q70 15 71 26L72 76Q71 88 62 89H38Q29 88 28 76L29 26Q30 15 38 14Z';
  const effect = s.effect === 'sparkle'
    ? `<path d="m16 27 2-6 2 6 6 2-6 2-2 6-2-6-6-2Zm65 35 2-5 2 5 5 2-5 2-2 5-2-5-5-2Z" fill="${s.accent}"/>`
    : s.effect === 'trail'
      ? `<path d="M17 43v24m5-36v18m57-6v24m-5-36v18" stroke="${s.accent}" stroke-width="2" stroke-linecap="round" opacity=".7"/>`
      : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100" fill="none" aria-hidden="true">
    ${effect}
    <ellipse cx="50" cy="86" rx="28" ry="7" fill="#060E0E" opacity=".18"/>
    <rect x="22" y="28" width="9" height="18" rx="3" fill="#182728"/><rect x="69" y="28" width="9" height="18" rx="3" fill="#182728"/>
    <rect x="22" y="65" width="9" height="18" rx="3" fill="#182728"/><rect x="69" y="65" width="9" height="18" rx="3" fill="#182728"/>
    <path d="${body}" fill="${s.body}" stroke="${s.wing}" stroke-width="1.5"/>
    <path d="M36 22Q50 18 64 22" stroke="${s.accent}" stroke-width="2" stroke-linecap="round" opacity=".8"/>
    <path d="M36 36 40 30H60L64 36 61 48H39Z" fill="#203D47"/><path d="m40 33 4-1h10l-4 12H40Z" fill="#93BDC6" opacity=".45"/>
    <path d="M39 51H61L63 68H37Z" fill="${s.wing}"/><path d="M40 55h20l1 9H39Z" fill="${s.body}" opacity=".55"/>
    <path d="M37 72H63L61 80H39Z" fill="#203D47"/><path d="M40 74h15l-3 4H40Z" fill="#93BDC6" opacity=".35"/>
    <path d="M31 48h5m28 0h5M31 69h5m28 0h5" stroke="${s.wing}" stroke-width="2" stroke-linecap="round"/>
    <rect x="31" y="20" width="8" height="5" rx="2" fill="#FFF7C9"/><rect x="61" y="20" width="8" height="5" rx="2" fill="#FFF7C9"/>
    <rect x="32" y="81" width="7" height="4" rx="1" fill="#DC5548"/><rect x="61" y="81" width="7" height="4" rx="1" fill="#DC5548"/>
    ${sport ? `<path d="M46 15h8v14h-8Zm0 39h8v13h-8Zm-12 31h32" fill="${s.accent}" stroke="${s.accent}" stroke-width="3"/>` : ''}
    ${luxury ? `<path d="M43 19h14m-13 65h12" stroke="${s.accent}" stroke-width="2" stroke-linecap="round"/>` : ''}
    ${s.id === 'taxi' ? '<rect x="40" y="53" width="20" height="8" rx="2" fill="#F6E5AC"/><path d="M42 55h3v4h-3m5-4h3v4h-3m5-4h3v4h-3" fill="#263737"/>' : ''}
    ${s.id === 'starter' ? `<path d="m34 59 4 2-3 4m28 8 3 2-4 2" stroke="${s.wing}" stroke-width="2" opacity=".7"/>` : ''}
  </svg>`;
}
