# ImmediArt

Instagram-style feed over the Met Museum collection API. React 19 + Vite, tests in Vitest.

## Health Stack

- lint: npm run lint
- deadcode: npm run lint:dead
- typecheck: npm run typecheck
- test: npm test

`npm run typecheck` runs checked JavaScript over `src/services`, `src/hooks` and `src/utils`; when it flags an inferred shape (a `Promise<void>` resolve, a request's `result`), fix it with a JSDoc type cast rather than loosening the config.
