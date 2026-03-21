# ImmediArt — Design Review Implementation Plan

Generated: 2026-03-21 | Source: /plan-design-review (14 decisions) + /plan-eng-review handoff
Branch: main | Status: **NOT YET IMPLEMENTED** — all 15 tasks pending

This document is a complete, self-contained implementation guide for Claude Code.
Read the whole file before starting. Implement tasks in the order listed (dependencies noted).
Commit each task atomically with a clear message.

---

## Context

The app is a React 19 + Vite art discovery app (Instagram-style feed of MET Museum artworks).
Key files:
- `src/index.css` — global styles, dark theme
- `src/components/feed/DiscoveryFeed.jsx` + `DiscoveryFeed.css` — main feed
- `src/components/feed/ArtworkCard.jsx` — individual feed card
- `src/components/grid/GridBrowse.jsx` + `GridBrowse.css` — artist/tag search results grid
- `src/components/grid/ThumbnailCard.jsx` — individual grid thumbnail
- `src/components/modal/ArtworkModal.jsx` + `ArtworkModal.css` — artwork detail overlay
- `src/components/common/` — Banner, LoadingSpinner, SkeletonCard
- `src/context/GridBrowseContext.jsx` — exposes `totalCount`, `initSearch`, `searchType`, `searchTerm`
- `src/context/ArtworkModalContext.jsx` — exposes `openModal`, `closeModal`
- `src/services/metAPI.js` — exports `fetchArtworkByID`
- `src/utils/transformers.js` — exports `transformAPIToDisplay`
- `src/App.jsx` — routes: `/`, `/artist/:artistName`, `/tag/:tagName`
- `index.html` — viewport meta

Design system (de facto):
- Background: `#121212` (primary), `#1a1a1a` (surface), `#3B3B3B` (modal card)
- Gold: `#F0B900` (brand), `#A37D00` (muted)
- Text: `#ffffff` (primary), `#e0e0e0` (body), `#b0b0b0` (secondary), `#888` (muted)
- Font: system-ui stack (body), 'Allura' cursive (brand — banner + grid heading only)
- Touch targets: 44px minimum
- Brand asset: `src/assets/FlyingMachine2_tinted_gold.png` (used in Banner, LoadingSpinner, placeholders)

---

## Task 1 — CSS Custom Properties

**Files:** `src/index.css`, `src/components/feed/DiscoveryFeed.css`, `src/components/grid/GridBrowse.css`, `src/components/modal/ArtworkModal.css`, `src/components/common/SkeletonCard.css`, `src/components/common/LoadingSpinner.css`

**What:** Add CSS variables to `:root` in `index.css`. Replace ALL hardcoded color values in all 6 CSS files with these variables.

**Variables to add to `:root` in `src/index.css`:**

```css
:root {
  --color-bg:           #121212;
  --color-surface:      #1a1a1a;
  --color-modal:        #3B3B3B;
  --color-gold:         #F0B900;
  --color-gold-muted:   #A37D00;
  --color-text:         #ffffff;
  --color-text-body:    #e0e0e0;
  --color-text-secondary: #b0b0b0;
  --color-text-muted:   #888888;
}
```

**Replacement map** (find → replace-with):
- `#121212` → `var(--color-bg)`
- `#1a1a1a` → `var(--color-surface)`
- `#3B3B3B` → `var(--color-modal)`
- `#F0B900` → `var(--color-gold)`
- `#A37D00` → `var(--color-gold-muted)`
- `#ffffff` and `#fff` → `var(--color-text)` (only when used as a text/foreground color, NOT in gradients)
- `#e0e0e0` → `var(--color-text-body)`
- `#b0b0b0` → `var(--color-text-secondary)`
- `#888` and `#888888` → `var(--color-text-muted)`

**Exceptions — do NOT replace:**
- `rgba(201, 162, 39, 0.07)` in SkeletonCard.css shimmer gradient — leave as-is (computed from gold, not a token)
- `rgba(163, 125, 0, ...)` in DiscoveryFeed.css banner gradient — leave as-is
- `rgba(0, 0, 0, ...)` black overlays/shadows — not tokens

**Commit:** `refactor: add CSS custom properties and replace hardcoded color values`

**Tests:** None needed (visual refactor — run the app and verify it looks identical).

---

