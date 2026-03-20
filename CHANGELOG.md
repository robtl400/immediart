# Changelog

All notable changes to this project will be documented in this file.

## [0.0.1] - 2026-03-20

### Fixed
- Infinite scroll in the grid view could fire duplicate concurrent loads — now guarded correctly (brings `GridBrowseContext` in line with `ArtworksContext`)

### For contributors
- 49 tests across 3 files: `ArtworksContext.test.jsx` (21), `GridBrowseContext.test.jsx` (21), and expanded `artworkCache.test.js` (+7 metAPI error paths)
- Added `@testing-library/react` and configured Vitest React plugin to enable JSX context testing
- Fixed stale closure in `GridBrowseContext.loadMore` useCallback deps
