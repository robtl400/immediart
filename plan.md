1. Add initialBatchSize to the grid (easiest, highest impact)

The feed already uses this — it fetches 2 artworks first so something appears immediately, then loads the rest. The grid skips this and waits for all 6 (GRID_BATCH_SIZE) before showing anything.

Changes:
- Add `GRID_INITIAL_BATCH_SIZE = 2` to constants.js (after GRID_BATCH_SIZE)
- Wire it in GridBrowseContext.jsx:

const grid = usePaginatedFetch({
  shuffleIDs: false,
  batchSize: GRID_BATCH_SIZE,
  initialBatchSize: GRID_INITIAL_BATCH_SIZE,   // ← add this
  maxInMemory: Infinity,
  ...
});

The usePaginatedFetch hook already supports it — it's just not wired up for the grid.
The tradeoff is a brief layout shift as the remaining 4 load in, but the user sees artworks ~2x faster.

2. Prefetch IDs on hover/intent

searchByArtist and searchByTag already cache results in IndexedDB. The NAVIGATION_DELAY_MS (150ms) and SEARCH_COOLDOWN_MS (300ms) delays in GridBrowseContext.jsx:54-63 are only applied on a cache miss. So if the IDs are already cached when the user clicks, the delay is completely skipped.

The idea: call searchByArtist(name) or searchByTag(term) silently on hover/focus of the artist chip or hashtag link, before the user clicks. By the time they navigate, the ID list is in IndexedDB and the first grid batch starts immediately. This is the most impactful option for common navigation patterns, but requires adding hover handlers to wherever those links are rendered.

Architecture (decided):
- Add `onArtistHover` and `onTagHover` props to ArtworkCard.jsx (consistent with onArtistClick/onTagClick)
- Handle in DiscoveryFeed.jsx — call searchByArtist/searchByTag fire-and-forget with .catch(() => {})
- Add `debounce()` utility to delay.js (no new dep), 4-line implementation
- Debounce hover handlers at 150ms to prevent rapid scroll sweeps from queuing concurrent network calls

ArtworkCard changes:
- Add `onMouseEnter={() => onArtistHover?.(artwork.artistName)}` and `onFocus` to artist chip span
- Add `onMouseEnter={() => onTagHover?.(tag)}` and `onFocus` to hashtag spans
- Guard: skip onArtistHover if !artwork.artistName (anonymous works)

DiscoveryFeed changes:
- Import searchByArtist, searchByTag from metAPI
- Add handleArtistHover = debounce((name) => searchByArtist(name).catch(() => {}), 150)
- Add handleTagHover = debounce((tag) => searchByTag(tag).catch(() => {}), 150)
- Pass as onArtistHover/onTagHover props to ArtworkCard

Known limitation: prefetch only helps hovers >150ms before click. Quick taps (<150ms debounce window) land with cold cache and normal delays. Mobile touch devices see no benefit from mouseenter — covered by the touch-intent prefetch TODO.

## Tests

### Feature 1 — GridBrowseContext.test.jsx
- `'initial batch uses GRID_INITIAL_BATCH_SIZE (2) not GRID_BATCH_SIZE (6)'`

### Feature 2 — ArtworkCard.test.jsx
- `'calls onArtistHover on mouseenter when artist exists'`
- `'calls onTagHover on mouseenter'`
- `'does not call onArtistHover for anonymous artwork'`
- `'onArtistClick still fires on click — regression guard'`

### Feature 2 — DiscoveryFeed.test.jsx
- `'hover fires searchByArtist after 150ms debounce'` (vi.useFakeTimers; spy metAPI module, not requestManager.fetch)
- `'hover fires searchByTag after 150ms debounce'`

## NOT in scope
- Viewport-based (IntersectionObserver) prefetch for mobile — captured in TODOS.md as touch-intent prefetch
- Prefetch on ThumbnailCard grid (different navigation flow)
- Image cache warming on hover (separate HEAD requests — too expensive)
- Quick-tap (<150ms) prefetch benefit — acknowledged limitation of debounced approach

## What already exists
- `usePaginatedFetch.initialBatchSize` — already implemented, just not wired in GridBrowseContext
- `FEED_INITIAL_BATCH_SIZE = 2` — existing constant; new GRID_INITIAL_BATCH_SIZE follows same pattern
- `onArtistClick`/`onTagClick` prop pattern in ArtworkCard — onArtistHover/onTagHover mirror this
- `searchByArtist`/`searchByTag` — already cache in IndexedDB; prefetch is free after first call
- `delay.js` — will house the new debounce() utility alongside existing delay/jitter utils

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 7 test gaps fixed, 1 TODO added |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**OUTSIDE VOICE:** Claude subagent — raised mobile-first concern (hover desktop-only), debounce race on fast clicks. User accepted both points; hover prefetch proceeds for desktop, touch-intent captured in TODOS.md.

**VERDICT:** ENG CLEARED — ready to implement.
