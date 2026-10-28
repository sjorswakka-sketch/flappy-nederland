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
 * Banner placement lives in the UI and can be replaced independently.
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
