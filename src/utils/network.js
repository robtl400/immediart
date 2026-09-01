// The browser reports no connection. Only a definite `false` counts: an
// engine without navigator.onLine is treated as online.
export const isOffline = () =>
  typeof navigator !== 'undefined' && navigator.onLine === false;
