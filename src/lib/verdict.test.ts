import { describe, expect, it } from 'vitest';
import { samplingPlan } from './aql';
import { computeVerdict, tally } from './verdict';

const plan = samplingPlan(3000, 'II', '2.5', '4.0'); // n=125, major 7/8, minor 10/11

describe('computeVerdict', () => {
  it('is in progress until the full sample is inspected', () => {
    expect(computeVerdict(plan, { critical: 0, major: 2, minor: 3 }, 60).verdict).toBe('in-progress');
  });

  it('passes at the acceptance number', () => {
    expect(computeVerdict(plan, { critical: 0, major: 7, minor: 10 }, 125).verdict).toBe('pass');
  });

  it('fails early when majors reach the rejection number', () => {
    expect(computeVerdict(plan, { critical: 0, major: 8, minor: 0 }, 40)).toEqual({ verdict: 'fail', reasons: ['major'] });
  });

  it('fails on a single critical defect', () => {
    expect(computeVerdict(plan, { critical: 1, major: 0, minor: 0 }, 125).reasons).toEqual(['critical']);
  });
});

describe('tally', () => {
  it('sums quantities per severity', () => {
    expect(
      tally([
        { severity: 'major', qty: 2 },
        { severity: 'minor', qty: 1 },
        { severity: 'major', qty: 1 },
      ]),
    ).toEqual({ critical: 0, major: 3, minor: 1 });
  });
});
