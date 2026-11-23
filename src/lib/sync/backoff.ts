/**
 * Exponential backoff with "equal jitter" (AWS architecture blog): wait a random 50–100 % of
 * the exponential window — never zero (unlike full jitter), but still spread out.
 * Jitter prevents a fleet of devices that regain signal at the same moment
 * (e.g. after a factory power cut) from hammering the API in lock-step.
 */
export function backoffDelay(attempt: number, random: () => number = Math.random, baseMs = 2_000, capMs = 5 * 60_000): number {
  const exp = Math.min(capMs, baseMs * 2 ** Math.max(0, attempt - 1));
  return Math.round(exp / 2 + random() * (exp / 2));
}
