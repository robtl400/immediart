/**
 * Fisher–Yates array shuffle (non-mutating).
 * Lives in utils so both services and utils (transformers) can use it
 * without utils reaching up into the services layer.
 */
export function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
