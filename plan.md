<!-- /autoplan restore point: /Users/robertlord/.gstack/projects/robtl400-immediart/main-autoplan-restore-20260429-120930.md -->

# Plan: ImmediArt — Portfolio Polish Sweep

**Source:** /office-hours design doc (robertlord-main-design-20260429-115539.md), 2026-04-29
**Goal:** Eliminate small inconsistencies and edge-case rough spots so a recruiter encounters a fully deliberate product.

## Problem Statement

The app is functionally strong and visually distinctive. Three classes of issue identified by code audit:
1. **Transition asymmetry** — the modal has a smooth image crossfade; the feed does not
2. **Edge-case content bugs** — empty descriptions render a trailing period; comment text for non-gallery works can include orphaned fields
3. **Minor behavioral bugs** — `formatArtistUsername` has two edge cases that produce malformed handles; `ArtworkDeepLink` error state uses inline styles inconsistent with the rest of the app

**Audience:** Recruiter/portfolio. They will walk the whole app slowly. They will tap every button, read every label, notice every state.

## Constraints

- Client-only Vite/React app — no backend
- Design language stays: dark/gold, Allura, flying machine, Instagram metaphor
- "Posted: {date}" label is intentional — part of the Instagram metaphor
- No new features — polish only

## Issue Inventory

### TIER 1 — Visible During Normal Scrolling

#### T1-A: Feed image load transition — abrupt snap (feed)

**File:** `src/components/feed/ArtworkCard.jsx` + `src/components/feed/DiscoveryFeed.css`

**Current behavior:** `{!imageLoaded && <div className="image-placeholder" />}` — conditional render removes placeholder instantly on load. Hard pop.

**Fix:**
1. Keep placeholder in DOM unconditionally. Add class toggle on `imageLoaded`:
   ```jsx
   <div className={`image-placeholder${imageLoaded ? ' loaded' : ''}`} />
   ```
2. Add to DiscoveryFeed.css:
   ```css
   .image-placeholder { transition: opacity 0.3s ease; pointer-events: none; z-index: 1; }
   .image-placeholder.loaded { opacity: 0; }
   ```
3. Remove the `{!imageLoaded && ...}` conditional wrapper.

**Note:** Transition is `0.3s` (not 0.35s) to match the `.artwork-image` fade-in at DiscoveryFeed.css:459. Mismatched durations cause a dark flash where the image appears before the placeholder clears. The existing rule at lines 127-135 already sets `position: absolute`, so `z-index: 1` is enough to ensure the placeholder sits above the image during the fade-out.

The existing `.artwork-image[src]:not([src=""])` rule already fades the image in (opacity 0→1). The placeholder was covering that fade. Now it fades out (synchronized at 0.3s) to reveal it — no change to that rule needed.

---

#### T1-B: Empty description renders orphaned period

**File:** `src/components/feed/ArtworkCard.jsx:116`

**Current behavior:** `{artwork.description}.` → renders period even when description is `""`.

**Fix:**
```jsx
{artwork.description && `${artwork.description}.`}
```

---

#### T1-C: @TheMetMuseum comment — non-gallery text cleanup

**File:** `src/utils/transformers.js`, `buildComments()`

**Current behavior:** Concatenates `creditLine` + `rightsAndReproduction` for non-gallery works. Can produce trailing space or `©` artifact.

**Fix:**
```js
const text = artwork.GalleryNumber
  ? `From the ${artwork.department} department — Gallery ${artwork.GalleryNumber}`
  : artwork.creditLine
    ? `From the ${artwork.department} department — ${artwork.creditLine.trim()}.`
    : `From the ${artwork.department} department.`;
```

---

### TIER 2 — Visible on Exploration (Clicking Artists / Tags)

#### T2-A: formatArtistUsername — trailing underscore bug

**File:** `src/utils/transformers.js`

**Current behavior:** Spaces → underscores BEFORE parenthetical removal → trailing underscore. Non-global dash replace.

