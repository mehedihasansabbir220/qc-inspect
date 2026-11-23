import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, CheckCircle2, Pencil, Printer, Share2, XCircle } from 'lucide-react';
import { TopBar } from '../components/AppShell';
import { SEVERITY_STYLE, SyncIcon, useObjectUrl } from '../components/ui';
import { CHECKLIST, defectByCode } from '../lib/defects';
import { db, type Photo } from '../lib/db';
import { useI18n } from '../lib/i18n';
import { formatBytes } from '../lib/photos';
import { updateInspection } from '../lib/repo';
import { tally } from '../lib/verdict';

function ReportPhoto({ photo, caption }: { photo: Photo; caption: string }) {
  const url = useObjectUrl(photo.blob);
  return (
    <figure className="overflow-hidden rounded-xl bg-ink-100 ring-1 ring-ink-200">
      {url && <img src={url} alt={caption} className="aspect-[4/3] w-full object-cover" />}
      <figcaption className="flex justify-between gap-2 px-2 py-1.5 text-[11px] text-ink-600">
        <span className="truncate">{caption}</span>
        <span className="shrink-0 text-ink-400" title={`Original ${formatBytes(photo.originalBytes)}`}>
          {formatBytes(photo.bytes)}
        </span>
      </figcaption>
    </figure>
  );
}

