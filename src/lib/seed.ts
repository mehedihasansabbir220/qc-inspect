import { samplingPlan, type AqlValue } from './aql';
import { db, uid, type DefectEntry, type Inspection, type InspectionType } from './db';
import { cloudEnabled } from './supabase';
import { serverDb } from './sync/mockServer';
import { buildChecklist, defectsOf, templateById } from './templates';
import { computeVerdict, tally } from './verdict';

/** Fictional demo factories — replace with the real supplier master via the integration layer. */
export const DEMO_FACTORIES = [
  { id: 'gzp-knit', name: 'Gazipur Knit Composite', location: 'Gazipur' },
  { id: 'nrg-denim', name: 'Narayanganj Denim Works', location: 'Narayanganj' },
  { id: 'svr-woven', name: 'Savar Woven Apparel', location: 'Savar, Dhaka' },
  { id: 'ctg-home', name: 'Chattogram Home Textiles', location: 'Chattogram' },
  { id: 'mym-ceramic', name: 'Mymensingh Ceramic Works', location: 'Mymensingh' },
  { id: 'cml-wood', name: 'Cumilla Woodcraft', location: 'Cumilla' },
];

// Deterministic pseudo-random so the demo looks the same every time
function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

let seeding: Promise<void> | undefined;
/**
 * First start on a device: add the factory list. Demo *inspections* are only added
 * automatically in demo mode (no backend). With a real backend, accounts start empty and
 * demo data is opt-in (Settings → "Add demo inspections"), so it never piles up per account.
 */
export function seedIfEmpty() {
  return (seeding ??= (async () => {
    if ((await db.factories.count()) > 0) {
      // Existing device: just make sure newer demo factories (hard goods) are available.
      const have = new Set(await db.factories.toCollection().primaryKeys());
      await db.factories.bulkAdd(DEMO_FACTORIES.filter((f) => !have.has(f.id)));
      return;
    }
    await db.factories.bulkAdd(DEMO_FACTORIES);
    if (!cloudEnabled) await addDemoInspections();
  })());
}

type Plan = [factoryId: string, templateId: string, product: string, buyer: string, type: InspectionType, lot: number, maj: AqlValue, min: AqlValue, daysAgo: number];

const PLANS: Plan[] = [
  ['gzp-knit', 'apparel-top', 'Knit T-shirt', 'Nordic Home AB', 'final', 3000, '2.5', '4.0', 1],
  ['nrg-denim', 'apparel-bottom', 'Denim jeans', 'Value Retail UK', 'final', 1200, '2.5', '4.0', 1],
  ['mym-ceramic', 'ceramics', 'Dinner plate', 'Nordic Home AB', 'final', 2400, '2.5', '4.0', 2],
  ['ctg-home', 'bed-linen', 'Duvet cover set', 'Maison Lumière', 'final', 800, '1.5', '2.5', 3],
  ['gzp-knit', 'apparel-top', 'Polo shirt', 'Value Retail UK', 'inline', 5000, '4.0', '6.5', 3],
  ['nrg-denim', 'apparel-bottom', 'Denim jeans', 'Nordic Home AB', 'final', 2000, '2.5', '4.0', 4],
  ['ctg-home', 'towel', 'Bath towel', 'Nordic Home AB', 'final', 4000, '2.5', '4.0', 5],
  ['cml-wood', 'furniture', 'Dining table', 'Maison Lumière', 'pre-final', 150, '1.5', '2.5', 6],
];

/** Adds 8 realistic completed inspections across product types. In cloud mode they upload as the user's own. */
export async function addDemoInspections() {
  const { syncEngine } = await import('./sync');
  const rand = rng(42);
  const day = 86_400_000;
  const now = Date.now();

  const inspections: Inspection[] = PLANS.map(([factoryId, templateId, product, buyer, type, lot, maj, min, daysAgo], idx) => {
    const tpl = templateById.get(templateId)!;
    const plan = samplingPlan(lot, 'II', maj, min);
    const library = defectsOf({ templateId }).filter((d) => d.severity !== 'critical' && d.code !== 'OTH-01');
    const at = now - daysAgo * day;
    const defects: DefectEntry[] = [];
    const nDefects = Math.floor(rand() * (idx % 3 === 1 ? 12 : 8));
    for (let k = 0; k < nDefects; k++) {
      const d = library[Math.floor(rand() * library.length)];
      defects.push({ id: uid(), code: d.code, severity: d.severity, qty: 1, photoIds: [], at });
    }
    // Realistic mix: a shade-variation lot rejected on majors, and a metal-contamination critical
    if (idx === 1) for (let k = 0; k < 6; k++) defects.push({ id: uid(), code: 'FAB-03', severity: 'major', qty: 1, photoIds: [], at, note: k === 0 ? 'Cartons 14–18, lot B dye batch' : undefined });
    if (idx === 5) defects.push({ id: uid(), code: 'SAF-01', severity: 'critical', qty: 1, photoIds: [], at, note: 'Needle fragment in waistband' });
    const checklistItems = buildChecklist(tpl, buyer);
    const t = at - idx * 3_600_000;
    const factory = DEMO_FACTORIES.find((f) => f.id === factoryId)!;
    const insp: Inspection = {
      id: uid(),
      createdAt: t,
      updatedAt: t,
      completedAt: t,
      version: 3,
      status: 'completed',
      syncState: cloudEnabled ? 'pending' : 'synced',
      syncedAt: cloudEnabled ? undefined : t,
      templateId,
      buyer,
      factoryId,
      factoryName: factory.name,
      factoryLocation: factory.location,
      factoryRep: 'Factory QA Manager',
      attachments: [],
      access: { role: 'owner', canDownload: true, canEdit: true },
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
      checklistItems,
      // ±0.9 × tolerance: mostly in spec, the odd reading close to the limit
      measurements: tpl.poms.map((p) => ({ ...p, values: [0, 1, 2, 3, 4].map(() => +(p.spec + (rand() - 0.5) * p.tol * 1.8).toFixed(1)) })),
      checklist: Object.fromEntries(checklistItems.map((c) => [c.id, 'ok' as const])),
      comments: '',
      inspector: 'QA Team',
      verdict: 'in-progress',
    };
    insp.verdict = computeVerdict(plan, tally(defects), insp.inspected).verdict;
    return insp;
  });

  await db.inspections.bulkAdd(inspections);
  if (cloudEnabled) {
    for (const i of inspections) await syncEngine.enqueue('inspection', i.id);
    void syncEngine.runOnce();
  } else {
    await serverDb.inspections.bulkPut(
      inspections.map(({ syncState: _s, access: _a, ...data }) => (void _s, void _a, { id: data.id, version: data.version, receivedAt: data.completedAt!, data })),
    );
  }
}