**Fix:** Reorder — strip parentheticals first. Add post-strip guard for all-parenthetical names like `"(Unknown)"`:
```js
export function formatArtistUsername(artistName) {
  if (!artistName) return '@Unknown_Artist';
  const formatted = artistName
    .replace(/\s*\(.*?\)\s*/g, '')
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, '_')
    .replace(/_+$/, '')
    .replace(/^_+/, '');
  return formatted ? `@${formatted}` : '@Unknown_Artist';
}
```

**Edge case fix:** Without the `formatted ? ... : '@Unknown_Artist'` guard, `"(Unknown)"` → strip → `""` → `@` (empty handle). The post-strip `return formatted ? ... : '@Unknown_Artist'` handles this.

---

#### T2-B: ArtworkDeepLink error AND loading state use inline styles

**File:** `src/components/ArtworkDeepLink.jsx` + new `src/components/ArtworkDeepLink.css`

**Current behavior:** Both error state (lines 30-52) and loading state (lines 63-70) use hardcoded `style={{...}}` with hex colors. Only component in app that does this.

**Fix:** Create `ArtworkDeepLink.css` with scoped classes. Do NOT reuse DiscoveryFeed.css classes directly — global class reuse creates silent coupling where future feed style changes break the deep-link error state.

**ArtworkDeepLink.css:**
```css
.deep-link-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  gap: 16px;
  background-color: var(--color-bg);
  padding: 20px;
  text-align: center;
}

.deep-link-loading {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: var(--color-bg);
}

.deep-link-error-icon {
  width: 64px;
  height: 64px;
  opacity: 0.5;
}

.deep-link-error-title {
  color: var(--color-gold);
  font-weight: 600;
}

.deep-link-error-detail {
  font-size: 14px;
  color: var(--color-text-body);
}

.deep-link-retry-btn {
  background: var(--color-gold);
  color: var(--color-bg);
  border: none;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
}
```

**ArtworkDeepLink.jsx (error state):**
```jsx
<div className="deep-link-error">
  <img src={flyingMachineIcon} alt="" className="deep-link-error-icon" />
  <p className="deep-link-error-title">Artwork not found</p>
  <p className="deep-link-error-detail">{error}</p>
  <button className="deep-link-retry-btn" onClick={() => navigate('/')}>Explore the collection</button>
</div>
```

**ArtworkDeepLink.jsx (loading state):**
```jsx
<div className="deep-link-loading">
  <LoadingSpinner />
</div>
```

---

### TIER 3 — Attention to Detail

#### T3-A: Grid end message lacks flying machine icon

**File:** `src/components/grid/GridBrowse.jsx:127`

**Fix:**
```jsx
<div className="end-message">
  <img src={flyingMachineIcon} alt="" className="end-message-icon" />
  <p>{artworks.length} artwork{artworks.length !== 1 ? 's' : ''} found</p>
</div>
```
Note: `flyingMachineIcon` is already imported at line 3.

---

#### T3-B: Banner missing hover visual feedback

**File:** `src/components/feed/DiscoveryFeed.css`

**Fix:**
```css
.banner:hover {
  opacity: 0.85;
  transition: opacity 0.2s ease;
}

.banner:focus-visible {
  outline: 2px solid var(--color-gold);
  outline-offset: 2px;
}
```

**Note:** `0.85` matches `.thumbnail-card:hover` in GridBrowse.css — the app's hover convention. `0.92` is imperceptible on the dark background and was corrected by design review. `focus-visible` added for keyboard users — if hover gets a state, keyboard should too.

---

#### T3-C: Dead CSS — .search-count class unused

**File:** `src/components/grid/GridBrowse.css` + `GridBrowse.jsx`

**Fix:** Remove `.search-count` rule from GridBrowse.css. Remove unused `totalCount` import/destructure from GridBrowse.jsx.

---

## Tests

### T1-A — ArtworkCard.test.jsx
- `'image placeholder stays in DOM after image load (unconditional render)'`
- `'image placeholder has loaded class after image load'`
- `'image placeholder has no loaded class before image load'`
- `'image is clickable (onImageDoubleClick fires) after image load — placeholder pointer-events:none regression'`
  Note: fireEvent.load(img), then fireEvent.doubleClick(img) — assert onImageDoubleClick called. Catches the invisible-placeholder-eating-clicks bug.

