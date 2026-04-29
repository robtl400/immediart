# Immediart

An Instagram-style art discovery app that lets you explore The Metropolitan Museum of Art's collection. Scroll through curated artworks, tap hashtags and artist names to discover related pieces, and view detailed artwork information in a modal overlay.

**Live Site:** [immediart.netlify.app](https://immediart.netlify.app)

## Features

- Infinite scroll feed of public domain artworks
- Click artist names to see more works by that artist
- Click hashtags to discover artworks with similar themes
- Modal view with detailed artwork metadata
- Responsive mobile-first design
- **IndexedDB caching** — repeat sessions load instantly from local cache (ID lists 24h, artwork objects 7d)
- **Skeleton screens** — shimmer card placeholders while loading, matching real card layout
- **Background prefetch** — next batch fetches silently while you view the current one; scroll hits are instant

## Setup Instructions

### Prerequisites
- Node.js 18+
- npm

### Installation

```bash
# Clone the repository
git clone https://github.com/robtl400/immediart.git
cd immediart

# Install dependencies
npm install
```

### Run Locally

```bash
# Start development server
npm run dev
```

The app will be available at `http://localhost:5173`

### Build for Production

```bash
npm run build
npm run preview  # Preview the production build locally
```

## API

This app uses **The Metropolitan Museum of Art Collection API**.

**Base URL:** `https://collectionapi.metmuseum.org/public/collection/v1`

### Endpoints Used

| Endpoint | Description |
|----------|-------------|
| `GET /search?hasImages=true&q={query}` | Search for artworks by keyword |
| `GET /search?hasImages=true&artistOrCulture=true&q={artist}` | Search by artist name |
| `GET /objects/{objectID}` | Get detailed artwork data |

**Documentation:** [metmuseum.github.io](https://metmuseum.github.io/)

**Rate Limit:** 80 requests/second (the app implements a `RequestManager` service with HTTP throttling, request deduplication, dynamic concurrency scaling, and a circuit breaker to stay within limits)

## Tech Stack

- React 19
- React Router 7
- Vite
- Vitest + @testing-library/react + fake-indexeddb (testing)
- Netlify (hosting)

## Testing

```bash
npm test        # Run all tests once
npm run test:watch  # Watch mode
```

Tests cover:
- **IndexedDB cache layer** (`artworkCache.js`): TTL expiry, cache hit/miss, in-flight deduplication, key namespacing, storage error resilience
- **Met API integration** (`metAPI.js`): cache integration, 403 retry exhaustion, AbortError propagation, network failure retry, batch 404 filtering, abort mid-batch
- **Paginated fetch hook** (`usePaginatedFetch.js`): batch loading, prefetch, abort, guard logic, delay-skip on cache hit, MAX trim — shared engine used by both contexts
- **Request manager** (`requestManager.js`): HTTP throttling, deduplication, dynamic concurrency, circuit breaker state machine (CLOSED → OPEN → HALF_OPEN)
- **Context layer** (`ArtworksContext`, `GridBrowseContext`): thin wrapper behaviour, correct delegation to `usePaginatedFetch`
- **Delay utilities** (`delay.js`): `delay`, `addJitter`, `delayOrAbort` helpers
- **ArtworkCard** (`ArtworkCard.jsx`): purely presentational rendering, `onArtistClick`/`onTagClick` prop wiring

## Technical Decisions

**Why Vite?** Zero-config React setup with instant HMR. No webpack config to maintain. The MET API is public so there's no server-side auth to hide — a static bundle deployed to Netlify is the simplest possible production path.

**Why the MET API?** ~500k public domain artworks with rich structured metadata (artist, medium, culture, period, gallery, tags). The API is free, has no auth, and the dataset is large enough that two users are unlikely to see identical feeds. The Instagram metaphor — posting 19th century paintings as if they were social content — only works with real cultural data, not Lorem Ipsum art.

**What was hard: deduplication across paginated randomised IDs.** The MET search API returns a shuffled flat list of ~20k object IDs per query. We paginate through them in batches of 6, fetching each artwork in parallel. The hard part: the same ID can appear in multiple searches (artist + hashtag), and the shuffle means IDs repeat across sessions. Solution: `artworkCache.js` tracks seen IDs in IndexedDB with a 7-day TTL. The paginated hook skips IDs already displayed in the current session (`seenIds` Set) and skips IDs that fail validation (no image, wrong object type). This produces a feed that never repeats within a session and degrades gracefully when the API returns duplicates or 404s.

**What was hard: staying under the 80 req/s rate limit.** Each artwork detail fetch is one request, and we batch 6 at a time. `RequestManager` is a small HTTP scheduler with a token bucket, request deduplication (same URL in-flight = one fetch, multiple waiters), dynamic concurrency scaling (backs off on 429/503, ramps back up on success), and a circuit breaker that opens after 5 consecutive failures. This lets the feed load aggressively without hammering the API.

**What was hard: abort on navigation.** React's concurrent rendering means a component can unmount while a batch fetch is in progress. Every fetch uses an `AbortController` threaded through the context → hook → service layer. The hook's cleanup function calls `abort()`, which cancels in-flight `fetch()` calls and prevents the "can't call setState on unmounted component" warning. The tricky part is aborting mid-batch: if 3 of 6 fetches complete before abort, we discard all 6 rather than display a partial batch.

**What I'd do differently:** Add a `DESIGN.md` design system file earlier. I inferred font sizes, spacing, and colour tokens from the CSS as I went. Having a canonical reference would have prevented the handful of inconsistencies this sweep fixed (wrong opacity value, unmatched transition durations, inline styles in one component).

**Architecture sketch:**

```
MET API
  └── RequestManager (throttle, dedup, circuit breaker)
        └── metAPI.js (search, fetch, cache integration)
              └── artworkCache.js (IndexedDB, TTL)
                    └── usePaginatedFetch (batching, prefetch, abort)
                          ├── ArtworksContext → DiscoveryFeed (scroll feed)
                          └── GridBrowseContext → GridBrowse (artist/tag grid)
```
