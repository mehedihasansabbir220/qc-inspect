import { useLiveQuery } from 'dexie-react-hooks';
import { Download } from 'lucide-react';
import { Page, TopBar } from '../components/AppShell';
import { DEFECTS, defectByCode } from '../lib/defects';
import { db, type Inspection } from '../lib/db';
import { useI18n } from '../lib/i18n';
import { tally } from '../lib/verdict';
import { overallOf } from '../lib/report';

function toCsv(rows: Inspection[], factoryName: (id: string) => string) {
  const header = ['inspection_id', 'completed_at', 'factory', 'po', 'style', 'product', 'type', 'lot_size', 'sample_size', 'aql_major', 'aql_minor', 'critical', 'major', 'minor', 'verdict', 'inspector', 'sync_state'];
  const esc = (v: unknown) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  const lines = rows.map((i) => {
    const c = tally(i.defects);
    return [i.id, i.completedAt ? new Date(i.completedAt).toISOString() : '', factoryName(i.factoryId), i.poNumber, i.style, i.productCategory, i.type, i.lotSize, i.plan.sampleSize, i.aqlMajor, i.aqlMinor, c.critical, c.major, c.minor, i.verdict, i.inspector, i.syncState]
      .map(esc)
      .join(',');
  });
  return [header.join(','), ...lines].join('\n');
}

export function Insights() {
  const { t, pick } = useI18n();
  const data = useLiveQuery(async () => ({
    inspections: await db.inspections.where('status').equals('completed').toArray(),
    factories: await db.factories.toArray(),
    photoBytes: (await db.photos.toArray()).reduce((n, p) => n + p.bytes, 0),
  }));
  if (!data) return null;

  const { inspections, factories } = data;
  const fname = (id: string) => factories.find((f) => f.id === id)?.name ?? id;
  const passed = inspections.filter((i) => overallOf(i) === 'pass').length;
  const passRate = inspections.length ? Math.round((passed / inspections.length) * 100) : 0;

  const byFactory = factories
    .map((f) => {
      const list = inspections.filter((i) => i.factoryId === f.id);
      const p = list.filter((i) => overallOf(i) === 'pass').length;
      return { name: f.name, total: list.length, rate: list.length ? Math.round((p / list.length) * 100) : 0 };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.rate - a.rate);

  const defectCounts = new Map<string, number>();
  for (const i of inspections) for (const d of i.defects) defectCounts.set(d.code, (defectCounts.get(d.code) ?? 0) + d.qty);
  const topDefects = [...defectCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxDefect = topDefects[0]?.[1] ?? 1;
  const totalDefects = [...defectCounts.values()].reduce((a, b) => a + b, 0);
  const totalSampled = inspections.reduce((n, i) => n + i.inspected, 0);
  const dhu = totalSampled ? ((totalDefects / totalSampled) * 100).toFixed(1) : '0.0';

  function exportCsv() {
    const blob = new Blob([toCsv(inspections, fname)], { type: 'text/csv;charset=utf-8' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `qc-inspections-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <TopBar title={t('insights')} subtitle="All completed inspections on this device" />
      <Page>
        <section className="grid grid-cols-3 gap-3">
          {[
            ['Pass rate', `${passRate}%`, passRate >= 80 ? 'text-brand-600' : 'text-major'],
            ['Inspections', inspections.length, ''],
            ['DHU %', dhu, ''],
          ].map(([k, v, tone]) => (
            <div key={k as string} className="card p-3.5">
              <div className={`text-2xl font-bold tabular-nums ${tone}`}>{v}</div>
              <div className="mt-0.5 text-[11px] font-medium text-ink-500">{k}</div>
            </div>
          ))}
        </section>
        <p className="mt-2 px-1 text-[11px] text-ink-400">DHU = defects per hundred units inspected — the standard garment-industry quality KPI.</p>

        <section className="card mt-4 p-4">
          <h3 className="font-semibold">Pass rate by factory</h3>
          <ul className="mt-3 space-y-3">
            {byFactory.map((f) => (
              <li key={f.name}>
                <div className="flex justify-between text-sm">
                  <span className="truncate font-medium">{f.name}</span>
                  <span className="text-ink-500 tabular-nums">
                    {f.rate}% <span className="text-ink-300">· {f.total}</span>
                  </span>
                </div>
                <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-ink-100">
                  <div className={`h-full rounded-full ${f.rate >= 80 ? 'bg-brand-500' : f.rate >= 50 ? 'bg-amber-400' : 'bg-crit'}`} style={{ width: `${Math.max(f.rate, 2)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="card mt-4 p-4">
          <h3 className="font-semibold">Top defects</h3>
          <p className="text-xs text-ink-500">Where corrective action pays off first (Pareto).</p>
          <ul className="mt-3 space-y-2.5">
            {topDefects.map(([code, n]) => {
              const d = defectByCode.get(code) ?? DEFECTS[0];
              return (
                <li key={code} className="flex items-center gap-3 text-sm">
                  <span className="w-36 shrink-0 truncate font-medium">{pick(d)}</span>
                  <div className="h-5 flex-1 overflow-hidden rounded-md bg-ink-100">
                    <div className="h-full rounded-md bg-ink-800" style={{ width: `${(n / maxDefect) * 100}%` }} />
                  </div>
                  <span className="w-8 text-right font-semibold tabular-nums">{n}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <button className="btn-ghost mt-4 w-full" onClick={exportCsv}>
          <Download className="size-4" /> Export CSV (Google Sheets / Excel)
        </button>
      </Page>
    </>
  );
}
