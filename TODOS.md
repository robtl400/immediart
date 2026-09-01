# TODOS

## (Low) web-large image URL monitoring — Met CDN dependency
**What:** C6's carousel substitutes `/web-large/` into `additionalImages` URLs — an undocumented Met CDN convention (same risk class as the objectName filter). If Met restructures image paths, slides silently fall back to multi-MB originals via the onError path.
**Why:** the fallback hides breakage — the feature degrades to huge downloads without erroring. A periodic check (or a counter on fallback hits logged to console) would surface it.
**Found by:** /plan-eng-review outside voice, 2026-07-06 (D10 decision). Depends on: C6 shipping.

## (Low) Scroll-anchor hardening: iOS snap behavior — review 2026-07-06
**What:** `feed.scrollTop += delta` on a `scroll-snap-type: y mandatory` container needs real-device iOS testing — programmatic scrollTop during momentum may be ignored or kill the fling.
**Fix sketch:** device QA pass (or `/ios-qa`-style manual check) for the snap interaction.
**Found by:** /review adversarial + red team, 2026-07-06.

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

