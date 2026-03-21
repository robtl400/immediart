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