### T1-B — ArtworkCard.test.jsx
- `'description with content renders trailing period'`
- `'empty description renders no trailing period'`

### T1-C — transformers.test.js
- `'buildComments non-gallery with creditLine uses em dash format'` — use `creditLine: 'Purchase, Mr. Fund, 1955'` (not undefined — transformAPIToDisplay coerces to `''`)
- `'buildComments non-gallery without creditLine falls back to department only'` — use `creditLine: ''` (not undefined)
- `'buildComments gallery works renders Gallery number without come-visit-us text'`

### T2-A — transformers.test.js
- `'formatArtistUsername removes parentheticals before lowercasing — no trailing underscore'`
- `'formatArtistUsername handles global dash replace (Toulouse-Lautrec-Someone has all dashes replaced)'`
- `'formatArtistUsername all-parenthetical name returns Unknown_Artist'` — `formatArtistUsername('(Unknown)')` → `'@Unknown_Artist'`
- `'formatArtistUsername multiple parentheticals both removed'` — `formatArtistUsername('Jan van Eyck (Flemish) (attr.)')` → `'@jan_van_eyck'`

### T2-B — No new unit tests (style change; visual regression is manual QA)

### T3-A — GridBrowse.test.jsx
- `'end message includes flying machine icon when results exhausted'`

### T3-B — No new tests (CSS hover state — visual only)

### T3-C — GridBrowse.test.jsx + GridBrowse.jsx
- Remove `totalCount` from GridBrowse.jsx destructure (line 18)
- Update GridBrowse.test.jsx mock (line 48) to remove `totalCount: 0` — keeping it in the mock gives false confidence that it's still consumed

---

## Commit Plan

**Tier 1 (3 commits):**
- `fix(feed): crossfade image placeholder to match modal transition pattern`
- `fix(feed): guard artwork description period against empty string`
- `fix(transformers): clean up @TheMetMuseum comment for non-gallery works`

**Tier 2 (2 commits):**
- `fix(transformers): reorder formatArtistUsername to fix trailing underscore and global dash`
- `fix(deep-link): replace inline styles with CSS classes in error state`

**Tier 3 (1 commit):**
- `fix(grid): add flying machine icon to grid end message; add banner hover state; clean up dead search-count CSS`

---

## NOT in scope
- Skeleton grid cards (SkeletonCard wiring) — feature addition, not polish
- Liked Collection view (/liked route) — captured in TODOS.md
- Touch-intent prefetch (mobile) — captured in TODOS.md

## What already exists
- `.artwork-image[src]:not([src=""])` opacity transition — already fades image in; T1-A works with it
- `.image-container { position: relative }` at DiscoveryFeed.css:110 — T1-A's `position: absolute` placeholder is scoped correctly
- `end-message-icon` class — already defined in DiscoveryFeed.css; T3-A reuses it
- `flyingMachineIcon` import — already in GridBrowse.jsx (line 3); T3-A uses it
- `formatArtistUsername` test coverage — already in transformers.test.js; T2-A extends it
- `error-message`, `error-detail`, `retry-button` classes — exist in DiscoveryFeed.css; T2-B does NOT reuse these (creates own CSS file to avoid coupling)

---

## CEO Review (Phase 1)

### Premises (confirmed)
1. Design language keepers — no redesign ✓
2. "Posted: ca. 1690" intentional — temporal dissonance as feature ✓
3. Goal is deliberateness, not feature-add ✓
4. App is functionally strong — user confirmed ✓

