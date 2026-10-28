# Drunken Joyride

A midnight arcade drive through Dutch roads. Dodge random traffic and roadworks, switch lanes, collect new cars, and chase one more personal best. Built with TypeScript, Vite, and Canvas 2D.

**[Play Drunken Joyride online](https://sjorswakka-sketch.github.io/flappy-nederland/)** · No installation needed. The existing repository and URL are retained after the redesign.

## How to play

1. Choose a car in the garage. The Rust Bucket is available from the beginning.
2. Start a run. Use **Left/Right arrows** or **A/D** to switch between three lanes.
3. On a phone, use the left/right controls or swipe across the road. Find the open lane between traffic and roadworks.
4. Each safely passed obstacle row adds a point. Crashing ends the run. The car has a small, predictable sway; lane changes remain under your control.
5. Press **P** or **Escape**, or use the pause button, to pause. Leaving the tab also pauses. Use **Space** to start or restart.
6. At game over, enter a driver name and continent, save the score, check the top ten, and try again. An optional reward demo offers one extra life per run.

Speed, traffic frequency, and obstacle sizes increase with distance. Generated rows leave an open route, but the next safe lane can change.

Car choice, sound preference, best score, unlocked cars, and submitted scores stay on this browser. Storage failures do not prevent playing, but progress may then last only for the session. Clearing site data resets progress. New `drunken-joyride:*` storage keys keep driving scores separate from the previous game.

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

- Top-down, three-lane endless driving with traffic cars, striped road barriers, cones, and Dutch highway details.
- Frame-rate independent physics, responsive high-DPI rendering, touch/swipe and keyboard controls.
- Smooth lane changes, comic car sway, optional synthesized sound, pause, crash, restart, and one rewarded continuation.
- Eight unlockable cars with different bodies, colors, lights, and effects.
- Indefinite distance-based difficulty progression, with tuning in one module.
- Local best scores, car unlocks, and top tens for worldwide, continent, daily, weekly, and monthly views.
- Prominent display-ad placement, an AdSense connection boundary, and opt-in demo rewards.

## Cars and difficulty tuning

The garage is defined in [`src/data/skins.ts`](src/data/skins.ts). Cars unlock at scores **0, 5, 10, 20, 35, 50, 75, and 100**: Rust Bucket, Midnight GT, Bubblegum, Taxi, Road King, Mint Condition, Blackout, and Neon Runner. Locked cars can also be unlocked by completing an explicitly labelled reward demo. Cancelling a demo grants no reward.

Add a car with a unique stable ID, name, body/trim/accent colors, shape, effect, and `unlockScore`. The `round`, `slim`, and `royal` values select the supplied body styles. Update both the game renderer and [`src/car.ts`](src/car.ts) when adding new shapes or effects.

Tune progression in [`src/game/difficulty.ts`](src/game/difficulty.ts). Speed rises smoothly without a final level; spawn timing and obstacle geometry approach configured bounds instead of becoming negative or covering the entire road. Physics, road layout, safe-row generation, collision detection, and drawing live in [`src/game/engine.ts`](src/game/engine.ts). Fixed simulation steps reduce differences between refresh rates. Extremely long runs are intentionally very difficult.

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
  data/          # Vehicle definitions
  services/      # Profile, leaderboard and ad adapters
  main.ts        # Screens, input and service integration
  car.ts         # Garage SVG vehicle previews
  style.css      # Responsive interface
tests/           # Gameplay and service invariants
public/          # Static assets
.env.example     # Empty public display-ad configuration
.github/workflows/
  ci.yml         # Tests and production build
  pages.yml      # Build and deploy GitHub Pages
```

GitHub Pages uses GitHub Actions. Pushing to `main` runs tests, builds the app, and publishes `dist/`. The deployment workflow can also run manually in the Actions tab. Relative asset paths support the existing `/flappy-nederland/` URL and other static hosts. Forks must select **Settings → Pages → Source → GitHub Actions**. See the [official Pages workflow guide](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## License

MIT. Game artwork is drawn in code; no third-party image or sound files are required. Optional Google Fonts have local system-font fallbacks. In the default unconfigured build, no ad SDK or ad-tracking script is loaded.