## Task 2 — Create DESIGN.md

**Files:** `DESIGN.md` (new file in project root)

**What:** Create a design system reference document.

```markdown
# ImmediArt Design System

## Brand Identity
ImmediArt is an Instagram-style art discovery app for The Metropolitan Museum of Art's
public domain collection. The visual language is dark luxury — a gallery in your pocket.

## Color Tokens

| Token              | Value     | Usage                                      |
|--------------------|-----------|--------------------------------------------|
| --color-bg         | #121212   | Primary background, all screens            |
| --color-surface    | #1a1a1a   | Secondary surfaces, image placeholders     |
| --color-modal      | #3B3B3B   | Modal card background                      |
| --color-gold       | #F0B900   | Brand accent: logo, CTAs, active states    |
| --color-gold-muted | #A37D00   | Secondary gold: dates, dividers, dots      |
| --color-text       | #ffffff   | Primary text, labels                       |
| --color-text-body  | #e0e0e0   | Body text, artwork descriptions            |
| --color-text-secondary | #b0b0b0 | Comment text                             |
| --color-text-muted | #888888   | Placeholder text, empty/end states        |

## Typography

| Use           | Font              | Size       | Weight | Notes                  |
|---------------|-------------------|------------|--------|------------------------|
| Brand / Logo  | Allura (cursive)  | 2.5rem     | 400    | Banner title only      |
| Grid heading  | Allura (cursive)  | 2.25rem    | 400    | @artist / #tag display |
| Body          | system-ui stack   | 14px       | 400    | Descriptions, metadata |
| Artist name   | system-ui stack   | 14px       | 700    | Bold in feed cards     |
| Button label  | system-ui stack   | 14px       | 500    |                        |

Font loading: Google Fonts (Allura), preconnect in index.html.

## Layout

- **Mobile-first.** All screens designed for 375px–430px viewport width.
- **Desktop phone frame:** On screens ≥ 481px, app renders as a centered phone container
  (max-width: 430px, border-radius: 40px, dark outer background: #0a0a0a).
- **Feed:** Full-viewport scroll-snap cards. Each card height = 100vh.
- **Grid:** 2-column thumbnail grid with 2px gutters.
- **Modal:** Full-screen overlay (z-index: 1000), card with max-height: calc(100vh - 100px).

## Spacing Scale
No formal scale — use 4px multiples: 4, 8, 12, 16, 20, 24, 30, 40.
Horizontal padding: 15px (mobile), 20px (≥ 414px).

## Touch Targets
Minimum 44×44px on all interactive elements.

## Motion
- Hover/active state transitions: `0.2s ease`
- Banner collapse: `0.4s ease`
- Like heart pop: `0.3s ease`
- Image fade-in: `0.3s ease`
- Modal open: no animation (instant)
- Hint overlay fade: `0.5s ease` out after 3s

## Brand Asset
`FlyingMachine2_tinted_gold.png` — used in:
- Banner logo (left of title)
- Share button icon
- Image placeholder animation (diagonal sweep)
- Loading spinner (sweep across full-screen)
- Empty state icon

## Component States (required for every interactive component)
| State    | Behavior                                         |
|----------|--------------------------------------------------|
| Loading  | Skeleton shimmer cards (feed) or grid placeholders |
| Empty    | Flying machine + warm message + CTA              |
| Error    | Gold error message + Retry button                |
| Success  | Content renders                                  |
| End      | Flying machine + warm completion message         |

## Accessibility
- Color contrast: all text/background pairs meet WCAG AA (4.5:1 minimum)
- Touch targets: 44px minimum
- Keyboard nav: all interactive elements have tabIndex + onKeyDown Enter handler
- Focus ring: `outline: 2px solid var(--color-gold)` on focus
- Modals: role="dialog", aria-modal="true", focus trap while open
- Images: descriptive alt text (empty alt only for purely decorative images)
```

**Commit:** `docs: add DESIGN.md design system reference`

---

## Task 3 — Remove user-scalable=no (WCAG 1.4.4)

**File:** `index.html`

**What:** Remove `maximum-scale=1.0, user-scalable=no` from the viewport meta tag.

**Change:**
```html
<!-- BEFORE -->
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />

<!-- AFTER -->
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
```