### What Already Exists (sub-problem → existing code)
- T1-A crossfade: `.artwork-image[src]:not([src=""])` already fades image in — fix rides this existing transition
- T1-B period guard: `buildDescription()` exists — guard at render site only
- T1-C comment cleanup: `buildComments()` in transformers.js — in-place rewrite
- T2-A username fix: `formatArtistUsername()` — reorder 3 operations + make dash replace global
- T2-B DeepLink styles: `error-message`, `error-detail`, `retry-button`, `end-message-icon` all in DiscoveryFeed.css
- T3-A grid icon: `flyingMachineIcon` already imported in GridBrowse.jsx (line 3)
- T3-B banner hover: one new CSS rule in existing DiscoveryFeed.css
- T3-C dead CSS: remove one rule from GridBrowse.css + one unused destructure in GridBrowse.jsx

### Dream State Delta
```
CURRENT STATE          → THIS PLAN              → 12-MONTH IDEAL
────────────────────────────────────────────────────────────────────
Image hard pop         Smooth crossfade         WebP + skeleton cards
Empty desc: "."        No trailing period       Shared empty-state util
@handle_               @handle (correct)        Full username test suite
Inline styles          CSS design tokens        Shared ErrorState component
Grid: no icon          Grid matches feed        EndMessage component
No README story        README + screen rec.     Full portfolio narrative
```

### NOT in Scope
- Skeleton grid cards (SkeletonCard wiring) — feature addition, deferred
- Liked collection view (/liked route) — deferred, in TODOS.md
- Touch-intent prefetch — deferred, in TODOS.md
- Lighthouse audit — user confirmed app is solid; defer if performance becomes concern

### Error & Rescue Registry
| Error | Where | Impact | Fix |
|-------|-------|--------|-----|
| z-index stacking during T1-A fade | DiscoveryFeed.css | Placeholder bleeds through image on some browsers | Must add `position: absolute; inset: 0; z-index: 1` to .image-placeholder |
| DiscoveryFeed.css class reuse (T2-B) | ArtworkDeepLink.jsx | Feed style change silently breaks deep-link error UI | Add comment annotating intentional reuse; or create ArtworkDeepLink.css |

### Failure Modes Registry
| Failure | Impact | Detected by |
|---------|--------|------------|
| T1-A: placeholder toggled wrong | Image invisible or double-rendered | Manual scroll test |
| T2-A: regex reorder still wrong | @handle_ persists or new edge case | transformers.test.js |
| T2-B: missing class | Deep-link error shows unstyled elements | Manual deeplink test |
| T3-C: totalCount removal breaks other usage | GridBrowse crashes | Test + TS check |

### CEO Dual Voice Summary
**CLAUDE SUBAGENT:** 6 findings. T1-A z-index gap (medium), "functionally strong" premise hidden (high), commit messaging risk (high), README missing (medium), T2-B coupling (low). The fixes are correct — the plan just needs the z-index spec and a README item added.

**CODEX:** [codex-unavailable]

**User Challenge: README + screen recording**
User accepted: "Add README 'Technical decisions' section as parallel deliverable."

### Added Item: T0 — README Technical Decisions

**File:** `README.md`

**What:** Add a 1-page "Technical decisions" section: why Vite, why MET API, what was hard (dedup logic, abort controllers, IndexedDB cache), what you'd do differently. Optionally link a 30-second Loom screen recording of the feed.

**Why it matters:** Most recruiters receive a GitHub link and never open the live app. This item reaches them even if the app never loads.

**Commit:** `docs(readme): add technical decisions and portfolio context`

---

---

## Design Review (Phase 2)

### Step 0: Design Scope Assessment

**Rating: 6/10 initially → 8/10 after corrections**

What a 10 looks like for this plan: every CSS value justified against the existing design system, all affected states (loading + error) addressed, transitions synchronized, no silent class coupling.

**Gaps found:**
1. T1-A: transition duration mismatch (0.35s vs 0.3s) — corrected
2. T1-A: z-index not specified — corrected (added `z-index: 1`)
3. T2-B: loading state still inline — corrected (create ArtworkDeepLink.css, fix both states)
4. T3-B: opacity 0.92 wrong convention — corrected to 0.85

**No DESIGN.md:** No design system document found. Proceeding with pattern inference from existing CSS.

