# Changelog

All notable changes to this project will be documented in this file.

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
- `scripts/testAPILimits.js` — empirical MET API throttle probe used to tune constants (dev tool, not shipped)
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
