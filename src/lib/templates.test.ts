import { describe, expect, it } from 'vitest';
import { samplingPlan } from './aql';
import type { Inspection } from './db';
import { defectByCode, defectName } from './defects';
import { overallOf, reportSections } from './report';
import { BUYERS, TEMPLATES, buildChecklist, buyerByName, checklistOf, defectsOf, templateById } from './templates';

describe('templates', () => {
  it.each(TEMPLATES.map((t) => [t.id, t] as const))('%s only references real defects, has POMs and unique check ids', (_id, t) => {
    for (const code of t.defects) expect(defectByCode.has(code), code).toBe(true);
    expect(t.poms.length).toBeGreaterThan(0);
    const ids = buildChecklist(t, 'Nordic Home AB').map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('hard goods do not offer garment defects or metal detection', () => {
    const ceramics = templateById.get('ceramics')!;
    expect(defectsOf({ templateId: 'ceramics' }).some((d) => d.code.startsWith('WRK'))).toBe(false);
    expect(buildChecklist(ceramics).some((c) => c.id === 'metal')).toBe(false);
  });

  it('a buyer profile adds its QA-manual checks (case-insensitive match)', () => {
    const items = buildChecklist(templateById.get('towel')!, '  nordic home ab ');
    expect(items.filter((c) => c.section === 'buyer')).toHaveLength(BUYERS[0].checks.length);
    expect(buyerByName('Unknown Co')).toBeUndefined();
  });

  it('old inspections without a template fall back to the apparel checklist', () => {
    expect(checklistOf({}).map((c) => c.id)).toContain('metal');
  });

  it('own "Other" defect shows the inspector\'s description', () => {
    expect(defectName({ code: 'OTH-01', label: 'Glue mark on label' })).toBe('Glue mark on label');
    expect(defectName({ code: 'WRK-01' })).toBe('Broken stitch');
  });
});

describe('report with a hard-goods template', () => {
  const tpl = templateById.get('ceramics')!;
  const items = buildChecklist(tpl, 'Nordic Home AB');
  const base: Inspection = {
    id: 'x', createdAt: 0, updatedAt: 0, version: 1, status: 'completed', syncState: 'synced', templateId: 'ceramics', buyer: 'Nordic Home AB',
    factoryId: 'f', poNumber: 'PO', style: 'S', productCategory: 'Plate', type: 'final', lotSize: 2400, level: 'II', aqlMajor: '2.5', aqlMinor: '4.0',
    plan: samplingPlan(2400), inspected: 125, defects: [], checklistItems: items,
    measurements: tpl.poms.map((p) => ({ ...p, values: [p.spec, p.spec, p.spec, p.spec, p.spec] })),
    checklist: Object.fromEntries(items.map((c) => [c.id, 'ok'])), comments: '', inspector: 'QA', verdict: 'pass',
  };

  it('passes when everything is OK — missing metal check does not leave safety pending', () => {
    expect(reportSections(base).find((s) => s.key === 'safety')!.result).toBe('pass');
    expect(overallOf(base)).toBe('pass');
  });

  it('adds Product-specific tests and Buyer requirements sections', () => {
    const keys = reportSections(base).map((s) => s.key);
    expect(keys).toContain('tests');
    expect(keys).toContain('buyer');
  });

  it('a failed buyer requirement fails the report and names the item', () => {
    const i = { ...base, checklist: { ...base.checklist, 'b-reach': 'nok' as const } };
    const buyer = reportSections(i).find((s) => s.key === 'buyer')!;
    expect(buyer.result).toBe('fail');
    expect(buyer.remark).toContain('REACH');
    expect(overallOf(i)).toBe('fail');
  });

  it('an own check added during inspection counts in its chosen section', () => {
    const own = { id: 'c-1', en: 'Gift box print OK', bn: 'Gift box print OK', section: 'packing' as const };
    const i = { ...base, checklistItems: [...items, own], checklist: { ...base.checklist, 'c-1': undefined } };
    expect(reportSections(i).find((s) => s.key === 'packing')!.result).toBe('pending');
  });
});