### Step 0C: Existing Design Leverage
- Transition durations in use: 0.3s (image fade), 0.4s (banner transitions), 0.6s (banner title)
- Hover conventions: `opacity: 0.85` (thumbnail cards), `transform: scale(1.05)` (retry button)
- Centralized error layout: other error states use flexbox column, `min-height: 100vh`
- `var(--color-bg)`, `var(--color-gold)`, `var(--color-text-body)` — all CSS custom properties

### Design Litmus Scorecard (7 passes)

| Pass | Score | Finding | Decision |
|------|-------|---------|---------|
| 1. Information hierarchy | 7/10 | T1-A improves it; T3-B needed calibration | ✓ Fixed |
| 2. Interaction states | 5/10 | T2-B loading state unaddressed; T1-A z-index gap | ✓ Fixed |
| 3. Transition consistency | 4/10 | 0.35s vs 0.3s mismatch causes dark flash | ✓ Fixed (now 0.3s) |
| 4. Design system alignment | 6/10 | T3-B used wrong opacity; T2-B needed own CSS file | ✓ Fixed |
| 5. Edge case coverage | 7/10 | Empty description and @handle fixes are complete | No issues |
| 6. Accessibility | 7/10 | Banner hover is opacity-only — keyboard users need focus:visible | TASTE (see below) |
| 7. Visual consistency | 8/10 | Grid end matches feed after T3-A; DeepLink matches app after T2-B | ✓ |

**TASTE DECISION T — Banner keyboard focus state**
The plan adds `.banner:hover` but not `.banner:focus-visible`. The banner is clickable (cursor: pointer) but keyboard users won't get any visual feedback. Adding `.banner:focus-visible { outline: 2px solid var(--color-gold); outline-offset: 2px; }` is a 1-line addition that rounds out the fix.
→ Auto-decided: INCLUDE (P1 completeness — if hover gets a state, keyboard should too).

### Design Dual Voice Summary
**CLAUDE SUBAGENT:** 5 design findings. Transition mismatch, z-index gap, loading state unaddressed, wrong opacity value, CSS scoping risk. All corrected in plan.
**CODEX:** [codex-unavailable]

---

## Eng Review (Phase 3)

### Step 0: Scope Challenge

**Files touched:** 6 (ArtworkCard.jsx, DiscoveryFeed.css, transformers.js, ArtworkDeepLink.jsx, GridBrowse.jsx, GridBrowse.css) + 1 new file (ArtworkDeepLink.css) = 7 total. Under the 8-file threshold.

**Existing code that already solves sub-problems:**
- T1-A: `.image-container { position: relative }` + `.image-placeholder { position: absolute }` already set up the stacking context — just need the CSS class toggle and transition
- T2-A: `formatArtistUsername` exists — reorder 3 operations, no new function
- T2-B: LoadingSpinner already imported in ArtworkDeepLink.jsx — loading state fix is trivial
- T3-C: `totalCount` is destructured but zero JSX uses it — single-line removal

### Architecture ASCII Diagram

```
DiscoveryFeed.jsx
  └── ArtworkCard.jsx             [T1-A: placeholder CSS toggle, T1-B: description guard]
        └── DiscoveryFeed.css     [T1-A: .image-placeholder.loaded transition]

transformers.js                   [T1-C: buildComments, T2-A: formatArtistUsername]
  └── (called by transformAPIToDisplay → all card rendering)

ArtworkDeepLink.jsx               [T2-B: error + loading state inline → CSS classes]
  └── ArtworkDeepLink.css [NEW]   [T2-B: scoped classes, no DiscoveryFeed coupling]

GridBrowse.jsx                    [T3-A: add icon to end-message, T3-C: remove totalCount]
  └── GridBrowse.css              [T3-C: remove .search-count rule]
  └── DiscoveryFeed.css           [T3-B: add .banner:hover + .banner:focus-visible]

All changes: NO new data flows, NO new API calls, NO new state, NO new context.
Pure CSS/JSX transformations. Zero performance impact.
```

### Section 1: Architecture

