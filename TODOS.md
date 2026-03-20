# TODOS

## Extract shared pagination hook
**What:** Create a `usePaginatedFetch` hook that both `ArtworksContext` and `GridBrowseContext` share.
**Why:** ~80-100 lines of near-identical batch/pagination logic duplicated across both contexts. Any bug must be fixed in two places.
**Pros:** Single source of truth, easier to test, DRY.
**Cons:** The two contexts diverge (preloading, search cooldowns, reset logic) — abstraction needs configurable options that add complexity.
**Context:** Refactor, not a bug fix. Duplicated code works correctly. **Priority elevated after performance PR (2026-03-20):** the PR added cache reads/writes, prefetch logic, and a second AbortController to BOTH contexts — the shared code is now ~85% identical. Highest-value targets for extraction: allIDsRef, currentIndexRef, fetchingRef, abortControllerRef, generational ID ref, prefetchControllerRef, batch-slice-and-fetch pattern, cache integration.
**Depends on:** ~~Performance caching + prefetch PR~~ DONE. Context test coverage merged (2026-03-20) — safety net now in place. Ready to extract.

---

## ~~Add context-level test coverage~~ DONE (2026-03-20)
28 tests added across `ArtworksContext.test.jsx`, `GridBrowseContext.test.jsx`, and expanded `artworkCache.test.js`. Covers: guard logic, prefetch merge, delay-skip on cache hit, MAX trim, abort behavior, metAPI 403 retry/AbortError/network error paths. Also fixed `GridBrowseContext.loadMore` missing `loadingMore` guard (brought in line with `ArtworksContext`).

---

## (Low) MET API 404s logged in console — ISSUE-003
**What:** Some MET API object IDs return 404 (artwork removed/unavailable). The app handles them gracefully but logs errors to console.
**Why:** External data issue — not a code bug. Could filter or suppress known-bad IDs.
**Found by:** /qa on main, 2026-03-20. Report: .gstack/qa-reports/qa-report-localhost-2026-03-20.md
