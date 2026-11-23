import { describe, expect, it } from 'vitest';
import { backoffDelay } from './backoff';

describe('backoffDelay', () => {
  it('grows exponentially', () => {
    const max = () => 1;
    expect(backoffDelay(1, max)).toBe(2_000);
    expect(backoffDelay(2, max)).toBe(4_000);
    expect(backoffDelay(4, max)).toBe(16_000);
  });

  it('applies jitter between 50% and 100% of the window', () => {
    expect(backoffDelay(3, () => 0)).toBe(4_000);
    expect(backoffDelay(3, () => 1)).toBe(8_000);
  });

  it('is capped at 5 minutes', () => {
    expect(backoffDelay(30, () => 1)).toBe(300_000);
  });
});
