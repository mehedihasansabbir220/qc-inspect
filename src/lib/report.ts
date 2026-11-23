import type { Inspection } from './db';
import type { CheckSection } from './defects';
import { checklistOf } from './templates';
import { tally } from './verdict';

/**
 * Industry-standard report structure (as used by third-party inspection companies):
 * every section gets Pass / Fail / Pending / N/A, and the overall result is
 *   FAIL    if any section fails,
 *   PENDING if a section is open or needs the buyer's decision,
 *   PASS    otherwise.
 */
export type SectionResult = 'pass' | 'fail' | 'pending' | 'na';

export interface ReportSection {
  key: 'quantity' | 'conformity' | 'workmanship' | 'measurement' | 'packing' | 'safety' | 'tests' | 'buyer';
  title: string;
  result: SectionResult;
  remark: string;
}

/** A small share of readings outside tolerance is commonly referred to the buyer rather than failed outright. */
export const MEASUREMENT_FAIL_RATE = 0.1;

type Answer = 'ok' | 'nok' | 'na' | undefined;

/** Result of a group of checklist answers. No items in the group → N/A. */
function fromChecks(values: Answer[]): SectionResult {
  if (values.length === 0) return 'na';
  if (values.some((v) => v === 'nok')) return 'fail';
  if (values.some((v) => v === undefined)) return 'pending';
  if (values.every((v) => v === 'na')) return 'na';
  return 'pass';
}

export function reportSections(insp: Inspection): ReportSection[] {
  const c = tally(insp.defects);
  const { plan, checklist: ck } = insp;
  const items = checklistOf(insp);
  const group = (sec: CheckSection) => items.filter((i) => i.section === sec);
  const answers = (sec: CheckSection) => group(sec).map((i) => ck[i.id] as Answer);
  const remarkFor = (sec: CheckSection, fallback: string) => {
    const nok = group(sec).filter((i) => ck[i.id] === 'nok');
    if (nok.length) return `Not OK: ${nok.map((i) => i.en).join('; ')}`;
    const open = group(sec).filter((i) => !ck[i.id]).length;
    if (open) return `${open} item(s) not checked yet`;
    return fallback;
  };

  const readings = insp.measurements.flatMap((m) => m.values.map((v) => ({ v, m })));
  const taken = readings.filter((r) => r.v != null);
  const out = taken.filter((r) => Math.abs(r.v! - r.m.spec) > r.m.tol).length;
  const measurement: SectionResult = taken.length === 0 ? 'pending' : out === 0 ? 'pass' : out / taken.length > MEASUREMENT_FAIL_RATE ? 'fail' : 'pending';

  const workmanship: SectionResult = insp.verdict === 'in-progress' ? 'pending' : insp.verdict;
  const safetyChecks = answers('safety');
  const safety: SectionResult = c.critical > 0 ? 'fail' : safetyChecks.length ? fromChecks(safetyChecks) : 'pass';

  const sections: ReportSection[] = [
    { key: 'quantity', title: 'Quantity', result: fromChecks(answers('quantity')), remark: remarkFor('quantity', `${insp.lotSize.toLocaleString('en')} pcs presented`) },
    { key: 'conformity', title: 'Product conformity', result: fromChecks(answers('conformity')), remark: remarkFor('conformity', 'Checked against approved sample') },
    {
      key: 'workmanship',
      title: 'Workmanship (AQL)',
      result: workmanship,
      remark: `Critical ${c.critical}/${plan.critical.ac} · Major ${c.major}/${plan.major.ac} · Minor ${c.minor}/${plan.minor.ac} (found / allowed)`,
    },
    {
      key: 'measurement',
      title: 'Measurements',
      result: measurement,
      remark: taken.length === 0 ? 'Not measured' : out === 0 ? `${taken.length} readings within tolerance` : `${out} of ${taken.length} readings out of tolerance`,
    },
    { key: 'packing', title: 'Packing, marking & labels', result: fromChecks(answers('packing')), remark: remarkFor('packing', group('packing').map((i) => i.en.split(' ')[0]).join(', ') || '—') },
    {
      key: 'safety',
      title: 'Safety',
      result: safety,
      remark: c.critical > 0 ? `${c.critical} critical defect(s) found` : remarkFor('safety', safetyChecks.length ? 'Safety checks passed' : 'No critical defects found'),
    },
  ];
  if (group('tests').length) sections.push({ key: 'tests', title: 'Product-specific tests', result: fromChecks(answers('tests')), remark: remarkFor('tests', group('tests').map((i) => i.en).join('; ')) });
  if (group('buyer').length) sections.push({ key: 'buyer', title: `Buyer requirements${insp.buyer ? ` (${insp.buyer})` : ''}`, result: fromChecks(answers('buyer')), remark: remarkFor('buyer', group('buyer').map((i) => i.en).join('; ')) });
  return sections;
}

export type OverallResult = 'pass' | 'fail' | 'pending';

export function overallResult(sections: ReportSection[]): OverallResult {
  if (sections.some((s) => s.result === 'fail')) return 'fail';
  if (sections.some((s) => s.result === 'pending')) return 'pending';
  return 'pass';
}

export function overallOf(insp: Inspection): OverallResult | 'in-progress' {
  if (insp.status === 'draft') return 'in-progress';
  return overallResult(reportSections(insp));
}

/** Human-friendly, stable report number, e.g. QC-2611-4F2A9C. */
export function reportNumber(insp: Pick<Inspection, 'id' | 'createdAt'>): string {
  const d = new Date(insp.createdAt);
  const yymm = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}`;
  return `QC-${yymm}-${insp.id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

export const RESULT_LABEL: Record<SectionResult | 'in-progress', string> = {
  pass: 'PASS',
  fail: 'FAIL',
  pending: 'PENDING',
  na: 'N/A',
  'in-progress': 'IN PROGRESS',
};

export const DISCLAIMER =
  'This report reflects the condition of the goods presented and sampled at the time of inspection, using ' +
  'random sampling per ISO 2859-1. It does not release the supplier from its contractual obligations. ' +
  'A PENDING result means one or more items require the buyer’s decision.';
