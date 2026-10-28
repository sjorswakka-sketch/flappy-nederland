/** UI supplies this callback; a true result means the demo was explicitly completed. */
export type AdPlacement = 'rewarded' | 'interstitial';
export type DemoAdRunner = (placement: AdPlacement) => Promise<boolean>;
export interface AdProvider {
  rewarded(reason: string): Promise<boolean>;
  interstitial(): Promise<void>;
  setAdsDisabled(disabled: boolean): void;
}

/**
 * No real ads, SDKs or payments are loaded by this adapter.
 * For production, implement AdProvider using e.g. Google's H5 Ad Placement API:
 * - resolve rewarded(true) ONLY from adViewed, never afterAd/adBreakDone;
 * - cancellations, unavailable inventory and errors must resolve false;
 * - pause/mute beforeAd and resume afterAd; retain local frequency limits;
 * - apply consent and network eligibility before loading a real SDK.
 * The separate display-banner adapter below can load a real configured AdSense unit.
 */
export class DemoAdProvider implements AdProvider {
  private disabled: boolean;
  private completedRuns = 0;
  private lastInterstitial = -Infinity;
  private busy = false;
  private readonly minRuns: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;

  constructor(private readonly runDemo: DemoAdRunner, options: {
    adsDisabled?: boolean; minRuns?: number; cooldownMs?: number; now?: () => number;
  } = {}) {
    this.disabled = options.adsDisabled ?? false;
    this.minRuns = Math.max(1, Math.floor(options.minRuns ?? 3));
    this.cooldownMs = Math.max(0, options.cooldownMs ?? 120_000);
    this.now = options.now ?? (() => Date.now());
  }

  setAdsDisabled(disabled: boolean): void { this.disabled = disabled; }

  /** Voluntary rewarded placements remain opt-in even when forced ads are disabled. */
  async rewarded(reason: string): Promise<boolean> {
    if (this.busy || !reason.trim()) return false;
    this.busy = true;
    try { return (await this.runDemo('rewarded')) === true; }
    catch { return false; }
    finally { this.busy = false; }
  }

  /** Call once at a natural break after each completed run; never during live gameplay. */
  async interstitial(): Promise<void> {
    this.completedRuns += 1;
    if (this.disabled || this.busy || this.completedRuns < this.minRuns || this.now() - this.lastInterstitial < this.cooldownMs) return;
    this.busy = true;
    this.completedRuns = 0;
    this.lastInterstitial = this.now();
    try { await this.runDemo('interstitial'); }
    catch { /* No inventory or a provider failure never blocks the next game. */ }
    finally { this.busy = false; }
  }
}

export interface DisplayAdConfig { client: string; slot: string }
export type DisplayAdStatus = 'loading' | 'active' | 'unavailable';
export interface DisplayAdOptions {
  /** The UI must obtain consent before requesting an ad, never infer it from play. */
  consent: boolean;
  onStatus?: (status: DisplayAdStatus) => void;
}

declare global {
  interface Window { adsbygoogle?: { push: (value: Record<string, unknown>) => unknown } }
}

/** Publisher and unit IDs are public identifiers, embedded by Vite at build time. */
export function getDisplayAdConfig(env: Record<string, unknown> = import.meta.env): DisplayAdConfig | null {
  const client = typeof env.VITE_ADSENSE_CLIENT === 'string' ? env.VITE_ADSENSE_CLIENT.trim() : '';
  const slot = typeof env.VITE_ADSENSE_SLOT === 'string' ? env.VITE_ADSENSE_SLOT.trim() : '';
  return /^ca-pub-\d{16}$/.test(client) && /^\d{1,20}$/.test(slot) ? { client, slot } : null;
}

let sdkLoad: { client: string; promise: Promise<void> } | undefined;
function loadDisplaySdk(client: string): Promise<void> {
  if (sdkLoad) return sdkLoad.client === client ? sdkLoad.promise : Promise.reject(new Error('A different publisher is already loaded.'));
  const script = document.createElement('script');
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
  script.dataset.joyrideAdsense = 'true';
  const promise = new Promise<void>((resolve, reject) => {
    script.onload = () => resolve();
    script.onerror = () => { sdkLoad = undefined; script.remove(); reject(new Error('Ad SDK unavailable.')); };
  });
  sdkLoad = { client, promise };
  document.head.append(script);
  return promise;
}

/**
 * Mount only in a visible, separate ad region, after explicit consent. A valid
 * configuration alone never loads the SDK. A filled signal confirms inventory,
 * not revenue: earnings and approval status come from the publisher dashboard.
 * Reference: support.google.com/adsense/answer/10762946 (data-ad-status).
 */
export function mountDisplayAd(element: HTMLElement, config: DisplayAdConfig | null, options: DisplayAdOptions = { consent: false }): () => void {
  const valid = config && getDisplayAdConfig({ VITE_ADSENSE_CLIENT: config.client, VITE_ADSENSE_SLOT: config.slot });
  if (!valid || options.consent !== true) {
    options.onStatus?.('unavailable');
    return () => {};
  }
  let disposed = false;
  let state: DisplayAdStatus = 'loading';
  const status = (next: DisplayAdStatus) => {
    if (disposed) return;
    state = next;
    element.dataset.adState = next;
    options.onStatus?.(next);
  };
  const unit = document.createElement('ins');
  unit.className = 'adsbygoogle';
  unit.style.display = 'block';
  unit.style.width = '100%';
  unit.style.minHeight = '90px';
  unit.setAttribute('data-ad-client', valid.client);
  unit.setAttribute('data-ad-slot', valid.slot);
  unit.setAttribute('data-ad-format', 'auto');
  unit.setAttribute('data-full-width-responsive', 'true');
  element.replaceChildren(unit);
  status('loading');
  const observer = new MutationObserver(() => {
    const fill = unit.getAttribute('data-ad-status');
    if (fill === 'filled') { clearTimeout(timeout); status('active'); }
    else if (fill === 'unfilled' || fill === 'unfill-optimized') { clearTimeout(timeout); status('unavailable'); }
  });
  observer.observe(unit, { attributes: true, attributeFilter: ['data-ad-status'] });
  const timeout = setTimeout(() => { if (state === 'loading') status('unavailable'); }, 25_000);
  void loadDisplaySdk(valid.client).then(() => {
    if (disposed || !unit.isConnected) return;
    try { (window.adsbygoogle ??= [] as Record<string, unknown>[]).push({}); }
    catch { status('unavailable'); }
  }).catch(() => status('unavailable'));
  return () => {
    disposed = true;
    clearTimeout(timeout);
    observer.disconnect();
    unit.remove();
    delete element.dataset.adState;
  };
}
