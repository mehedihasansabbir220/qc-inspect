import { describe, expect, it } from 'vitest';
import { samplingPlan } from './aql';
import type { Inspection } from './db';
import { overallOf, overallResult, reportNumber, reportSections } from './report';

const allOk = { 'approved-sample': 'ok', qty: 'ok', carton: 'ok', labels: 'ok', 'drop-test': 'ok', metal: 'ok' } as const;

function insp(patch: Partial<Inspection> = {}): Inspection {
  return {
    id: 'abcdef12-0000-4000-8000-000000000000', createdAt: Date.UTC(2026, 10, 20), updatedAt: 0, version: 1,
    status: 'completed', syncState: 'synced', factoryId: 'f', poNumber: 'PO', style: 'S', productCategory: 'Knit',
    type: 'final', lotSize: 3000, level: 'II', aqlMajor: '2.5', aqlMinor: '4.0', plan: samplingPlan(3000), inspected: 125,
    defects: [], measurements: [{ pom: 'Chest', spec: 50, tol: 1, values: [50, 50.5, 49.5, 50, 50] }],
    checklist: { ...allOk }, comments: '', inspector: 'QA', verdict: 'pass', ...patch,
  };
}

const result = (i: Inspection, key: string) => reportSections(i).find((s) => s.key === key)!.result;

describe('report sections', () => {
  it('all good → PASS', () => {
    expect(overallOf(insp())).toBe('pass');
  });

  it('AQL fail → FAIL', () => {
    expect(overallOf(insp({ verdict: 'fail' }))).toBe('fail');
  });

  it('unanswered checklist item → PENDING', () => {
    expect(result(insp({ checklist: { ...allOk, carton: undefined } }), 'packing')).toBe('pending');
    expect(overallOf(insp({ checklist: { ...allOk, carton: undefined } }))).toBe('pending');
  });

  it('a few readings out of tolerance → PENDING (buyer decision), many → FAIL', () => {
    const few = insp({ measurements: [{ pom: 'C', spec: 50, tol: 1, values: [50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 52] }] });
    expect(result(few, 'measurement')).toBe('pending');
    const many = insp({ measurements: [{ pom: 'C', spec: 50, tol: 1, values: [52, 52, 50, 50, 50] }] });
    expect(result(many, 'measurement')).toBe('fail');
  });

  it('a critical defect fails safety even if AQL looks fine', () => {
    const i = insp({ defects: [{ id: 'd', code: 'SAF-01', severity: 'critical', qty: 1, photoIds: [], at: 0 }] });
    expect(result(i, 'safety')).toBe('fail');
  });

  it('all N/A packing is N/A, not pending', () => {
    expect(result(insp({ checklist: { ...allOk, carton: 'na', labels: 'na', 'drop-test': 'na' } }), 'packing')).toBe('na');
  });

  it('draft is in progress', () => {
    expect(overallOf(insp({ status: 'draft' }))).toBe('in-progress');
  });

  it('fail outranks pending', () => {
    expect(overallResult([
      { key: 'quantity', title: '', remark: '', result: 'pending' },
      { key: 'safety', title: '', remark: '', result: 'fail' },
    ])).toBe('fail');
  });

  it('report number is stable and readable', () => {
    expect(reportNumber(insp())).toBe('QC-2611-ABCDEF');
  });
});
