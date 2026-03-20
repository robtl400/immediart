# TODOS

## Extract shared pagination hook
**What:** Create a `usePaginatedFetch` hook that both `ArtworksContext` and `GridBrowseContext` share.
**Why:** ~80-100 lines of near-identical batch/pagination logic duplicated across both contexts. Any bug must be fixed in two places.
**Pros:** Single source of truth, easier to test, DRY.
**Cons:** The two contexts diverge (preloading, search cooldowns, reset logic) — abstraction needs configurable options that add complexity.
**Context:** Refactor, not a bug fix. Duplicated code works correctly. **Priority elevated after performance PR (2026-03-20):** the PR added cache reads/writes, prefetch logic, and a second AbortController to BOTH contexts — the shared code is now ~85% identical. Highest-value targets for extraction: allIDsRef, currentIndexRef, fetchingRef, abortControllerRef, generational ID ref, prefetchControllerRef, batch-slice-and-fetch pattern, cache integration. Best done after the performance PR is stable.
**Depends on:** Performance caching + prefetch PR.

---

## Add context-level test coverage
**What:** Write tests for `loadMore` guard logic, prefetch merge, and delay-skip paths in both `ArtworksContext` and `GridBrowseContext`.
**Why:** Zero coverage on the new prefetch merge path — if the merge logic regresses (e.g., stale data shown, hasMore flipped incorrectly), it's caught only by manual QA.
**Pros:** Catches regressions in the prefetch/cache-skip behavior, documents expected behavior, enables safe future refactors (especially the shared hook above).
**Cons:** Requires mocking IntersectionObserver + React context testing infra. Heavily async code is non-trivial to test accurately.
**Context:** `artworkCache.js` + `metAPI.js` cache integration tests are DONE (18 tests as of performance PR, 2026-03-20). Vitest + fake-indexeddb are already set up. Remaining targets: `loadMore` guard logic, prefetch merge (both contexts), `initSearch` delay-skip on cache hit. The prefetch merge is the highest-value gap — silent failure if merge produces stale data or incorrectly sets `hasMore=false`.
**Depends on:** Performance caching + prefetch PR (done).

---

## (Low) MET API 404s logged in console — ISSUE-003
**What:** Some MET API object IDs return 404 (artwork removed/unavailable). The app handles them gracefully but logs errors to console.
**Why:** External data issue — not a code bug. Could filter or suppress known-bad IDs.
**Found by:** /qa on main, 2026-03-20. Report: .gstack/qa-reports/qa-report-localhost-2026-03-20.md
