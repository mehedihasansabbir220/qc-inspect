import { samplingPlan, type AqlValue } from './aql';
import { CHECKLIST, DEFAULT_POMS, DEFECTS } from './defects';
import { db, uid, type DefectEntry, type Inspection, type InspectionType } from './db';
import { serverDb } from './sync/mockServer';
import { computeVerdict, tally } from './verdict';

/** Fictional demo factories — replace with the real supplier master via the integration layer. */
export const DEMO_FACTORIES = [
  { id: 'gzp-knit', name: 'Gazipur Knit Composite', location: 'Gazipur' },
  { id: 'nrg-denim', name: 'Narayanganj Denim Works', location: 'Narayanganj' },
  { id: 'svr-woven', name: 'Savar Woven Apparel', location: 'Savar, Dhaka' },
  { id: 'ctg-home', name: 'Chattogram Home Textiles', location: 'Chattogram' },
];

const PRODUCTS = ['Knit T-shirt', 'Denim jeans', 'Woven shirt', 'Bed linen set', 'Bath towel'];

// Deterministic pseudo-random so the demo looks the same every time
function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

export async function seedIfEmpty() {
  if ((await db.factories.count()) > 0) return;
  await db.factories.bulkAdd(DEMO_FACTORIES);

  const rand = rng(42);
  const day = 86_400_000;
  const now = Date.now();
  const plans: [string, string, InspectionType, number, AqlValue, AqlValue, number][] = [
    ['gzp-knit', 'Knit T-shirt', 'final', 3000, '2.5', '4.0', 1],
    ['nrg-denim', 'Denim jeans', 'final', 1200, '2.5', '4.0', 1],
    ['svr-woven', 'Woven shirt', 'pre-final', 2400, '2.5', '4.0', 2],
    ['ctg-home', 'Bed linen set', 'final', 800, '1.5', '4.0', 3],
    ['gzp-knit', 'Knit T-shirt', 'inline', 5000, '2.5', '4.0', 3],
    ['nrg-denim', 'Denim jeans', 'final', 2000, '2.5', '4.0', 4],
    ['ctg-home', 'Bath towel', 'final', 4000, '2.5', '4.0', 5],
    ['svr-woven', 'Woven shirt', 'final', 1500, '2.5', '4.0', 6],
  ];

  const inspections: Inspection[] = plans.map(([factoryId, product, type, lot, maj, min, daysAgo], idx) => {
    const plan = samplingPlan(lot, 'II', maj, min);
    const defects: DefectEntry[] = [];
    const nDefects = Math.floor(rand() * (idx % 3 === 1 ? 14 : 9));
    for (let k = 0; k < nDefects; k++) {
      const d = DEFECTS[3 + Math.floor(rand() * (DEFECTS.length - 3))]; // skip critical
      defects.push({ id: uid(), code: d.code, severity: d.severity, qty: 1, photoIds: [], at: now - daysAgo * day });
    }
    const t = now - daysAgo * day - idx * 3_600_000;
    const insp: Inspection = {
      id: uid(),
      createdAt: t,
      updatedAt: t,
      completedAt: t,
      syncedAt: t,
      version: 3,
      status: 'completed',
      syncState: 'synced',
      factoryId,
      poNumber: `PO-${24810 + idx * 37}`,
      style: `${product.split(' ')[0].slice(0, 3).toUpperCase()}-${1040 + idx}`,
      productCategory: product,
      type,
      lotSize: lot,
      level: 'II',
      aqlMajor: maj,
      aqlMinor: min,
      plan,
      inspected: plan.sampleSize,
      defects,
      measurements: DEFAULT_POMS.map((p) => ({ ...p, values: [0, 1, 2, 3, 4].map(() => +(p.spec + (rand() - 0.5) * p.tol * 2.2).toFixed(1)) })),
      checklist: Object.fromEntries(CHECKLIST.map((c) => [c.id, 'ok' as const])),
      comments: '',
      inspector: 'QA Team',
      verdict: 'in-progress',
    };
    insp.verdict = computeVerdict(plan, tally(defects), insp.inspected).verdict;
    return insp;
  });

  await db.inspections.bulkAdd(inspections);
  await serverDb.inspections.bulkPut(
    inspections.map(({ syncState: _s, ...data }) => (void _s, { id: data.id, version: data.version, receivedAt: data.syncedAt!, data })),
  );
}

export { PRODUCTS };
