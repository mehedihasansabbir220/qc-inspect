import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { SignaturePad } from '../components/SignaturePad';
import { ResultPill } from '../components/ui';
import { overallResult, reportSections } from '../lib/report';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Check, CheckCircle2, Cloud, FileText, Minus, Plus, Ruler, Trash2, XCircle } from 'lucide-react';
import { TopBar } from '../components/AppShell';
import { DefectSheet } from '../components/DefectSheet';
import { SEVERITY_STYLE, Spinner, VerdictBadge, useObjectUrl } from '../components/ui';
import { CATEGORIES, CHECKLIST, DEFECTS, defectByCode, type DefectType } from '../lib/defects';
import { db, type Inspection, type Photo } from '../lib/db';
import { useI18n } from '../lib/i18n';
import { addDefect, completeInspection, removeDefect, updateInspection } from '../lib/repo';
import { tally } from '../lib/verdict';

type Tab = 'defects' | 'measure' | 'checklist' | 'finish';

export function Inspect() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('defects');
  const insp = useLiveQuery(() => db.inspections.get(id), [id]);
  const factory = useLiveQuery(() => (insp ? db.factories.get(insp.factoryId) : undefined), [insp?.factoryId]);

  useEffect(() => {
    // Braces matter: scrollTo returns a Promise in newer browsers, and React would call it as a cleanup.
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [tab]);

  if (!insp) return null;

  const counts = tally(insp.defects);
  const outOfTol = insp.measurements.reduce((n, m) => n + m.values.filter((v) => v != null && Math.abs(v - m.spec) > m.tol).length, 0);
  const readingsDone = insp.measurements.every((m) => m.values.every((v) => v != null));
  const checklistDone = CHECKLIST.every((c) => insp.checklist[c.id]);
  const steps: { key: Tab; label: string; done: boolean; badge?: number }[] = [
    { key: 'defects', label: t('defects'), done: insp.inspected >= insp.plan.sampleSize || insp.verdict === 'fail', badge: insp.defects.length },
    { key: 'measure', label: t('measure'), done: readingsDone, badge: outOfTol },
    { key: 'checklist', label: t('checklist'), done: checklistDone },
    { key: 'finish', label: t('finish'), done: insp.status === 'completed' },
  ];
  const idx = steps.findIndex((s) => s.key === tab);

  return (
    <>
      <TopBar
        title={`${insp.poNumber} · ${insp.style}`}
        subtitle={factory?.name}
        left={
          <button onClick={() => navigate('/')} className="-ml-1 grid size-9 place-items-center rounded-lg hover:bg-white/10" aria-label="Back">
            <ArrowLeft className="size-5" />
          </button>
        }
      />
      <main className="mx-auto max-w-2xl px-4 pt-4 pb-28">
        <VerdictPanel insp={insp} counts={counts} />

        {/* Step progress — tap any step, or use Next below */}
        <nav className="no-print sticky top-14 z-20 -mx-4 mt-4 bg-ink-100/95 px-4 py-2.5 backdrop-blur" aria-label="Inspection steps">
          <ol className="flex items-center">
            {steps.map((s, i) => {
              const active = s.key === tab;
              return (
                <li key={s.key} className="flex flex-1 items-center last:flex-none">
                  <button onClick={() => setTab(s.key)} className="flex flex-col items-center gap-1" aria-current={active ? 'step' : undefined}>
                    <span
                      className={`relative grid size-8 place-items-center rounded-full text-sm font-bold transition ${
                        active ? 'bg-ink-900 text-white ring-4 ring-ink-900/15' : s.done ? 'bg-brand-600 text-white' : 'bg-white text-ink-500 ring-1 ring-ink-200'
                      }`}
                    >
                      {s.done && !active ? <Check className="size-4" strokeWidth={3} /> : i + 1}
                      {!!s.badge && <span className="absolute -top-1.5 -right-2 rounded-full bg-major px-1 text-[10px] leading-4 text-white tabular-nums">{s.badge}</span>}
                    </span>
                    <span className={`text-[11px] font-semibold ${active ? 'text-ink-900' : 'text-ink-500'}`}>{s.label}</span>
                  </button>
                  {i < steps.length - 1 && <span className={`mx-1 mb-5 h-0.5 flex-1 rounded ${s.done ? 'bg-brand-500' : 'bg-ink-200'}`} />}
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="mt-2">
          {tab === 'defects' && <DefectsTab insp={insp} />}
          {tab === 'measure' && <MeasureTab insp={insp} />}
          {tab === 'checklist' && <ChecklistTab insp={insp} />}
          {tab === 'finish' && <FinishTab insp={insp} outOfTol={outOfTol} />}
        </div>
      </main>

      {tab !== 'finish' && (
        <div className="no-print pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-2xl gap-2 px-4 pt-3">
            {idx > 0 && (
              <button className="btn-ghost !px-4" onClick={() => setTab(steps[idx - 1].key)}>
                <ChevronLeft className="size-5" /> {t('back')}
              </button>
            )}
            <button className="btn-primary flex-1 text-base" onClick={() => setTab(steps[idx + 1].key)}>
              {t('next')}: {steps[idx + 1].label} <ChevronRight className="size-5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function VerdictPanel({ insp, counts }: { insp: Inspection; counts: ReturnType<typeof tally> }) {
  const { t } = useI18n();
  const { plan } = insp;
  const n = plan.sampleSize;
  const setInspected = (v: number) => updateInspection(insp.id, { inspected: Math.max(0, Math.min(n, v)) });
  const pct = Math.min(100, (insp.inspected / n) * 100);

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between p-4 pb-3">
        <div>
          <div className="text-xs font-semibold text-ink-500 uppercase">{t('piecesInspected')}</div>
          <div className="mt-0.5 text-3xl font-bold tabular-nums">
            {insp.inspected}
            <span className="text-lg text-ink-400"> / {n}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <VerdictBadge verdict={insp.verdict} size="lg" />
          <span className="flex items-center gap-1 text-[11px] text-ink-400">
            <Check className="size-3" /> {t('savedOnDevice')}
          </span>
        </div>
      </div>
      <div className="mx-4 h-2 overflow-hidden rounded-full bg-ink-100">
        <div className={`h-full rounded-full transition-all duration-300 ${insp.verdict === 'fail' ? 'bg-crit' : 'bg-brand-500'}`} style={{ width: `${pct}%` }} />
      </div>
      {insp.status === 'draft' && (
        <div className="flex gap-2 px-4 pt-3">
          <button className="btn-ghost !px-3" onClick={() => setInspected(insp.inspected - 1)} aria-label="Minus one">
            <Minus className="size-4" />
          </button>
          <button className="btn-primary flex-1" onClick={() => setInspected(insp.inspected + 1)}>
            <Plus className="size-4" /> 1 pc OK
          </button>
          <button className="btn-ghost" onClick={() => setInspected(insp.inspected + 5)}>
            +5
          </button>
          <button className="btn-ghost" onClick={() => setInspected(n)}>
            All
          </button>
        </div>
      )}
      <div className="mt-4 grid grid-cols-3 divide-x divide-ink-200 border-t border-ink-200">
        {(['critical', 'major', 'minor'] as const).map((s) => {
          const found = counts[s];
          const re = plan[s].re;
          const st = SEVERITY_STYLE[s];
          const over = found >= re;
          return (
            <div key={s} className={`px-3 py-3 ${over ? st.bg : ''}`}>
              <div className={`text-[11px] font-bold uppercase ${st.text}`}>{t(s)}</div>
              <div className="flex items-baseline gap-1">
                <span className={`text-2xl font-bold tabular-nums ${over ? st.text : ''}`}>{found}</span>
                <span className="text-xs text-ink-400 tabular-nums">
                  Ac {plan[s].ac} · Re {re}
                </span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-ink-100">
                <div className={`h-full ${st.bar} transition-all`} style={{ width: `${Math.min(100, (found / re) * 100)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DefectsTab({ insp }: { insp: Inspection }) {
  const { t, pick } = useI18n();
  const [active, setActive] = useState<DefectType | null>(null);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const matches = q ? DEFECTS.filter((d) => `${d.code} ${d.en} ${d.bn}`.toLowerCase().includes(q)) : [];
  const counts = new Map<string, number>();
  for (const d of insp.defects) counts.set(d.code, (counts.get(d.code) ?? 0) + d.qty);
  const editable = insp.status === 'draft';

  return (
    <div className="space-y-5">
      {editable && (
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-400" />
          <input className="field !pl-10" placeholder={t('searchDefects')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('searchDefects')} />
          {query && (
            <button className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-ink-400 hover:bg-ink-100" onClick={() => setQuery('')} aria-label={t('clear')}>
              <X className="size-4" />
            </button>
          )}
        </div>
      )}
      {editable && q && (
        <section>
          {matches.length === 0 ? (
            <p className="card p-4 text-sm text-ink-500">No defect matches “{query}”.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {matches.map((d) => (
                <button key={d.code} onClick={() => setActive(d)} className="card flex min-h-16 items-center gap-2 p-3 text-left transition active:scale-[0.97]">
                  <span className={`h-8 w-1 shrink-0 rounded-full ${SEVERITY_STYLE[d.severity].bar}`} />
                  <span className="text-sm leading-tight font-semibold">{pick(d)}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}
      {editable &&
        !q &&
        CATEGORIES.map((cat) => (
          <section key={cat.id}>
            <h3 className="mb-2 px-1 text-xs font-bold tracking-wide text-ink-500 uppercase">{pick(cat)}</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {DEFECTS.filter((d) => d.category === cat.id).map((d) => {
                const c = counts.get(d.code) ?? 0;
                const st = SEVERITY_STYLE[d.severity];
                return (
                  <button
                    key={d.code}
                    onClick={() => setActive(d)}
                    className={`card relative flex min-h-16 items-center gap-2 p-3 text-left transition active:scale-[0.97] ${c ? `ring-2 ${st.ring}` : ''}`}
                  >
                    <span className={`h-8 w-1 shrink-0 rounded-full ${st.bar}`} />
                    <span className="text-sm leading-tight font-semibold">{pick(d)}</span>
                    {c > 0 && (
                      <span className={`absolute -top-1.5 -right-1.5 grid size-6 place-items-center rounded-full text-xs font-bold text-white ${st.bar}`}>{c}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))}

      <section>
        <h3 className="mb-2 px-1 text-xs font-bold tracking-wide text-ink-500 uppercase">{t('loggedDefects')}</h3>
        {insp.defects.length === 0 ? (
          <div className="card p-6 text-center text-sm text-ink-500">{t('noDefects')}</div>
        ) : (
          <ul className="card divide-y divide-ink-100">
            {insp.defects.map((d) => {
              const def = defectByCode.get(d.code);
              const st = SEVERITY_STYLE[d.severity];
              return (
                <li key={d.id} className="flex items-center gap-3 p-3">
                  <span className={`h-10 w-1 shrink-0 rounded-full ${st.bar}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">
                      {def ? pick(def) : d.code} {d.qty > 1 && <span className="text-ink-500">×{d.qty}</span>}
                    </div>
                    <div className={`text-xs font-semibold ${st.text}`}>
                      {t(d.severity)}
                      {d.note && <span className="font-normal text-ink-500"> · {d.note}</span>}
                    </div>
                  </div>
                  <div className="flex -space-x-2">
                    {d.photoIds.slice(0, 3).map((pid) => (
                      <PhotoThumb key={pid} id={pid} />
                    ))}
                  </div>
                  {editable && (
                    <button onClick={() => removeDefect(insp.id, d.id)} className="grid size-9 place-items-center rounded-lg text-ink-400 hover:bg-red-50 hover:text-crit" aria-label="Delete defect">
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {active && (
        <DefectSheet
          defect={active}
          onClose={() => setActive(null)}
          onSave={({ severity, qty, note, files }) => addDefect(insp.id, { code: active.code, severity, qty, note: note || undefined }, files)}
        />
      )}
    </div>
  );
}

export function PhotoThumb({ id, size = 'size-9' }: { id: string; size?: string }) {
  const photo = useLiveQuery(() => db.photos.get(id), [id]) as Photo | undefined;
  const url = useObjectUrl(photo?.blob);
  return (
    <div className={`relative ${size} overflow-hidden rounded-lg bg-ink-100 ring-2 ring-white`}>
      {url && <img src={url} alt="" className="size-full object-cover" />}
      {photo && !photo.uploaded && <span className="absolute right-0.5 bottom-0.5 size-2 rounded-full bg-amber-400 ring-1 ring-white" title="Waiting to upload" />}
    </div>
  );
}

function MeasureTab({ insp }: { insp: Inspection }) {
  const editable = insp.status === 'draft';
  const commit = (mi: number, vi: number, raw: string) => {
    const v = raw.trim() === '' ? null : Number(raw.replace(',', '.'));
    if (v !== null && Number.isNaN(v)) return;
    void updateInspection(insp.id, (i) => ({
      measurements: i.measurements.map((m, k) => (k === mi ? { ...m, values: m.values.map((x, j) => (j === vi ? v : x)) } : m)),
    }));
  };
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 px-1 text-xs text-ink-500">
        <Ruler className="size-4" /> Measure 5 pieces per point (cm). Values outside tolerance turn red.
      </p>
      {insp.measurements.map((m, mi) => (
        <section key={m.pom} className="card p-4">
          <div className="flex items-baseline justify-between">
            <h4 className="text-sm font-semibold">{m.pom}</h4>
            <span className="text-xs text-ink-500 tabular-nums">
              {m.spec} ± {m.tol}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-5 gap-2">
            {m.values.map((v, vi) => (
              <MeasureCell key={vi} value={v} spec={m.spec} tol={m.tol} disabled={!editable} onCommit={(raw) => commit(mi, vi, raw)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function MeasureCell({ value, spec, tol, disabled, onCommit }: { value: number | null; spec: number; tol: number; disabled: boolean; onCommit: (raw: string) => void }) {
  const [raw, setRaw] = useState(value?.toString() ?? '');
  useEffect(() => {
    setRaw(value?.toString() ?? '');
  }, [value]);
  const num = raw === '' ? null : Number(raw.replace(',', '.'));
  const bad = num != null && !Number.isNaN(num) && Math.abs(num - spec) > tol;
  const ok = num != null && !bad;
  return (
    <input
      inputMode="decimal"
      disabled={disabled}
      value={raw}
      placeholder="—"
      onChange={(e) => setRaw(e.target.value)}
      onBlur={() => raw !== (value?.toString() ?? '') && onCommit(raw)}
      className={`w-full rounded-lg border px-1 py-2.5 text-center font-semibold tabular-nums outline-none transition focus:ring-4 ${
        bad ? 'border-red-300 bg-red-50 text-crit focus:ring-red-200' : ok ? 'border-emerald-200 bg-brand-50 text-brand-600 focus:ring-emerald-100' : 'border-ink-200 focus:border-brand-500 focus:ring-brand-500/15'
      }`}
    />
  );
}

function ChecklistTab({ insp }: { insp: Inspection }) {
  const { pick } = useI18n();
  const editable = insp.status === 'draft';
  const set = (key: string, v: 'ok' | 'nok' | 'na') => updateInspection(insp.id, (i) => ({ checklist: { ...i.checklist, [key]: i.checklist[key] === v ? undefined : v } }));
  return (
    <ul className="card divide-y divide-ink-100">
      {CHECKLIST.map((c) => {
        const v = insp.checklist[c.id];
        return (
          <li key={c.id} className="flex items-center gap-3 p-3">
            <span className="flex-1 text-sm font-medium">{pick(c)}</span>
            <div className="flex gap-1">
              {(
                [
                  ['ok', <CheckCircle2 key="o" className="size-5" />, 'bg-brand-600 text-white'],
                  ['nok', <XCircle key="n" className="size-5" />, 'bg-crit text-white'],
                  ['na', <span key="na" className="text-xs font-bold">N/A</span>, 'bg-ink-600 text-white'],
                ] as const
              ).map(([k, icon, on]) => (
                <button
                  key={k}
                  disabled={!editable}
                  onClick={() => set(c.id, k)}
                  aria-pressed={v === k}
                  aria-label={k}
                  className={`grid size-10 place-items-center rounded-xl transition ${v === k ? on : 'bg-ink-100 text-ink-400'}`}
                >
                  {icon}
                </button>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function FinishTab({ insp, outOfTol }: { insp: Inspection; outOfTol: number }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [comments, setComments] = useState(insp.comments);
  const [rep, setRep] = useState(insp.factoryRep ?? '');
  const [busy, setBusy] = useState(false);
  const sections = reportSections(insp);
  const predicted = overallResult(sections);
  const setSig = (who: 'inspector' | 'factory', dataUrl?: string) =>
    updateInspection(insp.id, (i) => ({ signatures: { ...i.signatures, [who]: dataUrl, signedAt: Date.now() } }));
  const unanswered = CHECKLIST.filter((c) => !insp.checklist[c.id]).length;
  const nok = CHECKLIST.filter((c) => insp.checklist[c.id] === 'nok').length;
  const sampleDone = insp.inspected >= insp.plan.sampleSize;
  const canComplete = insp.verdict === 'fail' || sampleDone;

  const warnings: { ok: boolean; text: string }[] = [
    { ok: sampleDone, text: sampleDone ? `Full sample inspected (${insp.plan.sampleSize} pcs)` : `${insp.plan.sampleSize - insp.inspected} pcs left to inspect` },
    { ok: outOfTol === 0, text: outOfTol ? `${outOfTol} measurement(s) out of tolerance` : 'Measurements within tolerance' },
    { ok: unanswered === 0 && nok === 0, text: unanswered ? `${unanswered} checklist item(s) unanswered` : nok ? `${nok} checklist item(s) not OK` : 'Checklist complete' },
  ];

  async function finish() {
    setBusy(true);
    await updateInspection(insp.id, { comments, factoryRep: rep.trim() || undefined });
    await completeInspection(insp.id);
    navigate(`/report/${insp.id}`, { replace: true });
  }

  return (
    <div className="space-y-4">
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
          <span className="text-sm font-bold uppercase">Report preview</span>
          <ResultPill result={predicted} />
        </div>
        <ul className="divide-y divide-ink-100">
          {sections.map((s) => (
            <li key={s.key} className="flex items-center gap-3 px-4 py-2 text-sm">
              <span className="flex-1">{s.title}</span>
              <ResultPill result={s.result} />
            </li>
          ))}
        </ul>
      </section>
      <ul className="card divide-y divide-ink-100">
        {warnings.map((w) => (
          <li key={w.text} className="flex items-center gap-3 p-3 text-sm">
            {w.ok ? <CheckCircle2 className="size-5 text-brand-600" /> : <XCircle className="size-5 text-amber-500" />}
            {w.text}
          </li>
        ))}
      </ul>
      <div>
        <label className="label" htmlFor="comments">{t('comments')}</label>
        <textarea
          id="comments"
          className="field min-h-28"
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          onBlur={() => comments !== insp.comments && updateInspection(insp.id, { comments })}
          placeholder="e.g. Shade variation concentrated in carton 14–18; factory agreed to re-sort before shipment."
        />
      </div>
      <section className="card space-y-4 p-4">
        <h3 className="text-sm font-bold uppercase">{t('signatures')}</h3>
        <div>
          <label className="label" htmlFor="rep">{t('factoryRep')}</label>
          <input
            id="rep"
            className="field"
            placeholder="Name, e.g. Mr. Karim (QA Manager)"
            value={rep}
            disabled={insp.status !== 'draft'}
            onChange={(e) => setRep(e.target.value)}
            onBlur={() => rep !== (insp.factoryRep ?? '') && updateInspection(insp.id, { factoryRep: rep.trim() || undefined })}
          />
        </div>
        <SignaturePad label={`${t('inspector')} · ${insp.inspector}`} value={insp.signatures?.inspector} onChange={(v) => setSig('inspector', v)} disabled={insp.status !== 'draft'} />
        <SignaturePad label={t('factoryRep')} value={insp.signatures?.factory} onChange={(v) => setSig('factory', v)} disabled={insp.status !== 'draft'} />
        <p className="text-xs text-ink-500">Signatures appear on the PDF report. The factory representative signs to acknowledge the findings.</p>
      </section>
      {insp.status === 'draft' ? (
        <>
          <button className="btn-brand w-full text-base" onClick={finish} disabled={!canComplete || busy}>
            {busy ? <Spinner /> : <Cloud className="size-5" />} {t('complete')}
          </button>
          {!canComplete && <p className="text-center text-xs text-ink-500">Inspect the full sample (or reach a fail) to complete.</p>}
        </>
      ) : (
        <button className="btn-primary w-full" onClick={() => navigate(`/report/${insp.id}`)}>
          <FileText className="size-5" /> {t('viewReport')}
        </button>
      )}
    </div>
  );
}

