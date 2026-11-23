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

type Filter = 'all' | 'draft' | 'completed' | 'shared';

export function InspectionsList() {
  const { t, lang } = useI18n();
  const [filter, setFilter] = useState<Filter>('all');
  const { online } = useNetwork();
  const pending = usePendingCount();
  const session = useSession();
  const inspections = useLiveQuery(() => db.inspections.orderBy('updatedAt').reverse().toArray(), []);
  const factories = useLiveQuery(async () => new Map((await db.factories.toArray()).map((f) => [f.id, f])), []);

  if (!inspections || !factories) return null;

  const weekAgo = Date.now() - 7 * 86_400_000;
  const completedWeek = inspections.filter((i) => i.status === 'completed' && (i.completedAt ?? 0) > weekAgo);
  const passRate = completedWeek.length ? Math.round((completedWeek.filter((i) => i.verdict === 'pass').length / completedWeek.length) * 100) : 0;
  const drafts = inspections.filter((i) => i.status === 'draft').length;
  const sharedCount = inspections.filter((i) => i.access?.role === 'shared').length;
  const shown = inspections.filter((i) => (filter === 'all' ? true : filter === 'shared' ? i.access?.role === 'shared' : i.status === filter));

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

        <section className="grid grid-cols-3 gap-3">
          <Kpi label="Pass rate · 7d" value={`${passRate}%`} tone={passRate >= 80 ? 'text-brand-600' : 'text-major'} />
          <Kpi label="Inspections · 7d" value={completedWeek.length} />
          <Kpi label="Open drafts" value={drafts} />
        </section>

        <div className="mt-6 mb-3 flex items-center justify-between">
          <h1 className="text-lg font-bold">{t('inspections')}</h1>
          <div className="seg text-xs">
            {(['all', 'draft', 'completed', ...(sharedCount ? ['shared'] : [])] as Filter[]).map((f) => (
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
            <p className="mt-3 font-semibold">Nothing here yet</p>
            <p className="mt-1 text-sm text-ink-500">Tap + to start your first inspection — it works without internet.</p>
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
  const shared = insp.access?.role === 'shared';
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
              {insp.poNumber} · {insp.style} · {insp.productCategory}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <VerdictBadge verdict={insp.verdict} status={insp.status} />
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