**Commit:** `fix(a11y): remove user-scalable=no — fixes WCAG 1.4.4 (Resize Text)`

---

## Task 4 — GridBrowse Result Count in Heading

**File:** `src/components/grid/GridBrowse.jsx`

**What:** `totalCount` is already exposed by `GridBrowseContext`. Display it in the search heading after the display term.

**What to change in GridBrowse.jsx:**
1. Destructure `totalCount` from `useGridBrowse()` (it's already in the context value).
2. Update the heading JSX inside the `Header` component:

```jsx
// BEFORE
const Header = () => (
  <>
    <Banner />
    <div className="search-heading">
      <h2 className="search-term">{displayTerm}</h2>
    </div>
  </>
);

// AFTER
const Header = () => (
  <>
    <Banner />
    <div className="search-heading">
      <h2 className="search-term">{displayTerm}</h2>
      {totalCount > 0 && (
        <p className="search-count">{totalCount} artwork{totalCount !== 1 ? 's' : ''}</p>
      )}
    </div>
  </>
);
```

3. Add to `GridBrowse.css`:
```css
.search-count {
  color: var(--color-text-muted);
  font-size: 13px;
  text-align: center;
  margin: 0;
  padding-bottom: 8px;
}
```

**Note:** `totalCount` is set to 0 by `initSearch` at the start of each search and updated when IDs return. While `totalCount === 0` during loading, the count is simply hidden — this is correct behavior.

**Commit:** `feat(grid): show total result count in search heading`

---

## Task 5 — GridBrowse Empty State (Warm)

**Files:** `src/components/grid/GridBrowse.jsx`, `src/components/grid/GridBrowse.css`

**What:** Replace the cold `<p>No artworks found</p>` with a warm message using the flying machine icon and a CTA back to home.

**In GridBrowse.jsx:**
1. Import the flying machine asset: `import flyingMachineIcon from '../../assets/FlyingMachine2_tinted_gold.png';`
2. Import `useNavigate` (it may already be imported — check).
   - If not imported, add: `import { useParams, useNavigate } from 'react-router-dom';`
   - Add: `const navigate = useNavigate();` inside the component.
3. Replace the empty state block:

```jsx
// BEFORE
if (artworks.length === 0) {
  return (
    <div className="grid-browse" ref={gridRef}>
      <Header />
      <div className="empty-state">
        <p>No artworks found</p>
      </div>
    </div>
  );
}

// AFTER
if (artworks.length === 0) {
  return (
    <div className="grid-browse" ref={gridRef}>
      <Header />
      <div className="empty-state">
        <img src={flyingMachineIcon} alt="" className="empty-state-icon" />
        <p className="empty-state-message">No artworks found for this search.</p>
        <button className="empty-state-cta" onClick={() => navigate('/')}>
          Explore the collection
        </button>
      </div>
    </div>
  );
}
```

4. Add to `GridBrowse.css`:
```css
.empty-state-icon {
  width: 64px;
  height: 64px;
  opacity: 0.7;
  margin-bottom: 16px;
}

.empty-state-message {
  color: var(--color-text-muted);
  font-size: 15px;
  margin: 0 0 20px 0;
}

.empty-state-cta {
  background: none;
  border: 1px solid var(--color-gold);
  color: var(--color-gold);
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s ease, color 0.2s ease;
}

.empty-state-cta:hover {
  background-color: var(--color-gold);
  color: var(--color-bg);
}

.empty-state-cta:active {
  opacity: 0.8;
}
```

**Note:** Remove the existing `.empty-state p` rule from `GridBrowse.css` (it targets all `<p>` in `.empty-state` with generic gray styling).

**Commit:** `feat(grid): warm empty state with flying machine icon and home CTA`

---

## Task 6 — GridBrowse Error State: Add Retry Button

**Files:** `src/components/grid/GridBrowse.jsx`, `src/components/grid/GridBrowse.css`

**What:** The GridBrowse error state has no retry button. Add one that calls `initSearch` again.

**In GridBrowse.jsx:**
1. The component already has access to `initSearch` from `useGridBrowse()`.
2. Update the error block:

```jsx
// BEFORE
if (error) {
  return (
    <div className="grid-browse" ref={gridRef}>
      <Header />
      <div className="error-container">
        <p className="error-message">Unable to load artworks</p>
        <p className="error-detail">{error}</p>
      </div>
    </div>
  );
}

// AFTER
if (error) {
  return (
    <div className="grid-browse" ref={gridRef}>
      <Header />
      <div className="error-container">
        <p className="error-message">Unable to load artworks</p>
        <p className="error-detail">{error}</p>
        <button
          className="retry-button"
          onClick={() => initSearch(type, searchTerm)}
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
```

3. In `GridBrowse.css`, add the retry button styles (or reuse from DiscoveryFeed.css — the `.retry-button` class is already defined there). Since DiscoveryFeed.css and GridBrowse.css are separate files, add to `GridBrowse.css`:

```css
.grid-browse .retry-button {
  background-color: var(--color-gold);
  color: var(--color-bg);
  border: none;
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s, opacity 0.2s;
  margin-top: 10px;
}

.grid-browse .retry-button:hover {
  transform: scale(1.05);
}

.grid-browse .retry-button:active {
  transform: scale(0.95);
}
```

**Commit:** `feat(grid): add retry button to error state`

---

## Task 7 — Modal: stopPropagation + X Close Button

**Files:** `src/components/modal/ArtworkModal.jsx`, `src/components/modal/ArtworkModal.css`

**What:**
1. Add `onClick={e => e.stopPropagation()}` to `.artwork-modal-card` so clicking on the metadata/image does NOT close the modal (currently all clicks bubble to the backdrop and close it).
2. Add a visible × close button in the top-right corner of the modal card.
3. **Bonus bug fix:** The modal currently uses `selectedArtwork.primaryImage` but the transformed display object stores the full image as `primaryImageFull`. Fix to use `selectedArtwork.primaryImageFull || selectedArtwork.imageUrl`.

**In ArtworkModal.jsx:**

```jsx
// BEFORE
<div className="artwork-modal-card">
  <div className="artwork-modal-content">

// AFTER
<div className="artwork-modal-card" onClick={e => e.stopPropagation()}>
  <button
    className="modal-close-btn"
    onClick={closeModal}
    aria-label="Close artwork details"
  >
    ×
  </button>
  <div className="artwork-modal-content">
```

Also fix the image src:
```jsx
// BEFORE
src={selectedArtwork.primaryImage || selectedArtwork.imageUrl}

// AFTER
src={selectedArtwork.primaryImageFull || selectedArtwork.imageUrl}
```

**In ArtworkModal.css:**
```css
.modal-close-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.4);
  color: var(--color-text);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  transition: background-color 0.2s ease;
}

.modal-close-btn:hover {
  background: rgba(240, 185, 0, 0.3);
}

.modal-close-btn:focus {
  outline: 2px solid var(--color-gold);
  outline-offset: 2px;
}
```

Also add `position: relative` to `.artwork-modal-card` so the close button positions correctly:
```css
/* Add to existing .artwork-modal-card rule */
.artwork-modal-card {
  /* existing styles... */
  position: relative;
}
```

**Commit:** `fix(modal): add close button, fix click-through bug, use full-res image`

---

## Task 8 — Modal: ARIA + Focus Trap

**File:** `src/components/modal/ArtworkModal.jsx`

**What:** Add proper ARIA attributes and focus trap to ArtworkModal so keyboard users and screen readers work correctly.

**Changes to ArtworkModal.jsx:**

1. Add a ref for focus management:
```jsx
import { useEffect, useCallback, useRef } from 'react';
// ...
const modalRef = useRef(null);
```

2. Update the useEffect that handles `isOpen` to also manage focus:
```jsx
useEffect(() => {
  if (isOpen) {
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    // Move focus into modal
    const firstFocusable = modalRef.current?.querySelector(
      'button, [href], input, [tabIndex]:not([tabIndex="-1"])'
    );
    firstFocusable?.focus();
  }
  return () => {
    document.removeEventListener('keydown', handleKeyDown);
    document.body.style.overflow = '';
  };
}, [isOpen, handleKeyDown]);
```

3. Update the handleKeyDown to include Tab trapping:
```jsx
const handleKeyDown = useCallback((e) => {
  if (e.key === 'Escape') {
    closeModal();
    return;
  }
  // Trap Tab focus inside modal
  if (e.key === 'Tab' && modalRef.current) {
    const focusable = modalRef.current.querySelectorAll(
      'button, [href], input, [tabIndex]:not([tabIndex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  }
}, [closeModal]);
```

4. Add ARIA attributes and ref to the modal container:
```jsx
// BEFORE
<div className="artwork-modal-backdrop" onClick={closeModal}>
  <div className="artwork-modal-container">

// AFTER
<div
  className="artwork-modal-backdrop"
  onClick={closeModal}
  role="dialog"
  aria-modal="true"
  aria-label="Artwork details"
  ref={modalRef}
>
  <div className="artwork-modal-container">
```

**Commit:** `feat(a11y): add ARIA dialog role and focus trap to ArtworkModal`

---

## Task 9 — Modal: Image Error Fallback

**Files:** `src/components/modal/ArtworkModal.jsx`, `src/components/modal/ArtworkModal.css`

**What:** When the artwork's full-size image fails to load, show a branded fallback instead of a broken image icon.

**In ArtworkModal.jsx:**
1. Import the flying machine icon: `import flyingMachineIcon from '../../assets/FlyingMachine2_tinted_gold.png';`
2. Add state for image error: `const [imageError, setImageError] = useState(false);`
   - Reset on artwork change: inside the component, add `useEffect(() => setImageError(false), [selectedArtwork]);`
3. Update the image JSX:
```jsx
// BEFORE
<div className="artwork-modal-image-container">
  <img
    src={selectedArtwork.primaryImageFull || selectedArtwork.imageUrl}
    alt={`${selectedArtwork.title} by ${selectedArtwork.artistName}`}
    className="artwork-modal-image"
  />
</div>

// AFTER
<div className="artwork-modal-image-container">
  {imageError ? (
    <div className="modal-image-fallback">
      <img src={flyingMachineIcon} alt="" className="modal-image-fallback-icon" />
      <p className="modal-image-fallback-text">Image unavailable</p>
    </div>
  ) : (
    <img
      src={selectedArtwork.primaryImageFull || selectedArtwork.imageUrl}
      alt={selectedArtwork.artistName
        ? `${selectedArtwork.title} by ${selectedArtwork.artistName}`
        : selectedArtwork.title}
      className="artwork-modal-image"
      onError={() => setImageError(true)}
    />
  )}
</div>
```

4. Add to `ArtworkModal.css`:
```css
.modal-image-fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  padding: 40px;
  gap: 16px;
}

.modal-image-fallback-icon {
  width: 64px;
  height: 64px;
  opacity: 0.5;
}

.modal-image-fallback-text {
  color: var(--color-text-muted);
  font-size: 14px;
  margin: 0;
}
```

**Commit:** `feat(modal): add image error fallback state`

---

## Task 10 — Modal: Metadata Label Typography

**File:** `src/components/modal/ArtworkModal.css`

**What:** Make metadata labels use the muted gold color and values use bright white, creating better visual hierarchy.

**Change in ArtworkModal.css:**
```css
/* BEFORE */
.metadata-label {
  font-weight: 600;
  color: #fff;
  min-width: 100px;
  flex-shrink: 0;
}

.metadata-value {
  color: #e0e0e0;
  flex: 1;
}

/* AFTER */
.metadata-label {
  font-weight: 600;
  color: var(--color-gold-muted);
  min-width: 100px;
  flex-shrink: 0;
}

.metadata-value {
  color: var(--color-text);
  flex: 1;
}
```

Also update the mobile override in the `@media (max-width: 480px)` block:
```css
/* BEFORE */
.metadata-label {
  min-width: unset;
  font-size: 12px;
  color: #ccc;
}

.metadata-value {
  font-size: 14px;
  color: #fff;
}

/* AFTER */
.metadata-label {
  min-width: unset;
  font-size: 12px;
  color: var(--color-gold-muted);
}

.metadata-value {
  font-size: 14px;
  color: var(--color-text);
}
```

**Note:** This task should be done AFTER Task 1 (CSS variables), so `var(--color-gold-muted)` and `var(--color-text)` are available. If doing tasks out of order, use `#A37D00` and `#ffffff` directly.

**Commit:** `feat(modal): improve metadata label/value typography contrast`

---

## Task 11 — One-Time First-Visit Hint Overlay

**Files:** `src/components/feed/DiscoveryFeed.jsx`, `src/components/feed/DiscoveryFeed.css`

**What:** Show a brief hint to first-time users explaining the two non-obvious interactions. Store a flag in localStorage so it only shows once. Auto-dismiss after 3 seconds.

**In DiscoveryFeed.jsx:**
1. Add hint state near the top of the component:
```jsx
const HINT_STORAGE_KEY = 'immediart_hint_seen';
// ...
const [showHint, setShowHint] = useState(() => {
  try {
    return !localStorage.getItem(HINT_STORAGE_KEY);
  } catch {
    return false;
  }
});
```

2. Add a useEffect to auto-dismiss:
```jsx
useEffect(() => {
  if (!showHint) return;
  const timer = setTimeout(() => {
    setShowHint(false);
    try { localStorage.setItem(HINT_STORAGE_KEY, '1'); } catch { /* ignore */ }
  }, 3000);
  return () => clearTimeout(timer);
}, [showHint]);
```

3. Show the hint only after first artworks have loaded (not during loading state). In the return JSX, add inside `.discovery-feed` after the Banner:
```jsx
{showHint && artworks.length > 0 && (
  <div className="first-visit-hint" role="status" aria-live="polite">
    <span>Double-tap image for details</span>
    <span className="hint-separator">·</span>
    <span>Tap artist or tag to explore</span>
  </div>
)}
```

4. Add to `DiscoveryFeed.css`:
```css
.first-visit-hint {
  position: sticky;
  top: 50px; /* below banner */
  left: 0;
  right: 0;
  z-index: 50;
  background: rgba(0, 0, 0, 0.75);
  color: var(--color-text-body);
  font-size: 12px;
  text-align: center;
  padding: 8px 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  animation: hintFadeOut 0.5s ease 2.5s forwards;
  pointer-events: none;
}

.hint-separator {
  color: var(--color-gold-muted);
}

@keyframes hintFadeOut {
  from { opacity: 1; }
  to   { opacity: 0; }
}
```

**Commit:** `feat(ux): add one-time first-visit hint overlay for discoverability`

---

## Task 12 — Persist Likes in localStorage

**File:** `src/components/feed/DiscoveryFeed.jsx`

**What:** Artwork likes currently live in React state and are lost on navigation or page reload. Persist them in localStorage.

**Changes in DiscoveryFeed.jsx:**

1. Replace the `likedArtworks` useState with a localStorage-backed version:

```jsx
// BEFORE
const [likedArtworks, setLikedArtworks] = useState(new Set());

// AFTER
const LIKES_STORAGE_KEY = 'immediart_liked_artworks';

const [likedArtworks, setLikedArtworks] = useState(() => {
  try {
    const stored = localStorage.getItem(LIKES_STORAGE_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
});
```

2. Update `handleLike` to also write to localStorage:

```jsx
// BEFORE
const handleLike = (id) => {
  setLikedArtworks(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
};

// AFTER
const handleLike = (id) => {
  setLikedArtworks(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    try {
      localStorage.setItem(LIKES_STORAGE_KEY, JSON.stringify([...next]));
    } catch { /* ignore quota errors */ }
    return next;
  });
};
```

**Note:** No changes to how `likedArtworks` is consumed — it's already passed as `isLiked={likedArtworks.has(artwork.id)}` to ArtworkCard.

**Commit:** `feat(ux): persist liked artworks to localStorage across navigation and reloads`

---

## Task 13 — Warmer End-of-Feed Message

**Files:** `src/components/feed/DiscoveryFeed.jsx`, `src/components/feed/DiscoveryFeed.css`

**What:** Replace the dry "You have seen all available artworks!" message with a warmer branded message.

**In DiscoveryFeed.jsx:**
1. Import the flying machine asset (already imported in ArtworkCard, but DiscoveryFeed.jsx doesn't import it — add):
```jsx
import flyingMachineIcon from '../../assets/FlyingMachine2_tinted_gold.png';
```

2. Replace the end-message block:
```jsx
// BEFORE
{!hasMore && artworks.length > 0 && (
  <div className="end-message">
    <p>You have seen all available artworks!</p>
    <p>New artworks coming soon...</p>
  </div>
)}

// AFTER
{!hasMore && artworks.length > 0 && (
  <div className="end-message">
    <img src={flyingMachineIcon} alt="" className="end-message-icon" />
    <p>You&apos;ve explored the whole collection.</p>
    <p>Come back for more.</p>
  </div>
)}
```

3. Add to `DiscoveryFeed.css` (update existing `.end-message` rules):
```css
/* Add to existing .end-message */
.end-message {
  /* existing styles */
  display: flex;
  flex-direction: column;
  align-items: center;
}

.end-message-icon {
  width: 48px;
  height: 48px;
  opacity: 0.6;
  margin-bottom: 12px;
}
```

**Commit:** `feat(ux): warm end-of-feed message with flying machine icon`

---

## Task 14 — Fix ThumbnailCard Anonymous Artwork Alt Text

**File:** `src/components/grid/ThumbnailCard.jsx`

**What:** When `artwork.artistName` is an empty string (anonymous works), the alt text reads "Artwork Title by " with a trailing "by ". Fix to only include artist when non-empty.

**Change in ThumbnailCard.jsx:**
```jsx
// BEFORE
alt={`${artwork.title} by ${artwork.artistName}`}

// AFTER
alt={artwork.artistName ? `${artwork.title} by ${artwork.artistName}` : artwork.title}
```

**Commit:** `fix(a11y): fix ThumbnailCard alt text for anonymous artworks`

---

## Task 15 — /artwork/:id Deep-Link Route

**Files:** `src/App.jsx`, `src/components/ArtworkDeepLink.jsx` (new file)

**What:** The Share button generates `/artwork/{id}` URLs but there is no route for them. Users who receive a shared link currently land on the homepage (Netlify catch-all) with no artwork shown. Create the route.

**Behavior:** When a user navigates to `/artwork/12345`, the app:
1. Shows a loading state
2. Fetches the artwork by ID using `fetchArtworkByID`
3. Transforms the API response using `transformAPIToDisplay`
4. Navigates to home (`/`)
5. Opens the modal for that artwork
6. If fetch fails: shows an error state with a "Go to home" link

**Create `src/components/ArtworkDeepLink.jsx`:**

```jsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchArtworkByID } from '../services/metAPI';
import { transformAPIToDisplay } from '../utils/transformers';
import { useArtworkModal } from '../context/ArtworkModalContext';
import flyingMachineIcon from '../assets/FlyingMachine2_tinted_gold.png';

export default function ArtworkDeepLink() {
  const { artworkId } = useParams();
  const navigate = useNavigate();
  const { openModal } = useArtworkModal();
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!artworkId) {
      navigate('/');
      return;
    }

    const controller = new AbortController();

    fetchArtworkByID(Number(artworkId), controller.signal)
      .then(apiArtwork => {
        if (!apiArtwork) throw new Error('Artwork not found');
        const artwork = transformAPIToDisplay(apiArtwork);
        navigate('/');
        // Open modal after navigation settles
        setTimeout(() => openModal(artwork), 50);
      })
      .catch(err => {
        if (err.name === 'AbortError') return;
        setError(err.message || 'Unable to load artwork');
      });

    return () => controller.abort();
  }, [artworkId, navigate, openModal]);

  if (error) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', minHeight: '100vh', gap: '16px',
        background: '#121212', color: '#888', textAlign: 'center', padding: '20px'
      }}>
        <img src={flyingMachineIcon} alt="" style={{ width: 64, height: 64, opacity: 0.5 }} />
        <p style={{ color: '#F0B900', fontWeight: 600 }}>Artwork not found</p>
        <p style={{ fontSize: 14 }}>{error}</p>
        <button
          onClick={() => navigate('/')}
          style={{
            background: '#F0B900', color: '#121212', border: 'none',
            padding: '12px 24px', borderRadius: 8, fontWeight: 600, cursor: 'pointer'
          }}
        >
          Explore the collection
        </button>
      </div>
    );
  }

  // Loading state — flying machine sweep
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100vh', gap: '16px',
      background: '#121212'
    }}>
      <img
        src={flyingMachineIcon}
        alt="Loading artwork"
        style={{ width: 80, height: 80, opacity: 0.7, animation: 'none' }}
      />
      <p style={{ color: '#888', fontSize: 14 }}>Loading artwork...</p>
    </div>
  );
}
```

**In `src/App.jsx`:**
1. Import: `import ArtworkDeepLink from './components/ArtworkDeepLink';`
2. Add route inside `<Routes>`:
```jsx
<Route path="/artwork/:artworkId" element={<ArtworkDeepLink />} />
```

**Edge cases:**
- Invalid/non-numeric ID: `fetchArtworkByID` will receive `NaN` — the API will return an error, caught and shown.
- Artwork with no image: `transformAPIToDisplay` handles missing `primaryImageSmall` gracefully.
- AbortError on unmount: handled in the `catch`.

**Commit:** `feat: add /artwork/:id deep-link route for shared artwork URLs`

---

## Testing Requirements

After implementing all tasks, write/update tests for:

### New tests required:

**`GridBrowse.test.jsx`** (create if not exists, or add to existing test coverage):
- Renders result count in heading when `totalCount > 0`
- Empty state: renders flying machine icon + warm message + CTA button
- Empty state: CTA button navigates to home
- Error state: renders retry button; retry button calls `initSearch(type, searchTerm)`

**`ArtworkModal.test.jsx`** (create or add):
- Close button renders and clicking it calls `closeModal`
- Clicking `.artwork-modal-card` does NOT call `closeModal` (stopPropagation test)
- Clicking `.artwork-modal-backdrop` calls `closeModal`
- Image error state: when image onError fires, fallback renders
- ARIA: `role="dialog"` and `aria-modal="true"` present when open

**`DiscoveryFeed.test.jsx`** (create or add):
- First-visit hint renders when `localStorage.getItem('immediart_hint_seen')` is null
- First-visit hint does NOT render when flag is set
- Likes are initialized from localStorage on mount
- handleLike writes to localStorage

**`ThumbnailCard.test.jsx`** (update existing or create):
- Anonymous artwork (empty artistName): alt text equals `artwork.title` only
- Named artwork: alt text equals `"${title} by ${artistName}"`

**`ArtworkDeepLink.test.jsx`** (create):
- Fetches artwork on mount, navigates home, opens modal
- Shows error state when fetch fails
- Handles AbortError silently (no error state)
- Renders loading state while fetching

---

## Implementation Order

Follow this order to minimize rework:

1. Task 1 (CSS vars) — all subsequent CSS changes use the variables
2. Task 2 (DESIGN.md) — documentation only
3. Task 3 (viewport meta) — 1-line change
4. Task 14 (ThumbnailCard alt) — 1-line change
5. Task 10 (modal label typography) — depends on Task 1
6. Task 7 (modal close button + stopPropagation + image fix) — standalone
7. Task 8 (modal ARIA + focus trap) — builds on Task 7
8. Task 9 (modal image fallback) — builds on Task 7
9. Task 4 (grid result count) — standalone
10. Task 5 (grid empty state) — standalone
11. Task 6 (grid error retry) — standalone
12. Task 11 (hint overlay) — standalone
13. Task 12 (like persistence) — standalone
14. Task 13 (end-of-feed message) — standalone
15. Task 15 (/artwork/:id route) — last, depends on existing infrastructure

---

## Done Criteria

- [ ] `npm test` passes with 0 failures after each commit
- [ ] No hardcoded hex color values remain in any CSS file (except rgba/gradients)
- [ ] DESIGN.md exists at project root
- [ ] `user-scalable=no` removed from index.html
- [ ] GridBrowse shows result count when `totalCount > 0`
- [ ] GridBrowse empty state has flying machine + CTA
- [ ] GridBrowse error has retry button that works
- [ ] ArtworkModal has visible × close button
- [ ] Clicking inside ArtworkModal metadata does NOT close it
- [ ] ArtworkModal uses `primaryImageFull` for the full-res image
- [ ] ArtworkModal has `role="dialog"` and `aria-modal="true"`
- [ ] Tab key is trapped inside ArtworkModal when open
- [ ] ArtworkModal shows branded fallback when image fails
- [ ] Metadata labels are in gold-muted, values in white
- [ ] First-visit hint shows once, auto-dismisses after 3s, sets localStorage flag
- [ ] Likes persist across navigation and page reloads via localStorage
- [ ] End-of-feed message has flying machine icon
- [ ] ThumbnailCard alt text is title-only for anonymous artworks
- [ ] `/artwork/:id` route works — fetches artwork, navigates home, opens modal
- [ ] `/artwork/:id` route shows error state for invalid IDs
