import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Camera, ChevronRight, CloudOff, Factory as FactoryIcon, Paperclip, ShieldCheck, Users } from 'lucide-react';
import { cloudEnabled, useSession } from '../lib/supabase';
import { Page, TopBar } from '../components/AppShell';
import { usePendingCount } from '../components/SyncPill';
import { SyncIcon, VerdictBadge, relativeTime } from '../components/ui';
import { db, type Inspection } from '../lib/db';
import { useI18n } from '../lib/i18n';
import { useNetwork } from '../lib/sync';
import { tally } from '../lib/verdict';
import { overallOf, reportNumber } from '../lib/report';
import { Search, User, X } from 'lucide-react';
import { ArrowRight, PlayCircle } from 'lucide-react';

type Filter = 'all' | 'draft' | 'completed' | 'shared' | 'team';
type Sort = 'newest' | 'oldest' | 'result' | 'factory' | 'buyer';

export function InspectionsList() {
  const { t, lang } = useI18n();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('newest');
  const { online } = useNetwork();
  const pending = usePendingCount();
  const session = useSession();
  const inspections = useLiveQuery(() => db.inspections.orderBy('updatedAt').reverse().toArray(), []);
  const factories = useLiveQuery(async () => new Map((await db.factories.toArray()).map((f) => [f.id, f])), []);

  if (!inspections || !factories) return null;

  const weekAgo = Date.now() - 7 * 86_400_000;
  const completedWeek = inspections.filter((i) => i.status === 'completed' && (i.completedAt ?? 0) > weekAgo);
  const passRate = completedWeek.length ? Math.round((completedWeek.filter((i) => overallOf(i) === 'pass').length / completedWeek.length) * 100) : 0;
  const drafts = inspections.filter((i) => i.status === 'draft').length;
  const lastDraft = inspections.find((i) => i.status === 'draft' && i.access?.role !== 'shared');
  const sharedCount = inspections.filter((i) => i.access?.role === 'shared').length;
  const teamCount = inspections.filter((i) => i.access?.role === 'team').length;
  const q = query.trim().toLowerCase();
  const factoryOf = (i: Inspection) => i.factoryName ?? factories.get(i.factoryId)?.name ?? '';
  const RANK = { fail: 0, pending: 1, 'in-progress': 2, pass: 3 } as const;
  const shown = inspections
    .filter((i) => (filter === 'all' ? true : filter === 'shared' || filter === 'team' ? i.access?.role === filter : i.status === filter))
    .filter((i) => !q || [i.poNumber, i.style, i.buyer, factoryOf(i), i.productCategory, i.inspector, i.access?.ownerEmail, reportNumber(i)].some((v) => v?.toLowerCase().includes(q)))
    .sort((a, b) => {
      switch (sort) {
        case 'oldest':
          return a.updatedAt - b.updatedAt;
        case 'result':
          return RANK[overallOf(a)] - RANK[overallOf(b)] || b.updatedAt - a.updatedAt;
        case 'factory':
          return factoryOf(a).localeCompare(factoryOf(b)) || b.updatedAt - a.updatedAt;
        case 'buyer':
          return (a.buyer ?? '~').localeCompare(b.buyer ?? '~') || b.updatedAt - a.updatedAt;
        default:
          return b.updatedAt - a.updatedAt;
      }
    });

  return (
    <>
      <TopBar title="QC Inspect" subtitle={new Date().toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} />
      <Page>
        {!online && (
          <div className="animate-fade mb-4 flex items-start gap-3 rounded-2xl bg-ink-900 p-4 text-sm text-ink-200">
            <CloudOff className="mt-0.5 size-5 shrink-0 text-amber-300" />
            <div>
              <div className="font-semibold text-white">Working offline</div>
              Everything you record is saved on this device{pending > 0 ? ` — ${pending} item${pending > 1 ? 's' : ''} will upload automatically when signal returns.` : '.'}
            </div>
          </div>
        )}

        {cloudEnabled && !session && (
          <Link to="/settings" className="mb-4 flex items-center gap-3 rounded-2xl bg-brand-50 p-4 text-sm text-emerald-900 ring-1 ring-emerald-200">
            <ShieldCheck className="size-5 shrink-0 text-brand-600" />
            <span className="flex-1">
              <b>Sign in to sync & send reports.</b> Your work stays safe on this device until then.
            </span>
            <ChevronRight className="size-4" />
          </Link>
        )}

        {lastDraft && (
          <Link to={`/inspect/${lastDraft.id}`} className="mb-4 block overflow-hidden rounded-2xl bg-ink-900 text-white shadow-lg transition active:scale-[0.99]">
            <div className="flex items-center gap-3 p-4">
              <div className="grid size-11 place-items-center rounded-xl bg-brand-500/20 text-emerald-300">
                <PlayCircle className="size-6" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold tracking-wide text-emerald-300 uppercase">{t('continueInspection')}</div>
                <div className="truncate font-semibold">
                  {lastDraft.poNumber} · {lastDraft.style}
                </div>
                <div className="truncate text-xs text-ink-400">{lastDraft.factoryName ?? factories.get(lastDraft.factoryId)?.name}</div>
              </div>
              <ArrowRight className="size-5 text-ink-400" />
            </div>
            <div className="h-1.5 bg-white/10">
              <div className="h-full bg-brand-500" style={{ width: `${Math.min(100, (lastDraft.inspected / lastDraft.plan.sampleSize) * 100)}%` }} />
            </div>
          </Link>
        )}

        <section className="grid grid-cols-3 gap-3">
          <Kpi label="Pass rate · 7d" value={`${passRate}%`} tone={passRate >= 80 ? 'text-brand-600' : 'text-major'} />
          <Kpi label="Inspections · 7d" value={completedWeek.length} />
          <Kpi label="Open drafts" value={drafts} />
        </section>

        <div className="mt-6 mb-2 flex items-center justify-between gap-3">
          <h1 className="text-lg font-bold">
            {t('inspections')} <span className="text-sm font-medium text-ink-400">{shown.length}</span>
          </h1>
          <select className="rounded-lg border border-ink-200 bg-white px-2 py-1.5 text-xs font-semibold" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort reports">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="result">Fail / pending first</option>
            <option value="factory">Factory A–Z</option>
            <option value="buyer">Buyer A–Z</option>
          </select>
        </div>
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-400" />
          <input className="field !py-2.5 !pl-10" placeholder="Search PO, style, buyer, factory, inspector…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search reports" />
          {query && (
            <button className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-ink-400 hover:bg-ink-100" onClick={() => setQuery('')} aria-label="Clear search">
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="mb-3">
          <div className="seg overflow-x-auto text-xs whitespace-nowrap">
            {(['all', 'draft', 'completed', ...(sharedCount ? ['shared'] : []), ...(teamCount ? ['team'] : [])] as Filter[]).map((f) => (
              <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)} className="!px-3 !py-1.5 capitalize">
                {f === 'draft' ? t('draft') : f}
              </button>
            ))}
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="card flex flex-col items-center px-6 py-12 text-center">
            <div className="grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">
              <ShieldCheck className="size-7" />
            </div>
            <p className="mt-3 font-semibold">{q ? `No report matches “${query}”` : 'Nothing here yet'}</p>
            <p className="mt-1 text-sm text-ink-500">{q ? 'Try a PO number, style, buyer or factory.' : 'Tap + to start your first inspection — it works without internet.'}</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {shown.map((i) => (
              <InspectionRow key={i.id} insp={i} factoryName={i.factoryName ?? factories.get(i.factoryId)?.name ?? '—'} lang={lang} />
            ))}
          </ul>
        )}
      </Page>
    </>
  );
}

