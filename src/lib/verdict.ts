import type { SamplingPlan } from './aql';
import type { Severity } from './defects';

export type Verdict = 'pass' | 'fail' | 'in-progress';

export interface DefectTally {
  critical: number;
  major: number;
  minor: number;
}

export interface VerdictResult {
  verdict: Verdict;
  reasons: Severity[]; // which classes caused a fail
}

export function tally(defects: { severity: Severity; qty: number }[]): DefectTally {
  const t: DefectTally = { critical: 0, major: 0, minor: 0 };
  for (const d of defects) t[d.severity] += d.qty;
  return t;
}

/**
 * A lot fails as soon as any class reaches its rejection number — we can call it early,
 * which saves inspector time on the factory floor. It passes only once the full sample is checked.
 */
export function computeVerdict(plan: SamplingPlan, t: DefectTally, inspected: number): VerdictResult {
  const reasons: Severity[] = [];
  if (t.critical >= plan.critical.re) reasons.push('critical');
  if (t.major >= plan.major.re) reasons.push('major');
  if (t.minor >= plan.minor.re) reasons.push('minor');
  if (reasons.length) return { verdict: 'fail', reasons };
  if (inspected < plan.sampleSize) return { verdict: 'in-progress', reasons };
  return { verdict: 'pass', reasons };
}
