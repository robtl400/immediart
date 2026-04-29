# TODOS

## ~~Extract shared pagination hook~~ DONE (2026-03-20)
`usePaginatedFetch` extracted. Both `ArtworksContext` and `GridBrowseContext` are now thin wrappers. Tests passing.

---

## ~~Add context-level test coverage~~ DONE (2026-03-20)
28 tests added across `ArtworksContext.test.jsx`, `GridBrowseContext.test.jsx`, and expanded `artworkCache.test.js`. Covers: guard logic, prefetch merge, delay-skip on cache hit, MAX trim, abort behavior, metAPI 403 retry/AbortError/network error paths. Also fixed `GridBrowseContext.loadMore` missing `loadingMore` guard (brought in line with `ArtworksContext`).

---

## ~~ISSUE-001: Infinite re-render loop on artist/tag navigation~~ FIXED (2026-03-20)
Fixed by /qa on feat/architecture-revamp. Root cause: `initSearch` depended on `[grid]` (new object every render). Fix: depend on `grid.reset` / `grid.pause`. Regression test added.

---

## (Low) MET API 404s logged in console — ISSUE-003
**What:** Some MET API object IDs return 404 (artwork removed/unavailable). The app handles them gracefully but logs errors to console.
**Why:** External data issue — not a code bug. Could filter or suppress known-bad IDs.
**Found by:** /qa on main, 2026-03-20. Report: .gstack/qa-reports/qa-report-localhost-2026-03-20.md

---

## (Medium) Liked Collection view — /liked route
**What:** Add a `/liked` route that shows the user's liked artworks as a GridBrowse-style grid, loaded from localStorage.
**Why:** Likes are now persisted to localStorage (Pass 3, /plan-design-review 2026-03-21). Once likes survive navigation and page reloads, users will naturally expect to be able to view their liked collection. Without a destination, persisted likes become invisible data.
**Pros:** Completes the like feature loop; gives users a reason to like more artworks; uses existing `ThumbnailCard` + `ArtworkModal` infrastructure.
**Cons:** Requires a new route, new context or hook to load artworks by ID from localStorage, and a link to the route from the feed (e.g., a likes counter in the banner or action bar).
**Context:** Artworks are cached in IndexedDB for 7 days — liked artwork data will be available without re-fetching for most use cases.
**Depends on:** Likes persistence implementation (localStorage liked IDs).
**Found by:** /plan-design-review, 2026-03-21.

---

## (Low) Image resolution filtering in validateArtwork
**What:** Add minimum image dimension check to validateArtwork() — filter artworks whose primaryImage URL resolves to below a threshold (e.g., 1000px). Directly addresses the "photographs poorly" complaint for low-resolution scans.
**Why:** CEO review noted that objectName filtering solves object type mismatch but not image quality for low-res paintings. Some paintings in the MET collection have small or low-quality scans.
**Cons:** Requires fetching image dimensions (separate HEAD request per artwork or URL parsing — additional latency). Outside blast radius of the painting filter plan.
**Found by:** /autoplan, 2026-04-27.

---

## (Low) objectName variant monitoring — MET API dependency
**What:** The objectName.startsWith('painting') filter depends on MET curators using 'Painting' as the objectName. If MET normalizes to variants like 'Oil painting', 'Panel painting', or lowercase forms, the filter silently narrows. Consider adding a periodic check or a more robust match strategy.
**Why:** MET API has no published SLA on objectName stability. The current filter uses .toLowerCase().startsWith('painting') (case-insensitive) which handles some variants, but novel prefix patterns would still break it.
**Found by:** /autoplan CEO + Eng review, 2026-04-27.

---

## (Low) Touch-intent prefetch for artist/tag navigation
**What:** Hover prefetch (desktop) only fires on mouseenter — mobile touch devices get no benefit. An IntersectionObserver-based approach would prefetch artist/tag IDs as feed cards scroll into the viewport, warming the IndexedDB cache before the user taps.
**Why:** Mobile is the dominant interaction model for a vertical scroll feed. Touch-navigation currently always pays the full NAVIGATION_DELAY_MS (150ms) + SEARCH_COOLDOWN_MS (300ms) on cache miss. Viewport prefetch eliminates this for visible cards.
**Approach:** Add an IntersectionObserver in ArtworkCard or DiscoveryFeed that fires searchByArtist/searchByTag when a card enters the viewport. More aggressive than hover (fires for all visible cards) but platform-agnostic.
**Cons:** Potentially more background requests than hover during fast scrolling — may need per-card rate limiting or a shared prefetch queue.
**Depends on:** Hover prefetch plan shipped first (establishes onArtistHover/onTagHover prop pattern).
**Found by:** /plan-eng-review outside voice, 2026-04-29.

---

## ~~(Low) Pre-existing: GridBrowse.test.jsx result count tests broken~~ DONE (2026-04-29)
Tests updated to match actual component behavior (`artworks.length` + " found" suffix).
Added `makeMockArtwork` helper; tests now provide real artwork arrays with `hasMore: false`.
