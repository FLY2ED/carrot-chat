// Pure reconnection-backoff helpers — no timers, no sockets — so the policy can
// be unit-tested in isolation from the WebSocket lifecycle.

/** Exponential backoff capped at `max`: base, 2·base, 4·base, … */
export function nextDelay(attempt: number, base = 500, max = 10_000): number {
  if (attempt < 0) return base;
  return Math.min(max, base * 2 ** attempt);
}

/** Apply ±`ratio` jitter so reconnecting clients don't thunder together. */
export function withJitter(
  delay: number,
  rng: () => number = Math.random,
  ratio = 0.25,
): number {
  const jitter = delay * ratio * (rng() * 2 - 1);
  return Math.max(0, Math.round(delay + jitter));
}
