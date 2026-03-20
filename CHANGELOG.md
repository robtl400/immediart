# Changelog

All notable changes to this project will be documented in this file.

## [0.0.1] - 2026-03-20

### Added
- Context-level test coverage: `ArtworksContext.test.jsx` (21 tests) and `GridBrowseContext.test.jsx` (21 tests) covering `loadMore` guard logic, prefetch merge, delay-skip on cache hit, MAX trim, and abort behavior
- `artworkCache.test.js` expanded with 7 new tests for `metAPI` error paths: 403 retry exhaustion, AbortError propagation, network failure (TypeError) retry, batch 404 filtering, and abort mid-batch
- `@testing-library/react` devDependency for React context testing
- React plugin added to `vitest.config.js` for JSX transform in tests

### Fixed
- `GridBrowseContext.loadMore`: added missing `loadingMore` state guard (brought in line with `ArtworksContext`)
- `GridBrowseContext.loadMore`: added `loadingMore` to `useCallback` dependency array to prevent stale closure
