import type { BirdSkin } from './data/skins';
export function birdSvg(s: BirdSkin, size=64): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 80 70" fill="none" aria-hidden="true">
  ${s.effect !== 'none' ? `<path d="m9 21 2-5 2 5 5 2-5 2-2 5-2-5-5-2 5-2Zm57 27 2-4 2 4 4 2-4 2-2 4-2-4-4-2 4-2Z" fill="${s.accent}"/>` : ''}
  <path d="M21 37 8 29l3 18 16-2" fill="${s.wing}"/>
  <ellipse cx="40" cy="36" rx="${s.shape === 'slim' ? 22 : 25}" ry="${s.shape === 'slim' ? 18 : 22}" fill="${s.body}"/>
  <ellipse cx="45" cy="44" rx="16" ry="12" fill="${s.accent}" opacity=".7"/>
  <path d="M37 32c-18-8-21 11-6 13 8 1 11-4 6-13Z" fill="${s.wing}"/>
  <path d="m59 34 13 5-13 4" fill="#F3B44E"/>
  <ellipse cx="51" cy="28" rx="6" ry="7" fill="#FFFDF7"/><circle cx="53" cy="28" r="3" fill="#263D48"/>
  <circle cx="54" cy="27" r="1" fill="white"/>
  ${s.shape === 'royal' ? '<path d="m27 15-2-10 9 5 6-8 5 9 9-5-2 12Z" fill="#EDB74C" stroke="#C78A30" stroke-width="1.5"/>' : '<path d="m29 16 3-6 5 6" fill="'+s.body+'"/>'}
  </svg>`;
}
