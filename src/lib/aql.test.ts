import { describe, expect, it } from 'vitest';
import { codeLetterFor, resolveClassPlan, samplingPlan } from './aql';

describe('ISO 2859-1 code letters (General Level II)', () => {
  it.each([
    [8, 'A'],
    [50, 'D'],
    [151, 'G'],
    [500, 'H'],
    [1200, 'J'],
    [3000, 'K'],
    [10000, 'L'],
    [20000, 'M'],
  ])('lot %i → letter %s', (lot, letter) => {
    expect(samplingPlan(lot).codeLetter).toBe(letter);
  });

  it('rejects lots smaller than 2', () => {
    expect(() => codeLetterFor(1, 'II')).toThrow(RangeError);
  });
});

describe('Master table (single sampling, normal)', () => {
  it('lot 3,000 · AQL 2.5 / 4.0 → n=125, major 7/8, minor 10/11', () => {
    const p = samplingPlan(3000, 'II', '2.5', '4.0');
    expect(p.sampleSize).toBe(125);
    expect(p.major).toMatchObject({ ac: 7, re: 8 });
    expect(p.minor).toMatchObject({ ac: 10, re: 11 });
  });

  it('lot 1,000 · AQL 2.5 / 4.0 → n=80, major 5/6, minor 7/8', () => {
    const p = samplingPlan(1000, 'II', '2.5', '4.0');
    expect(p.sampleSize).toBe(80);
    expect(p.major).toMatchObject({ ac: 5, re: 6 });
    expect(p.minor).toMatchObject({ ac: 7, re: 8 });
  });

  it('lot 10,000 · AQL 1.5 → 7/8 at n=200', () => {
    expect(resolveClassPlan(10, '1.5')).toMatchObject({ ac: 7, re: 8, sampleSize: 200 });
  });

  it('follows ↓ arrow to the next plan and its sample size (AQL 2.5, letter E)', () => {
    expect(resolveClassPlan(4, '2.5')).toEqual({ ac: 1, re: 2, sampleSize: 20, codeLetter: 'F' });
  });

  it('follows ↑ arrow to the previous plan (AQL 2.5, letter D)', () => {
    expect(resolveClassPlan(3, '2.5')).toEqual({ ac: 0, re: 1, sampleSize: 5, codeLetter: 'C' });
  });

  it('follows ↑ past the end of a column (AQL 6.5, letter N)', () => {
    expect(resolveClassPlan(12, '6.5')).toMatchObject({ ac: 21, re: 22, sampleSize: 200 });
  });

  it('caps sample size at lot size → 100% inspection', () => {
    const p = samplingPlan(4, 'II', '0.65', '1.0');
    expect(p.sampleSize).toBe(4);
    expect(p.fullInspection).toBe(true);
  });

  it('critical defects are zero-tolerance', () => {
    expect(samplingPlan(5000).critical).toEqual({ ac: 0, re: 1 });
  });
});