function Kpi({ label, value, tone = 'text-ink-900' }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="card p-3.5">
      <div className={`text-2xl font-bold tabular-nums ${tone}`}>{value}</div>
      <div className="mt-0.5 text-[11px] leading-tight font-medium text-ink-500">{label}</div>
    </div>
  );
}

function InspectionRow({ insp, factoryName, lang }: { insp: Inspection; factoryName: string; lang: 'en' | 'bn' }) {
  const { t } = useI18n();
  const c = tally(insp.defects);
  const photos = insp.defects.reduce((n, d) => n + d.photoIds.length, 0);
  const shared = insp.access?.role === 'shared' || insp.access?.role === 'team';
  const href = insp.status === 'draft' && !shared ? `/inspect/${insp.id}` : `/report/${insp.id}`;
  const progress = Math.min(100, (insp.inspected / insp.plan.sampleSize) * 100);
  return (
    <li>
      <Link to={href} className="card block p-4 transition hover:ring-ink-400/60 active:scale-[0.99]">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-ink-100 text-ink-600">
            <FactoryIcon className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-semibold">{factoryName}</span>
              <SyncIcon state={insp.syncState} className="size-3.5 shrink-0" />
            </div>
            <div className="truncate text-sm text-ink-500">
              {insp.buyer ? `${insp.buyer} · ` : ''}
              {insp.poNumber} · {insp.style} · {insp.productCategory}
            </div>
            <div className="mt-0.5 flex items-center gap-1 truncate text-xs text-ink-400">
              <User className="size-3 shrink-0" />
              <span className="truncate">
                {insp.inspector || 'Inspector'}
                {insp.access?.ownerEmail && insp.access.role !== 'owner' ? ` · ${insp.access.ownerEmail}` : ''} · {reportNumber(insp)}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <VerdictBadge verdict={overallOf(insp)} status={insp.status} />
            <span className="text-[11px] text-ink-400">{relativeTime(insp.updatedAt, lang)}</span>
          </div>
          <ChevronRight className="mt-2 size-4 shrink-0 text-ink-400" />
        </div>
        <div className="mt-3 flex items-center gap-3 text-xs text-ink-500">
          <span className="rounded-md bg-ink-100 px-1.5 py-0.5 font-semibold text-ink-600">{t(insp.type)}</span>
          <span className="tabular-nums">
            <b className="text-crit">{c.critical}</b> / <b className="text-major">{c.major}</b> / <b className="text-minor">{c.minor}</b>
          </span>
          {shared && (
            <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-1.5 py-0.5 font-semibold text-sky-700" title={`Shared by ${insp.access?.ownerEmail}`}>
              <Users className="size-3" /> {insp.access?.ownerEmail?.split('@')[0] ?? 'shared'}
            </span>
          )}
          {!!insp.attachments?.length && (
            <span className="inline-flex items-center gap-1">
              <Paperclip className="size-3.5" /> {insp.attachments.length}
            </span>
          )}
          {photos > 0 && (
            <span className="inline-flex items-center gap-1">
              <Camera className="size-3.5" /> {photos}
            </span>
          )}
          <span className="ml-auto tabular-nums">
            {insp.inspected}/{insp.plan.sampleSize} pcs
          </span>
        </div>
        {insp.status === 'draft' && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-100">
            <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
      </Link>
    </li>
  );
}