No architectural concerns. All 7 changes are localized within individual files. No new coupling introduced. T2-B correctly creates a scoped CSS file rather than reusing global DiscoveryFeed.css classes.

**Verified:** `.image-container { position: relative }` at DiscoveryFeed.css:110 — T1-A's placeholder will not escape card boundary.

**Verified:** `totalCount` destructured at GridBrowse.jsx:18 but used in zero JSX renders — T3-C removal is safe.

### Section 2: Code Quality

**[P2] (confidence: 9/10) transformers.js:10 — formatArtistUsername all-parenthetical name → empty handle**
Input `"(Unknown)"` → strip → `""` → `.toLowerCase()` → `""` → `@` (empty).
Fix: add `formatted ? @${formatted} : '@Unknown_Artist'` guard. Added to plan.

**[P3] (confidence: 7/10) ArtworkCard.jsx:116 — whitespace-only description renders orphaned period**
`buildDescription()` uses `filter(Boolean)` — `"   "` (whitespace) is truthy. MET API unlikely to return whitespace-only strings, but technically possible.
Auto-decided: LOW PRIORITY. Fix is `{artwork.description?.trim() && ...}` but risk is near-zero in practice. Added as low-confidence note; not required.

**[P2] (confidence: 9/10) plan.md — contradictory "What already exists" statement for T2-B**
"T2-B reuses three classes from DiscoveryFeed.css" and "T2-B creates own CSS file" both appeared. Fixed in plan.

### Section 3: Test Review

**Coverage Diagram:**
```
CODE PATHS                                       STATUS        USER FLOWS
[+] ArtworkCard.jsx
  ├── image placeholder
  │   ├── stays in DOM unconditionally           [GAP]         Placeholder fade visible on slow image
  │   ├── loads class toggle → .loaded           [GAP]         Image click after load works (pointer-events)
  │   └── no loaded class before load            [GAP]
  └── description guard
      ├── has description → "text."              [GAP]
      └── empty description → no period          [GAP]

[+] transformers.js / formatArtistUsername
  ├── null/undefined → @Unknown_Artist           [★★★ TESTED]  ArtworkCard.regression-1.test.jsx
  ├── "Vincent van Gogh (Dutch)" → no trailing _ [GAP]
  ├── "Toulouse-Lautrec-Someone" → global dashes [GAP]
  ├── "(Unknown)" → @Unknown_Artist              [GAP] ← NEW
  └── "Jan van Eyck (Flemish) (attr.)" → clean   [GAP] ← NEW

[+] transformers.js / buildComments
  ├── no department → []                         [★★ TESTED]
  ├── gallery → em dash format                   [GAP]
  ├── non-gallery with creditLine                [GAP]
  └── non-gallery without creditLine             [GAP]

[+] GridBrowse.jsx / end-message
  ├── artworks found → count rendered            [★★★ TESTED] GridBrowse.test.jsx:63
  ├── end message icon → flying machine          [GAP]
  └── empty state icon                           [★★★ TESTED] GridBrowse.test.jsx:87

[+] ArtworkDeepLink.jsx (no new behavior — style only)
  └── no unit tests required

COVERAGE: 4/15 paths tested pre-fix (27%) → 15/15 with plan tests (100%)
QUALITY: ★★★:3 ★★:0 ★:0 | GAPS: 11
```

### Section 4: Performance

No performance concerns. All changes are CSS class toggles, string operations, and JSX conditionals. Zero network calls, zero state changes, zero re-renders triggered by these changes.

### NOT in scope (confirmed)
- Skeleton grid cards — feature addition
- Liked collection — captured in TODOS.md
- Touch-intent prefetch — captured in TODOS.md
- T3-C: test mock cleanup in GridBrowse.test.jsx — added to plan as required

### Failure Modes Registry (Eng additions)
| Failure | Impact | Fix |
|---------|--------|-----|
| T1-A: `pointer-events: none` missed | Invisible placeholder blocks image clicks | Test: doubleClick after load |
| T2-A: all-parenthetical name | `@` empty handle renders | Post-strip guard added to plan |
| T2-B: ArtworkDeepLink.css not imported | Both states revert to unstyled | Implementer must add `import './ArtworkDeepLink.css'` |
| T3-C: totalCount removed from destructure but mock not updated | False test confidence | Update GridBrowse.test.jsx mock |