export function Report() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { t, pick, lang } = useI18n();
  const insp = useLiveQuery(() => db.inspections.get(id), [id]);
  const factory = useLiveQuery(() => (insp ? db.factories.get(insp.factoryId) : undefined), [insp?.factoryId]);
  const photos = useLiveQuery(() => db.photos.where('inspectionId').equals(id).toArray(), [id]);
  if (!insp) return null;

  const c = tally(insp.defects);
  const { plan } = insp;
  const pass = insp.verdict === 'pass';
  const photoCaption = new Map<string, string>();
  for (const d of insp.defects) for (const p of d.photoIds) photoCaption.set(p, defectByCode.get(d.code)?.en ?? d.code);

  const byCode = new Map<string, { code: string; critical: number; major: number; minor: number }>();
  for (const d of insp.defects) {
    const row = byCode.get(d.code) ?? { code: d.code, critical: 0, major: 0, minor: 0 };
    row[d.severity] += d.qty;
    byCode.set(d.code, row);
  }

  const dateFmt = new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const savedBytes = (photos ?? []).reduce((n, p) => n + p.originalBytes - p.bytes, 0);

  async function share() {
    const text = `QC ${insp!.type} inspection — ${factory?.name}\n${insp!.poNumber} / ${insp!.style}: ${insp!.verdict.toUpperCase()}\nSample ${plan.sampleSize} pcs · Critical ${c.critical} · Major ${c.major}/${plan.major.ac} · Minor ${c.minor}/${plan.minor.ac}`;
    if (navigator.share) await navigator.share({ title: 'QC report', text }).catch(() => {});
    else await navigator.clipboard?.writeText(text);
  }

  return (
    <>
      <TopBar
        title={t('viewReport')}
        subtitle={`${insp.poNumber} · ${insp.style}`}
        left={
          <button onClick={() => navigate('/')} className="-ml-1 grid size-9 place-items-center rounded-lg hover:bg-white/10" aria-label="Back">
            <ArrowLeft className="size-5" />
          </button>
        }
      />
      <main className="mx-auto max-w-2xl space-y-4 px-4 pt-4 pb-16">
        <div className="no-print flex gap-2">
          <button className="btn-primary flex-1" onClick={() => window.print()}>
            <Printer className="size-4" /> PDF
          </button>
          <button className="btn-ghost flex-1" onClick={share}>
            <Share2 className="size-4" /> Share
          </button>
          {insp.status === 'completed' && (
            <button
              className="btn-ghost"
              title="Reopen to edit"
              onClick={async () => {
                await updateInspection(insp.id, { status: 'draft', syncState: 'local' });
                navigate(`/inspect/${insp.id}`);
              }}
            >
              <Pencil className="size-4" />
            </button>
          )}
        </div>

        <section className={`overflow-hidden rounded-2xl text-white ${pass ? 'bg-gradient-to-br from-emerald-600 to-emerald-800' : insp.verdict === 'fail' ? 'bg-gradient-to-br from-red-600 to-red-800' : 'bg-ink-800'}`}>
          <div className="flex items-center gap-4 p-5">
            {pass ? <CheckCircle2 className="size-14 shrink-0" strokeWidth={1.5} /> : <XCircle className="size-14 shrink-0" strokeWidth={1.5} />}
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold tracking-widest uppercase opacity-80">
                {t(insp.type)} · AQL {plan.major.aql}/{plan.minor.aql}
              </div>
              <div className="text-3xl font-black tracking-tight">{insp.verdict === 'in-progress' ? t('in-progress') : t(insp.verdict).toUpperCase()}</div>
              <div className="truncate text-sm opacity-90">{factory?.name}</div>
            </div>
          </div>
          <div className="grid grid-cols-4 divide-x divide-white/15 border-t border-white/15 bg-black/10 text-center">
            {[
              [t('sample'), `${insp.inspected}/${plan.sampleSize}`],
              [t('critical'), `${c.critical}/${plan.critical.ac}`],
              [t('major'), `${c.major}/${plan.major.ac}`],
              [t('minor'), `${c.minor}/${plan.minor.ac}`],
            ].map(([k, v]) => (
              <div key={k} className="py-2.5">
                <div className="text-lg font-bold tabular-nums">{v}</div>
                <div className="text-[10px] font-semibold uppercase opacity-75">{k}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="card grid grid-cols-2 gap-x-4 gap-y-3 p-4 text-sm">
          {[
            [t('poNumber'), insp.poNumber],
            [t('style'), insp.style],
            [t('product'), insp.productCategory],
            [t('lotSize'), insp.lotSize.toLocaleString()],
            ['Level / code', `${plan.level} / ${plan.codeLetter}`],
            [t('inspector'), insp.inspector],
            ['Completed', insp.completedAt ? dateFmt.format(insp.completedAt) : '—'],
            [
              'Sync',
              <span key="s" className="inline-flex items-center gap-1.5">
                <SyncIcon state={insp.syncState} /> {insp.syncState === 'synced' && insp.syncedAt ? dateFmt.format(insp.syncedAt) : insp.syncState}
              </span>,
            ],
          ].map(([k, v], i) => (
            <div key={i}>
              <div className="text-[11px] font-semibold text-ink-400 uppercase">{k}</div>
              <div className="font-medium">{v}</div>
            </div>
          ))}
        </section>

        <section className="card overflow-hidden">
          <h3 className="px-4 pt-4 font-semibold">{t('defects')}</h3>
          {byCode.size === 0 ? (
            <p className="p-4 text-sm text-ink-500">{t('noDefects')}</p>
          ) : (
            <table className="mt-2 w-full text-sm">
              <thead className="text-left text-[11px] text-ink-400 uppercase">
                <tr>
                  <th className="px-4 py-2 font-semibold">Defect</th>
                  {(['critical', 'major', 'minor'] as const).map((s) => (
                    <th key={s} className={`w-14 py-2 text-center font-semibold ${SEVERITY_STYLE[s].text}`}>
                      {t(s)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {[...byCode.values()].map((r) => {
                  const def = defectByCode.get(r.code);
                  return (
                    <tr key={r.code}>
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{def ? pick(def) : r.code}</div>
                        <div className="text-[11px] text-ink-400">{r.code}</div>
                      </td>
                      {(['critical', 'major', 'minor'] as const).map((s) => (
                        <td key={s} className="text-center font-semibold tabular-nums">
                          {r[s] || <span className="text-ink-200">·</span>}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <section className="card p-4">
          <h3 className="font-semibold">{t('measure')}</h3>
          <div className="mt-2 space-y-2 text-sm">
            {insp.measurements.map((m) => (
              <div key={m.pom} className="flex items-center gap-2">
                <span className="flex-1 truncate">{m.pom}</span>
                <span className="text-xs text-ink-400 tabular-nums">
                  {m.spec}±{m.tol}
                </span>
                <div className="flex gap-1">
                  {m.values.map((v, i) => {
                    const bad = v != null && Math.abs(v - m.spec) > m.tol;
                    return (
                      <span key={i} className={`w-11 rounded-md py-0.5 text-center text-xs font-semibold tabular-nums ${v == null ? 'bg-ink-50 text-ink-300' : bad ? 'bg-red-50 text-crit' : 'bg-brand-50 text-brand-600'}`}>
                        {v ?? '—'}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-4">
          <h3 className="font-semibold">{t('checklist')}</h3>
          <ul className="mt-2 space-y-1.5 text-sm">
            {CHECKLIST.map((ci) => {
              const v = insp.checklist[ci.id];
              return (
                <li key={ci.id} className="flex items-center gap-2">
                  <span className={`w-10 rounded-md py-0.5 text-center text-[11px] font-bold ${v === 'ok' ? 'bg-brand-50 text-brand-600' : v === 'nok' ? 'bg-red-50 text-crit' : 'bg-ink-100 text-ink-500'}`}>
                    {v ? v.toUpperCase() : '—'}
                  </span>
                  {pick(ci)}
                </li>
              );
            })}
          </ul>
        </section>

        {insp.comments && (
          <section className="card p-4">
            <h3 className="font-semibold">{t('comments')}</h3>
            <p className="mt-1 text-sm whitespace-pre-wrap text-ink-600">{insp.comments}</p>
          </section>
        )}

        {photos && photos.length > 0 && (
          <section className="card p-4">
            <div className="flex items-baseline justify-between">
              <h3 className="font-semibold">Photos ({photos.length})</h3>
              {savedBytes > 0 && <span className="text-xs text-ink-400">{formatBytes(savedBytes)} saved by on-device compression</span>}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {photos.map((p) => (
                <ReportPhoto key={p.id} photo={p} caption={photoCaption.get(p.id) ?? ''} />
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
