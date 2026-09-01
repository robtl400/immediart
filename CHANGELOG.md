# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-09-01

Everything since 0.0.3, in the order it shipped.

### Added
- Feed filtered to paintings and related visual art (watercolours, frescoes, murals, portraits, thangkas, kakemono) via a strict validation mode; artist and tag grids stay unfiltered
- Social layer on every card: location tag, museum-highlight badge, artist bio snippet, credit line as a "sponsored post", and an artist profile header on artist grids
- Likes, persisted in localStorage and synced across tabs, with a `/liked` grid and a like-count badge in the banner
- The artwork modal is a route (`/artwork/:id`) rendered over the page you were on, so shared links open the piece directly and the back button closes it
- Free-text search from the banner, with its own grid route
- Image carousel for works with additional views (native scroll-snap, dots, keyboard), and pinch/double-tap/scroll zoom in the modal
- Keyboard navigation in the feed (arrows or j/k, l to like, Enter to open, / to search) and a keyboard-operable image and chips on every card
- Installable PWA: manifest, service worker with a precached shell, self-hosted fonts, so the shell loads offline
- Launch splash: the flying machine loops in and lands as the logo, now on the Web Animations API, once per session, skippable by tap or keyboard
- Progressive rendering: each card appears as its artwork resolves instead of waiting for the whole batch
- Adaptive card frames that follow each image's aspect ratio (clamped), replacing fixed-height frames
- A measurement-grade probe of the Met API's throttle (`scripts/api-probe.mjs`, findings in `scripts/API-FINDINGS.md`) that grounds every rate-limit constant
- A "slowing down, resuming in Ns" notice wherever the app is deliberately waiting on the Met's limits, with automatic retry when the wait ends
- Design tokens for spacing, type, radius and motion; a shared skeleton shimmer for every loading state
- Hover prefetch of artist and tag grids (desktop only), so a tap opens a grid that is already warm
- An error boundary around the routes, so a render error shows a framed page with a way back instead of a blank screen
- Continuous integration (lint, dead-code scan, type check, tests, build) and a `typecheck` / `lint:dead` script pair

### Changed
- Request layer rebuilt around what the probe measured: a rolling 60-requests-per-60-seconds budget that persists across reloads and tabs, a circuit breaker that opens for the measured penalty length and escalates, block-page detection, no retries inside a penalty, and no breaker trips from going offline or from a busy server (429/5xx honour `Retry-After` instead)
- Every artwork the API rejects is negative-cached so it is never refetched; 404s are remembered for an hour; the modal always re-checks a shared link live
- An outage (a batch that fails on transport errors) is retried once quietly, then surfaced as a retryable error instead of silently skipping the failed ids
- Search serialises `q` last: the Met endpoint returns zero results when a boolean filter follows it
- Tapping the logo reshuffles the feed from cache instead of wiping it; from any other page it just goes home
- Banner logo and wordmark sized to clear the search button on every phone width; contrast fixes on modal labels, credit lines and fallback text
- Every full-height view sizes to the visible viewport; the app paints edge to edge in home-screen mode with the banner, splash, search field and scroll positions padded for the status bar and home indicator
- Share sheet text omits "by" for anonymous works; the share button reports "Copied!" only after a real clipboard write and "Couldn't copy" otherwise
- Carousel skips X-ray, infrared, UV and verso conservation photography
- Like buttons expose a pressed state, share feedback reaches screen readers, zoom instructions are read as a description

### Security
- Netlify security headers on every route (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`), immutable caching for hashed assets, and a React Router bump that clears two advisories

### Fixed
- Infinite scroll stalling after a few posts (the feed was spending ~12 requests per card and hitting the budget)
- Artist searches returning nothing on a cold cache
- A spurious breaker trip on a body-stream read error
- A closed IndexedDB connection making every cache read fail until reload
- Reduced-motion visitors on iPhone seeing a flattened splash
- The flier landing invisible after the animation rework (implicit end keyframe)

### Removed
- The `clearCache` escape hatch (no consumer; versioned keys and TTLs self-heal), the modal-close delay constant, and several exports with no importer

### For contributors
- 449 tests across 30 files; `npm run lint:dead` (knip) and `npm run typecheck` (checked JavaScript over services, hooks and utils) run in CI alongside lint, tests and the build

## [0.0.3] - 2026-03-21

### Added
- `DESIGN_IMPLEMENTATION.md` — comprehensive design system document covering aesthetic, typography, color palette, layout, spacing, motion, and component implementation plan for the `feat/ui-redesign` pass
- Regression test for pre-warm ordering in `DiscoveryFeed` — verifies that `initSearch` fires before `navigate` on artist/tag click (preventing a silent 150–300ms cold-start regression)
- Tests for `usePaginatedFetch` `initialBatchSize` option — verifies first fetch uses `initialBatchSize` while background prefetch and subsequent `loadMore` calls use `batchSize`
- Tests for `usePaginatedFetch` circuit breaker silent freeze — verifies that an `AbortError` from the circuit breaker swallows silently with no error state, no loading flicker, and artworks preserved
- Backlog item for `/liked` route (liked collection view) added to `TODOS.md`

## [0.0.2] - 2026-03-20

### Added
- `usePaginatedFetch` hook — shared paginated batch-fetch engine used by both `ArtworksContext` and `GridBrowseContext`, replacing ~85% duplicated logic across contexts
- `RequestManager` service — centralised HTTP throttling, deduplication, dynamic concurrency scaling, and circuit breaker (CLOSED → OPEN → HALF_OPEN) replacing scattered rate-limit globals in `metAPI.js`
- `delay.js` utility — extracted `delay`, `addJitter`, and `delayOrAbort` helpers shared across hooks and services
- An empirical MET API throttle probe used to tune constants (dev tool, not shipped; since superseded by `scripts/api-probe.mjs`)
- Discovery feed pre-warms grid data on artist/tag click via `initSearch` before route change completes

### Changed
- `ArtworksContext` and `GridBrowseContext` refactored to thin wrappers around `usePaginatedFetch`; all batch/pagination/prefetch/abort logic now lives in the hook
- `ArtworkCard` is now purely presentational — navigation side effects lifted to `DiscoveryFeed` via `onArtistClick`/`onTagClick` props
- API constants updated based on empirical testing: `MAX_CONCURRENT_REQUESTS` 4→6, `BATCH_COOLDOWN_MS` 250→150, `MIN_REQUEST_GAP_MS` 80→50
- `FEED_BATCH_SIZE` 3→4, `GRID_BATCH_SIZE` 4→6

### Fixed
- ISSUE-001: Infinite re-render loop on artist/tag navigation — `initSearch` had stale `[grid]` dep (new object every render); fixed by depending on `grid.reset`/`grid.pause` instead

### For contributors
- 98 tests across 9 files (+12 tests, +2 new test files: `delay.test.js`, `ArtworkCard.test.jsx`)
- `usePaginatedFetch.test.jsx` (26) and `requestManager.test.js` (29) cover the new shared infrastructure
- `GridBrowseContext.regression-1.test.jsx` — regression guard for ISSUE-001

## [0.0.1] - 2026-03-20

### Fixed
- Infinite scroll in the grid view could fire duplicate concurrent loads — now guarded correctly (brings `GridBrowseContext` in line with `ArtworksContext`)

### For contributors
- 49 tests across 3 files: `ArtworksContext.test.jsx` (21), `GridBrowseContext.test.jsx` (21), and expanded `artworkCache.test.js` (+7 metAPI error paths)
- Added `@testing-library/react` and configured Vitest React plugin to enable JSX context testing
- Fixed stale closure in `GridBrowseContext.loadMore` useCallback deps
