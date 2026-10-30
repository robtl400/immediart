# Immediart

An Instagram-style art discovery app over The Metropolitan Museum of Art's open collection. Scroll a snap-feed of paintings, tap an artist or a hashtag to open a grid of related works, like pieces into your own collection, search the whole collection, and open any work in a detail view with pinch zoom.

**Live site:** [immediart.netlify.app](https://immediart.netlify.app)

## Features

- Infinite snap-scroll feed of public-domain paintings and related visual art, rendered card by card as each work resolves
- Artist and hashtag grids, a free-text search grid, and a `/liked` grid of your saved works (likes persist and sync across tabs)
- Detail modal at `/artwork/:id`, so every work has a shareable link; pinch, double-tap or scroll to zoom
- Image carousel on works with extra views; conservation photography (X-ray, infrared, UV, verso) is filtered out
- Keyboard everywhere: arrows or `j`/`k` move between cards, `l` likes, `Enter` opens, `/` searches, `Escape` closes
- Installable PWA with an offline shell and self-hosted fonts
- A launch splash (once per session, skippable) where the flying machine loops in and lands as the logo
- Honest loading states: skeletons while loading, a countdown when the app is deliberately waiting on the Met's rate limit, and automatic retry when it lifts or when you come back online

## Setup

Requires Node 20.19 or later, or 22.12 or later (Vite 7's floor), and npm.

```bash
git clone https://github.com/robtl400/immediart.git
cd immediart
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

```bash
npm test           # vitest, once
npm run test:watch
npm run lint       # eslint
npm run lint:dead  # knip: unused files, exports, dependencies
npm run typecheck  # tsc over services, hooks and utils (checked JavaScript)
npm run build      # production build to dist/
npm run preview    # serve the production build
```

Continuous integration runs lint, the dead-code scan, the type check, the tests and the build on every push to main and every pull request.

## API

The app uses **The Metropolitan Museum of Art Collection API** ([docs](https://metmuseum.github.io/)), base URL `https://collectionapi.metmuseum.org/public/collection`.

| Endpoint | Used for |
|----------|----------|
| `GET /v1.1/search?hasImages=true&medium=Paintings&offset=…&limit=500&q=painting` | the feed's ID list |
| `GET /v1.1/search?hasImages=true&artistOrCulture=true&offset=…&limit=500&q={artist}` | artist grids |
| `GET /v1.1/search?hasImages=true&offset=…&limit=500&q={term}` | hashtag grids and free-text search |
| `GET /v1/objects/{objectID}` | every artwork |

Two things about this API are not in its documentation and shape the code:

- **Search is paginated and capped.** A page holds at most 500 IDs and offsets past 10,000 return nothing, so the app fetches a fixed number of pages: the feed up to 4, grids 1.
- **The rate limit is a bot-protection layer, not a requests-per-second cap.** Measured with `scripts/api-probe.mjs` (findings in `scripts/API-FINDINGS.md`): the Met bans on cumulative volume, roughly 100 requests in a rolling window of about a minute, and the penalty is about 60 seconds of instant 403s. Concurrency and burst rate on their own do not trigger it.

## Tech stack

React 19, React Router 7, Vite 7, Vitest with Testing Library and fake-indexeddb, ESLint, knip, TypeScript (checked JavaScript only), Netlify.

## How the request layer works

```
Met API
  └── RequestManager      token bucket (60 requests / 60s, persisted across reloads and tabs),
        │                 in-flight dedup, dynamic concurrency, circuit breaker for the Met's ban,
        │                 Retry-After holds, throttle visibility (how long until the next request)
        └── metAPI.js     search (q last), per-id fetch with validation, negative cache, 404 tombstones
              └── artworkCache.js   IndexedDB: ID lists (24h), artworks (7d), image-less rejects (24h), 404s (1h)
                    └── usePaginatedFetch   batching, progressive render, prefetch, abort,
                          │                 outage detection, cursor accounting, throttle countdown
                          ├── ArtworksContext   → DiscoveryFeed (feed)
                          ├── GridBrowseContext → GridBrowse (artist / tag / search grids)
                          └── LikedGrid         (its own hook instance over the liked IDs)
```

The parts that were hard, and how they are handled:

**Staying under a limit that bans on volume.** Every request passes through one dispatch queue with a rolling budget of 60 per minute, kept below the measured ban threshold and persisted in local storage so a reload or a second tab cannot spend a second bucket. A 403 (or a block page served with a 200) opens a circuit breaker for the measured penalty length, escalating on a failed probe; going offline or hitting a busy server never trips it. When the app is waiting on purpose, the feed says so and counts down.

**Never fetching the same thing twice.** Every artwork the API returns is cached, including the ones the feed rejects, which are the majority: an uncached reject would be refetched by every scan window that revisits its id, about twelve requests per rendered card. 404s are tombstoned for an hour. Paginated ID lists are cached for a day.

**Pagination over a shuffled list with holes.** A batch scans candidate IDs, skips ones already shown, and advances the cursor only past the id that produced the last kept artwork, so over-fetched or unattempted ids stay visitable. A batch that fails on transport errors is retried once quietly, then surfaced as a retryable error instead of being skipped. Each card renders the moment its artwork resolves, in order.

**Abort on navigation.** Every fetch carries an `AbortController` threaded from context to hook to service; cards streamed before an abort stay on screen and their ids are never revisited.

## Testing

```bash
npm test
```

449 tests across 30 files, in about three seconds, against a real in-memory IndexedDB. The suite covers the request manager's breaker, budget, persistence and degraded-response handling; the API layer's cache contract, retries and outcome statuses; the pagination hook's batching, prefetch, abort, outage and throttle behaviour; the contexts; the feed, grid, liked-grid, modal, carousel, share and splash components; and the transformers and utilities. Regression tests are named after the issue they guard.

## Design

Dark ground (`#121212`), one gold accent (`#F0B900`), Allura for the wordmark, Outfit for everything else. The icons are deliberate: text glyphs, a hand-drawn location pin, and the flying machine as the share icon. There is no icon library, and adding one would change the character of the app.
