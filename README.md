# Drunken Joyride

A midnight arcade drive through Dutch roads. Weave through moving traffic, thread roadworks, build near-miss combos, and turn earned points into permanent car upgrades for the next run. Built with TypeScript, Vite, and Canvas 2D.

**[Play Drunken Joyride online](https://sjorswakka-sketch.github.io/flappy-nederland/)** · No installation needed. The existing repository and URL are retained after the redesign.

## Download the Windows test build

**[Download Windows x64 ZIP](https://github.com/sjorswakka-sketch/flappy-nederland/releases/download/windows-preview/Drunken-Joyride-Windows-x64.zip)** · [Latest Windows preview and build details](https://github.com/sjorswakka-sketch/flappy-nederland/releases/tag/windows-preview)

1. Download `Drunken-Joyride-Windows-x64.zip` from the GitHub release.
2. Extract the **entire ZIP** into a folder.
3. Open **`Drunken Joyride.exe`** in that folder on Windows 10 or 11, 64-bit.

No installer, Node.js, or local web server is needed to play. Keep the executable alongside its extracted resources; copying only the `.exe` does not produce a working app. This is an unsigned test build.

The game is bundled with Electron and gameplay works offline. Desktop records, wallet, upgrades, and car unlocks are stored separately from browser progress. Website AdSense integration is intended for the hosted browser game; the Windows version keeps advertisement placeholders.

Every push to `main` and every pull request creates a Windows build in [GitHub Actions](https://github.com/sjorswakka-sketch/flappy-nederland/actions). A successful main build updates the downloadable `windows-preview` prerelease after tests and a launch check of the packaged app pass. Each run also retains a commit-specific Actions artifact; pull-request builds are available there without updating the public preview. The workflow can be started manually from the Actions tab.

To build or run the desktop app from source on Windows:

```sh
npm ci
npm run desktop:dev
```

`desktop:dev` builds the current web game and opens it in Electron. To produce the distributable ZIP instead:

```sh
npm run desktop:build
```

The ZIP is written to `release/`. Build logs and checks are available in the corresponding GitHub Actions run.

## How to play

1. Choose a car in the garage. The Rust Bucket is available from the beginning.
2. Start a run. **Hold Left/Right arrows or A/D** to steer continuously across the road. The car sways, so keep correcting your line.
3. On a phone, hold the left/right controls or drag across the road. Find a gap between cars, trucks, and roadworks; watch for traffic indicating a lane change.
4. Pass obstacles to score. Close passes earn near-miss points and grow a combo up to **5×**; the combo drops if you leave too long between near misses. A collision still ends the run.
5. During a run, press **Space or Shift** to use boost. Boost spends charge, makes the road arrive faster, and doubles obstacle-row points. Overtakes and near misses recover charge. Boost does **not** protect you from crashes.
6. Press **P** or **Escape**, or use the pause button, to pause. Leaving the tab also pauses. Use **Space** to start or restart when a run is not active.
7. Chase the run targets for distance, near misses, and combo. Your earned points are banked in a persistent wallet as you score. At game over, review your run, buy permanent upgrades in the garage, and drive again to earn points faster. An optional reward demo offers one repair and continuation per run.
8. Enter a driver name and continent to save a leaderboard score. Spending wallet points does not reduce your run score or personal best.

Speed, traffic frequency, and obstacle sizes increase with distance. Sectors rotate through **City Run, Canal Express, Tunnel Vision, and Roadworks**, changing the scene and available road width. Generated traffic leaves a route, but you must react to moving vehicles and shrinking margins.

Car choice, sound preference, wallet balance, permanent upgrades, best score, unlocked cars, and submitted scores stay on this browser. Storage failures do not prevent playing, but progress may then last only for the session. Clearing site data resets progress. Existing driving profiles keep their best score and unlocked cars when upgraded to this version; the new wallet starts at zero rather than inventing past earnings.

## Earn points, upgrade, repeat

Each new point earned during a drive is also added to your wallet. Points stay banked after a crash, so a short run still helps fund the next upgrade. A repaired continuation keeps the same run ID: previously credited points cannot be collected twice by continuing or saving the same score again.

Spend points in the garage's upgrade workshop between runs:

- **Engine:** raises driving speed, so you cover road and reach new scoring opportunities faster.
- **Handling:** improves steering response and control while reducing sway, helping you survive tighter traffic.
- **Nitro:** extends boost and improves charge recovery, allowing more bursts of speed and double obstacle-row points.
- **Points multiplier:** increases score earned from overtakes and near misses; those extra points are also banked for future upgrades.

The first levels cost **25 points for Engine, 20 for Handling, 30 for Nitro, and 35 for the Points multiplier**. The workshop shows the current effect, next effect, price, and any points still needed before a purchase.

The loop is **drive → bank points → buy upgrades → survive and score better → buy more upgrades**. Upgrades are permanent for every car in this browser or desktop profile. Each level has a higher point cost, with no fixed gameplay level cap. Opening the garage pauses an active drive, so you can browse and purchase without losing the run. New tuning takes effect on the **next** drive and never changes the paused run's handling or scoring. The wallet is separate from the personal best and leaderboard score.

Upgrade definitions, costs, and effect curves live in [`src/data/upgrades.ts`](src/data/upgrades.ts). Score crediting and purchases live in [`src/services/economy.ts`](src/services/economy.ts). Both use validated whole-number point balances, and insufficient funds leave the wallet and upgrade level unchanged. Some handling and boost effects approach useful limits to keep the game controllable, while the economy can continue progressing.

Upgrade points are earned by playing. This version does not sell points or upgrades for money. The advertisement slot, optional rewarded repair and cosmetic-car demos, and remove-ads preview remain separate from the upgrade economy; they are not real paid transactions.

## Run and open locally

Install **Node.js 22.12 or newer** and npm, then open a terminal in the repository:

```sh
npm ci
npm run dev
```

Open the Local URL printed by Vite, normally **http://localhost:5173**. For a phone on the same trusted Wi-Fi, run `npm run dev -- --host 0.0.0.0` and open the printed Network URL. The computer's firewall may need to allow the server. HTTP LAN previews work without secure-context-only run-ID APIs.

Build and preview production:

```sh
npm test
npm run build
npm run preview
```

Open the preview URL, normally **http://localhost:4173**. Deploy the generated `dist/` directory over HTTP; opening the source `index.html` directly from disk does not compile TypeScript.

## Features

- Top-down endless driving with traffic cars, trucks, lane-changing vehicles, striped barriers, cones, and Dutch highway details.
- Frame-rate independent physics, responsive high-DPI rendering, continuous keyboard steering, and hold/drag touch controls.
- Near-miss combos, charge-based boost, moving traffic, and rotating road sectors that alter the available space.
- Run targets and a results summary showing distance, near misses, and peak combo.
- Persistent earned-points wallet and four permanent upgrade paths: speed, handling, nitro, and points yield.
- Comic car sway, optional synthesized sound, pause, crash, restart, and one rewarded repair per run.
- Eight unlockable cars with different bodies, colors, lights, and effects.
- Indefinite distance-based difficulty progression, with tuning in one module.
- Local best scores, car unlocks, and top tens for worldwide, continent, daily, weekly, and monthly views.
- Prominent display-ad placement, an AdSense connection boundary, and opt-in demo rewards.

## Cars and difficulty tuning

The garage is defined in [`src/data/skins.ts`](src/data/skins.ts). Cars unlock at scores **0, 25, 75, 150, 300, 500, 800, and 1200**: Rust Bucket, Midnight GT, Bubblegum, Taxi, Road King, Mint Condition, Blackout, and Neon Runner. Previously unlocked cars stay unlocked after an update. Locked cars can also be unlocked by completing an explicitly labelled reward demo. Cancelling a demo grants no reward.

Add a car with a unique stable ID, name, body/trim/accent colors, shape, effect, and `unlockScore`. The `round`, `slim`, and `royal` values select the supplied body styles. Update both the game renderer and [`src/car.ts`](src/car.ts) when adding new shapes or effects.

Tune progression in [`src/game/difficulty.ts`](src/game/difficulty.ts). Speed rises smoothly without a final level; spawn timing and obstacle geometry approach configured bounds instead of becoming negative or covering the entire road. Physics, continuous steering, traffic movement, sector layout, boost, combo scoring, collision detection, and drawing live in [`src/game/engine.ts`](src/game/engine.ts). Fixed simulation steps reduce differences between refresh rates. Extremely long runs are intentionally very difficult.

## Advertisements and real revenue

The prominent advertisement region reserves space outside the driving controls. **An empty or demo banner earns no advertising revenue.** No advertising account or publisher IDs have been connected yet. The default build shows a setup placeholder and sends no ad requests. Rewarded ads, interstitials, and the remove-ads purchase flow are also clearly labelled demos.

The display-banner adapter in [`src/services/ads.ts`](src/services/ads.ts) can request a real responsive AdSense unit after these steps:

1. Create an AdSense account and obtain account/site approval. Ads cannot show before approval. Follow [Google's site connection steps](https://support.google.com/adsense/answer/7584263).
2. Create a responsive display unit. Copy `.env.example` to `.env.local` and fill `VITE_ADSENSE_CLIENT` and `VITE_ADSENSE_SLOT` with your own public publisher/unit IDs. Never put private credentials in `VITE_*` variables: they are embedded in public browser code.
3. Connect production consent handling. The UI opt-in gate prevents automatic requests but is not a certified consent-management platform. Personalized ads for EEA, UK, and Swiss visitors require a [Google-certified CMP with TCF support](https://support.google.com/adsense/answer/13554116). Mount only after that platform grants the required consent.
4. Build and deploy again with those IDs.

Account setup uses the operator's real payment country and details; no account is created by the game itself. The [signup URL must not contain a path](https://support.google.com/adsense/answer/2784438), so `/flappy-nederland/` is not a standalone site entry. Arrange a reachable domain homepage and the requested ownership verification before submitting the site for review. Google's [add-site flow](https://support.google.com/adsense/answer/12169212) supports a publisher meta tag for verification without requesting a banner.

`getDisplayAdConfig()` validates both IDs. `mountDisplayAd(element, config, { consent: true, onStatus })` creates the unit and loads the SDK once. Missing configuration or consent causes no network request. Status values are `loading`, `active`, and `unavailable`. The adapter reports `active` only on `data-ad-status="filled"`; see [Google's fill-status documentation](https://support.google.com/adsense/answer/10762946). Script errors, no-fill, and a timeout leave the game usable. Revenue figures come from the publisher dashboard. Cleanup removes the unit and prevents a pending SDK load from requesting a disposed unit.

For GitHub Actions builds, add public repository variables `VITE_ADSENSE_CLIENT` and `VITE_ADSENSE_SLOT` and expose them in the workflow build-step environment. Local `.env.local` files are ignored by Git and are not uploaded. An `ads.txt` file, if your account requires one, must use the exact line supplied by the provider; none is invented here.

The separate `AdProvider` interface supports future game-ad providers such as Google's [H5 Ad Placement API](https://developers.google.com/ad-placement). For real playback, pause/mute the game and grant rewards only from verified completion, never cancellation, no-fill, or a generic close callback. Demo interstitials have a run-count threshold and time cooldown. The remove-ads option previews a local entitlement and collects no payment; production purchases need checkout and a server-verified entitlement.

## Leaderboards are a local demonstration

**Worldwide is a view, not a connected global competition.** Clearly marked sample drivers are combined with runs saved on this browser. Other browsers cannot see a score yet.

[`src/services/leaderboard.ts`](src/services/leaderboard.ts) defines an asynchronous `LeaderboardService`. The local adapter supports top ten, continent filtering, and UTC calendar periods: daily from midnight, weekly from Monday, and monthly from the first day. Continued runs retain their ID and original timestamp, so saving again updates the entry instead of duplicating it or refreshing its period.

Replace the adapter with an HTTP service to connect a backend. Validate submissions, use server timestamps, rate-limit/authenticate writes, and verify runs rather than trusting client scores. Local scores and unlocks can be edited by the player and are not an anti-cheat system.

## Structure and deployment

```text
src/
  game/          # Driving, drawing, collisions and difficulty
  data/          # Vehicle definitions, upgrade costs and effect curves
  services/      # Profile, upgrade economy, leaderboard and ad adapters
  main.ts        # Screens, input and service integration
  car.ts         # Garage SVG vehicle previews
  style.css      # Responsive interface
tests/           # Gameplay and service invariants
public/          # Static assets
.env.example     # Empty public display-ad configuration
.github/workflows/
  ci.yml         # Tests and production build
  pages.yml      # Build and deploy GitHub Pages
  windows.yml    # Windows package, launch check, and preview release
desktop/         # Electron window and Windows packaging configuration
```

GitHub Pages uses GitHub Actions. Pushing to `main` runs tests, builds the app, and publishes `dist/`. The deployment workflow can also run manually in the Actions tab. Relative asset paths support the existing `/flappy-nederland/` URL and other static hosts. Forks must select **Settings → Pages → Source → GitHub Actions**. See the [official Pages workflow guide](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## License

MIT. Game artwork is drawn in code; no third-party image or sound files are required. Optional Google Fonts have local system-font fallbacks. In the default unconfigured build, no ad SDK or ad-tracking script is loaded.
