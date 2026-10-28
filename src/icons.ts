export const icon = (name: string, size = 20) => {
  const paths: Record<string, string> = {
    play: '<path d="m9 5 11 7-11 7z"/>',
    trophy: '<path d="M8 3h8v5a4 4 0 0 1-8 0V3Zm0 2H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4M12 12v7m-4 2h8"/>',
    bird: '<path d="m5 9 2-5h10l2 5M4 9h16v9H4Zm3 9v3m10-3v3M4 13h3m10 0h3M3 9H1m22 0h-2"/>',
    car: '<path d="m5 9 2-5h10l2 5M4 9h16v9H4Zm3 9v3m10-3v3M4 13h3m10 0h3M3 9H1m22 0h-2"/>',
    steer: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="m4 8 6 3m10-3-6 3m-2 3v7"/>',
    road: '<path d="m7 3-4 18M17 3l4 18M12 3v3m0 5v3m0 5v2"/>',
    wrench: '<path d="M14 5a6 6 0 0 0-7 8L2 18l4 4 5-5a6 6 0 0 0 8-7l-4 3-4-4 3-4Z"/>',
    gauge: '<path d="M4 19a10 10 0 1 1 16 0H4Zm8-5 5-6M5 12H3m18 0h-2M12 4v2"/><circle cx="12" cy="15" r="2"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    sound: '<path d="m11 4-6 5H2v6h3l6 5V4Zm4 4c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/>',
    mute: '<path d="m11 4-6 5H2v6h3l6 5V4Zm5 5 6 6m0-6-6 6"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9 9c0-4 7-4 6 0-.2 2-3 2-3 4m0 3v.2"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    pause: '<path d="M8 5v14m8-14v14"/>',
    restart: '<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>',
    globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
    shield: '<path d="m12 3 8 3v6c0 4-8 9-8 9s-8-5-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
    spark: '<path d="m12 3 2 6 6 3-6 2-2 7-3-7-6-2 6-3 3-6Z"/>'
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.car}</svg>`;
};
