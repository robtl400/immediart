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
