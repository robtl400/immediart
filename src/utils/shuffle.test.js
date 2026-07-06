/**
 * shuffle utility tests
 *
 * Covers: shuffleArray is non-mutating, returns a new array reference,
 * preserves length and element multiset, and handles empty/single-element
 * inputs.
 */

import { describe, it, expect } from 'vitest';
import { shuffleArray } from './shuffle';

describe('shuffleArray', () => {
  it('does not mutate the input array', () => {
    const input = [1, 2, 3, 4, 5];
    const snapshot = [...input];
    shuffleArray(input);
    expect(input).toEqual(snapshot);
  });

  it('returns a new array reference', () => {
    const input = [1, 2, 3];
    const result = shuffleArray(input);
    expect(result).not.toBe(input);
  });

  it('preserves length and element multiset (including duplicates)', () => {
    const input = [3, 1, 2, 3, 1, 5, 5, 5];
    const result = shuffleArray(input);
    expect(result).toHaveLength(input.length);
    expect([...result].sort()).toEqual([...input].sort());
  });

  it('returns an empty array for an empty input', () => {
    expect(shuffleArray([])).toEqual([]);
  });

  it('returns the single element for a single-element input', () => {
    expect(shuffleArray(['only'])).toEqual(['only']);
  });
});
