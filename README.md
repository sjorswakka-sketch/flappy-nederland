# Flappy Nederland

A small, fully playable browser arcade game with a Dutch twist: flap past canal-side pipes, collect a personal best, and unlock your next bird. Built with TypeScript, Vite, and Canvas 2D, with no runtime framework or external game assets.

## Play

1. Choose a bird on the start screen. Oranje is ready from the beginning.
2. Start your flight. **Tap, click, or press Space** to flap; gravity does the rest.
3. Fly through each opening to earn one point. Touching a pipe, the ground, or the top of the play area ends the flight.
4. Press **P** or **Escape**, or use the pause button, to pause. Leaving the browser tab also pauses the flight.
5. At game over, enter your name and continent, save your score, check the top ten, and fly again.

Bird selection, sound preference, personal best, unlocked birds, and submitted scores are saved on this browser. If browser storage is blocked or full, the game remains playable; persistence may be unavailable. Clearing site data clears this browser's progress.

## Run locally and open the game

Install **Node.js 22.12 or newer** and npm, then open a terminal in the repository:

```sh
npm ci
npm run dev
```

Open the Local URL printed by Vite, normally **http://localhost:5173**, in a modern desktop or mobile browser. To try a phone on the same trusted Wi-Fi, run `npm run dev -- --host 0.0.0.0` and open the Network URL printed by Vite on the phone. Your computer's firewall may need to allow the development server.

Build and preview the production version:

```sh
npm test
npm run build
npm run preview
```

Open the preview URL printed in the terminal, normally **http://localhost:4173**. Serve the `dist/` folder over HTTP when deploying; opening `index.html` directly from disk does not load the TypeScript source or its modules.

## Features

- Frame-rate independent flight physics and responsive, high-DPI Canvas rendering.
- Mouse, touch, and keyboard controls, pause/resume, optional synthesized audio, and a quick restart.
- Clean orange-and-blue design with a Dutch landscape, windmills, canal houses, and tulip details.
- Eight birds with different colors, silhouettes, and simple visual effects.
- Smooth distance-based difficulty, with speed increasing indefinitely.
- Personal best and score-based unlocks saved locally.
- Worldwide and continent views, with all-time, daily, weekly, and monthly filters and a top-ten game-over preview.
- Replaceable leaderboard and ad service boundaries.
- Opt-in rewarded-ad demos for bird unlocks and one continuation per flight; banner/interstitial and remove-ads placeholders.

## Difficulty tuning

The difficulty formula and its constants live in [`src/game/difficulty.ts`](src/game/difficulty.ts). Progress comes from distance travelled during the current flight. Horizontal speed continues to rise smoothly without a maximum. Spawn intervals get shorter, pipe width grows, and openings get tighter, approaching configured limits that keep the geometry usable. This avoids negative spawn times, closed gaps, or unbounded pipe dimensions while the overall challenge keeps increasing.

Tune the exported settings and `difficultyAt(distance)` in one place. Physics, obstacle placement, collision checks, and rendering live in [`src/game/engine.ts`](src/game/engine.ts). Fixed simulation steps reduce differences between display refresh rates. Very long runs are intentionally extremely difficult; the scaling has no final level.

## Add or adjust birds

Edit the `SKINS` collection in [`src/data/skins.ts`](src/data/skins.ts). Every bird has a stable ID, display name, body/wing/accent colors, a shape, an effect, and an `unlockScore`. A score of zero makes a bird available immediately. Use a unique stable ID so saved selections and unlocks continue to work. When introducing a new shape or effect beyond the supplied options, update both the Canvas renderer in the game engine and the picker preview in [`src/bird.ts`](src/bird.ts).

Locked birds can also be unlocked by completing an explicitly labelled rewarded-ad demo. Closing or cancelling that demo grants no reward.

## Leaderboards: local demonstration

**These leaderboards are mock/local, not a live global competition.** Seeded example players are labelled as demo data, and this browser's submissions are stored locally. The worldwide/continent views demonstrate the interface; players on other browsers cannot see your score yet.

[`src/services/leaderboard.ts`](src/services/leaderboard.ts) defines a `LeaderboardService` contract and `LocalLeaderboardService`. It supports a top ten, continent filtering, and calendar periods based on **UTC**: daily from midnight, weekly from Monday (ISO week), and monthly from the first of the month. Each run has a stable ID, so resaving or continuing a run updates that entry instead of duplicating it. A continued flight remains the same run.

To connect a backend, replace the local adapter with an implementation of the same asynchronous `submit` and `list` methods. On a production service, validate names and scores, authenticate/rate-limit submissions, set timestamps server-side, enforce period rules on the server, and verify runs rather than trusting client-provided scores. Browser-local scores and unlocks can be edited by the player and are not an anti-cheat system.

## Advertising and remove ads

**No real ad network, payment processor, purchase, or tracking is enabled.** All placements are labelled demonstrations. The remove-ads option is a local preview switch, not a paid entitlement. It suppresses automatic ad placements; optional rewarded actions remain available.

The suggested combination is a banner outside active play, infrequent interstitial opportunities between flights, and opt-in rewards for a continuation or a bird unlock. The demo interstitial provider includes a run-count threshold and time cooldown so ads do not interrupt every retry. Gameplay pauses for ad-related flows. Rewards are granted only after the provider reports successful completion.

[`src/services/ads.ts`](src/services/ads.ts) exposes the `AdProvider` boundary. A production adapter can use a network suitable for HTML5 games, such as Google's [Ad Placement API](https://developers.google.com/ad-placement), which supports interstitial and rewarded formats. Follow the network's current eligibility, consent, child-directed-content, and placement requirements. Load a real SDK only after the required consent, pause/mute in its ad callbacks, handle no-fill/errors without blocking play, and grant rewards only from the completion callback. Production purchases need checkout, restored purchases, and a verified entitlement from a backend; never trust a local boolean for a paid remove-ads purchase.

## Structure

```text
src/
  game/          # Physics, drawing, difficulty scaling
  data/          # Bird definitions
  services/      # Profile storage, leaderboard and ad adapters
  main.ts        # Screen flow, input and service integration
  bird.ts        # SVG bird previews for the aviary
  style.css      # Responsive interface and optional UI fonts
tests/           # Difficulty, period, persistence and ad invariants
public/          # Static assets
.github/workflows/
  ci.yml         # Tests and production build
  pages.yml      # Build and publish to GitHub Pages
```

## Publish with GitHub Pages

The repository includes a GitHub Actions deployment workflow. In the repository, choose **Settings → Pages → Build and deployment → Source → GitHub Actions**. Push to `main`, or run **Publish game to GitHub Pages** manually in the Actions tab. The workflow runs tests and the production build, then publishes `dist/`. Open the URL shown by the deployment job or the repository's Pages settings. Relative asset paths allow the build to run under the repository's `/flappy-nederland/` path or another static host.

See the official [GitHub Pages workflow guide](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) for hosting configuration. The repository works locally before hosting is enabled.

## License

MIT. Original game art is drawn in code; no third-party images or sound files are required. The interface optionally loads DM Sans and Outfit from Google Fonts, with local system-font fallbacks when that service is unavailable. Those font requests are separate from the ad demos; no ad SDK or analytics/tracking script is loaded.
