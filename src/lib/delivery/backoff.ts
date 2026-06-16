// Exponential backoff for outbox retries: 30s base, doubling per attempt,
// capped at 1 hour so a permanently failing endpoint still gets swept slowly.
const BASE_MS = 30_000;
const CAP_MS = 3_600_000;

export function nextRetryDelayMs(attempts: number): number {
  const delay = BASE_MS * 2 ** attempts;
  return Math.min(delay, CAP_MS);
}