### Eng Dual Voice Summary
**CLAUDE SUBAGENT:** 5 findings. T2-A edge case (empty handle), T1-B whitespace edge (low risk), T1-A click-through regression, T1-C test shape, T3-C mock cleanup. All incorporated.
**CODEX:** [codex-unavailable]

## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|----------------|-----------|-----------|---------|
| 1 | CEO | Implement tier-by-tier atomic commits | Mechanical | P5 | Clear diffs, easy bisect | Omnibus commit |
| 2 | CEO | Accept T1-A crossfade fix | Mechanical | P1 | Bug is real, fix is correct | Keep conditional render |
| 3 | CEO | Add z-index spec to T1-A | Mechanical | P1 | CEO subagent flagged stacking risk | Leave z-index unspecified |
| 4 | CEO | Add comment to T2-B class reuse | Mechanical | P5 | Explicit intent prevents confusion | Create new CSS file |
| 5 | CEO | Add README item (user confirmed) | User decision | — | User chose to accept this expansion | Skip README |
| 6 | Design | Fix T1-A transition to 0.3s (from 0.35s) | Mechanical | P5 | Matches image fade-in; eliminates dark flash | Keep 0.35s |
| 7 | Design | Add z-index: 1 to .image-placeholder | Mechanical | P1 | Ensures placeholder sits above image during fade | Leave unspecified |
| 8 | Design | Fix T2-B to create ArtworkDeepLink.css (not reuse DiscoveryFeed classes) | Mechanical | P5 | Scoped classes prevent silent coupling | Comment annotation only |
| 9 | Design | Fix T2-B loading state inline styles too (not just error state) | Mechanical | P1 | Half-done refactor leaves loading path inconsistent | Skip loading state |
| 10 | Design | Change T3-B opacity from 0.92 to 0.85 | Mechanical | P5 | Matches app convention (thumbnail-card:hover) | Keep 0.92 |
| 11 | Design | Add .banner:focus-visible keyboard state | Mechanical | P1 | If hover gets state, keyboard should too | Skip focus state |
| 12 | Eng | Add T2-A all-parenthetical guard | Mechanical | P1 | "(Unknown)" produces empty @handle without it | Skip edge case |
| 13 | Eng | Add T1-A click-through test (pointer-events) | Mechanical | P1 | Invisible placeholder blocking clicks is high-risk regression | Skip test |
| 14 | Eng | Update T1-C tests to use creditLine: '' not undefined | Mechanical | P5 | Tests should match transformed data shape | Use undefined |
| 15 | Eng | Update T3-C: remove totalCount from test mock too | Mechanical | P5 | Mock keeping unused field gives false confidence | Leave mock |
| 16 | Eng | Add T2-A multi-parenthetical and all-parenthetical tests | Mechanical | P1 | Edge cases newly added to fix need coverage | Skip tests |

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/autoplan` | Scope & strategy | 1 | CLEAR | 6 findings: README added, T1-A z-index, T2-B coupling. All resolved. |
| Design Review | `/autoplan` | UI/UX gaps | 1 | CLEAR | 5 findings: transition timing, loading state, opacity convention, focus state. All resolved. |
| Eng Review | `/autoplan` | Architecture & tests | 1 | CLEAR | 5 findings: T2-A edge case, T1-A regression test, T1-C test shape, T3-C mock, T2-B scope. All resolved. |
| DX Review | `/autoplan` | Developer experience | 0 | SKIPPED | No developer-facing scope detected. |

**AUTOPLAN VERDICT: APPROVED** — 16 decisions logged, 15 auto-decided, 1 user decision (README item). Plan is complete.
**Outside voice:** [subagent-only] — Codex unavailable; Claude subagent ran for CEO, Design, and Eng phases.
