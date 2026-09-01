/**
 * Outage-window bookkeeping for usePaginatedFetch, kept free of React so it
 * can be tested on its own.
 *
 * An "outage window" is a batch that kept zero artworks where transport
 * errors (5xx / network) are the majority of the ids that ACTUALLY hit the
 * network. Batch fetch doesn't throw for these — per-id failures become
 * 'error' outcomes — so callers must detect them or they would scan straight
 * past the failed ids. errorCount and networkCount are both counted over the
 * ordered attempt list in batchFetchArtworks (never the deduped outcomes
 * Map), and cache-answered rejects are excluded: on a warm cache most
 * outcomes never touch the network and would dilute a real 5xx storm below
 * any threshold.
 */

// Keeps one flipped request from stopping infinite scroll: a single 500 in a
// window of cached rejects is a blip, not an outage. The floor scales down to
// the window size so a one-id window (a single like, the tail of a search
// list) can still register — with nothing else to dilute it, its lone error
// IS the whole picture.
const OUTAGE_MIN_ERRORS = 2;

export const isOutageWindow = ({ artworks, outcomes, networkCount, errorCount }) =>
  artworks.length === 0 &&
  errorCount >= Math.min(OUTAGE_MIN_ERRORS, outcomes.size) &&
  errorCount > networkCount / 2;

// How many times the user may retry the SAME stuck window before the hook
// gives up and scans past it. Without this cap, ids that deterministically
// 500 could pin the cursor forever.
export const OUTAGE_MAX_RETRIES = 3;

// Outage bookkeeping pinned to one window position (the hook's outageRef):
//   index — allIDsRef position of the window under suspicion (-1: none)
//   count — outages SURFACED to the user at that window. 0 = seen once
//           silently (by a prefetch, or the primary path's silent re-attempt)
export const NO_OUTAGE = () => ({ index: -1, count: 0 });

// Record one more outage at `windowStart`. Returns true while the outage
// should be surfaced as a retryable error; false once the cap is hit — the
// caller then falls through and scans past the window. Mutates outageRef, so
// call it exactly once per detection, after isOutageWindow.
export const recordOutageAttempt = (outageRef, windowStart) => {
  const o = outageRef.current;
  o.count = o.index === windowStart ? o.count + 1 : 1;
  o.index = windowStart;
  if (o.count <= OUTAGE_MAX_RETRIES) return true;
  console.warn('[ImmediArt] window still failing after', o.count, 'attempts — scanning past it');
  outageRef.current = NO_OUTAGE();
  return false;
};
