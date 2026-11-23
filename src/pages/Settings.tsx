import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Cloud, Database, HardDrive, LogOut, RefreshCw, RotateCcw, Wifi, WifiOff, Zap } from 'lucide-react';
import { AuthForm } from '../components/AuthForm';
import { cloudEnabled, signOut, useSession } from '../lib/supabase';
import { Page, TopBar } from '../components/AppShell';
import { Segmented, Spinner, relativeTime } from '../components/ui';
import { db, getSetting, setSetting } from '../lib/db';
import { useI18n } from '../lib/i18n';
import { formatBytes } from '../lib/photos';
import { network, syncEngine, useNetwork, useSyncStatus } from '../lib/sync';
import type { NetworkMode } from '../lib/sync/network';
import { serverDb } from '../lib/sync/mockServer';

export function Settings() {
  const { t, lang, setLang } = useI18n();
  const { mode, online } = useNetwork();
  const status = useSyncStatus();
  const [inspector, setInspector] = useState('');
  const [storage, setStorage] = useState<{ usage?: number; quota?: number; persisted?: boolean }>({});
  const outbox = useLiveQuery(() => db.outbox.orderBy('nextAttemptAt').toArray(), []);
  const serverCount = useLiveQuery(() => serverDb.inspections.count(), []);
  const session = useSession();

  useEffect(() => {
    getSetting('inspector', '').then(setInspector);
    (async () => {
      const est = await navigator.storage?.estimate?.();
      const persisted = await navigator.storage?.persisted?.();
      setStorage({ usage: est?.usage, quota: est?.quota, persisted });
    })();
  }, []);

  return (
    <>
      <TopBar title={t('settings')} />
      <Page>
        <section className="card space-y-4 p-4">
          <div>
            <label className="label" htmlFor="insp">{t('inspector')}</label>
            <input id="insp" className="field" value={inspector} placeholder="Your name" onChange={(e) => setInspector(e.target.value)} onBlur={() => setSetting('inspector', inspector.trim())} />
          </div>
          <div>
            <span className="label">{t('language')}</span>
            <Segmented value={lang} onChange={setLang} options={[{ value: 'en', label: 'English' }, { value: 'bn', label: 'বাংলা' }]} />
          </div>
        </section>

        <h2 className="mt-6 mb-2 flex items-center gap-1.5 px-1 text-xs font-bold tracking-wide text-ink-500 uppercase">
          <Cloud className="size-3.5" /> Cloud account
        </h2>
        <section className="card p-4">
          {!cloudEnabled ? (
            <p className="text-sm text-ink-600">
              Demo mode — syncing to an on-device mock server. Add Supabase keys to enable accounts, real sync and sending reports (README → Supabase setup).
            </p>
          ) : session ? (
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-full bg-brand-50 font-bold text-brand-600 uppercase">{session.user.email?.[0]}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{session.user.email}</div>
                <div className="text-xs text-ink-500">Signed in · syncing to cloud</div>
              </div>
              <button className="btn-ghost !px-3 !py-2 text-sm" onClick={() => void signOut()}>
                <LogOut className="size-4" /> Sign out
              </button>
            </div>
          ) : (
            <AuthForm intro="Sign in to back up inspections to the cloud and send reports. You can keep inspecting offline without signing in." />
          )}
        </section>

        <h2 className="mt-6 mb-2 px-1 text-xs font-bold tracking-wide text-ink-500 uppercase">Network simulator · demo</h2>
        <section className="card p-4">
          <Segmented<NetworkMode>
            value={mode}
            onChange={(m) => network.setMode(m)}
            options={[
              { value: 'auto', label: <span className="inline-flex items-center gap-1"><Wifi className="size-4" /> Real</span> },
              { value: 'offline', label: <span className="inline-flex items-center gap-1"><WifiOff className="size-4" /> Offline</span> },
              { value: 'flaky', label: <span className="inline-flex items-center gap-1"><Zap className="size-4" /> Flaky 3G</span> },
            ]}
          />
          <p className="mt-3 text-xs text-ink-500">
            Simulates factory-floor connectivity. <b>Offline</b> blocks all uploads; <b>Flaky</b> drops 40% of requests mid-flight so you can watch retries with exponential backoff. Device is currently{' '}
            <b className={online ? 'text-brand-600' : 'text-crit'}>{online ? 'online' : 'offline'}</b>.
          </p>
        </section>

        <h2 className="mt-6 mb-2 flex items-center justify-between px-1 text-xs font-bold tracking-wide text-ink-500 uppercase">
          Sync queue (outbox)
          <button className="inline-flex items-center gap-1 rounded-lg bg-ink-900 px-2.5 py-1 text-[11px] text-white normal-case" onClick={() => void syncEngine.syncNow()}>
            {status.running ? <Spinner className="size-3" /> : <RefreshCw className="size-3" />} {t('syncNow')}
          </button>
        </h2>
        <section className="card overflow-hidden">
          {!outbox?.length ? (
            <p className="p-4 text-sm text-ink-500">
              Queue empty — everything is on the server{status.lastSuccessAt ? ` (last upload ${relativeTime(status.lastSuccessAt, lang)})` : ''}.
            </p>
          ) : (
            <ul className="divide-y divide-ink-100 text-sm">
              {outbox.map((o) => (
                <li key={o.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${o.kind === 'photo' ? 'bg-sky-50 text-sky-700' : 'bg-violet-50 text-violet-700'}`}>{o.kind}</span>
                  <span className="flex-1 truncate font-mono text-xs text-ink-500">{o.refId.slice(0, 8)}</span>
                  <span className="text-right text-xs text-ink-500">
                    {o.attempts > 0 ? (
                      <>
                        attempt {o.attempts} · retry {relativeTime(o.nextAttemptAt, lang)}
                        <br />
                        <span className="text-crit">{o.lastError}</span>
                      </>
                    ) : (
                      'queued'
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <h2 className="mt-6 mb-2 px-1 text-xs font-bold tracking-wide text-ink-500 uppercase">Storage</h2>
        <section className="card divide-y divide-ink-100 text-sm">
          <div className="flex items-center gap-3 p-4">
            <HardDrive className="size-5 text-ink-400" />
            <span className="flex-1">Used on device</span>
            <span className="font-semibold tabular-nums">
              {storage.usage != null ? formatBytes(storage.usage) : '—'}
              {storage.quota ? <span className="font-normal text-ink-400"> / {formatBytes(storage.quota)}</span> : null}
            </span>
          </div>
          <div className="flex items-center gap-3 p-4">
            <Database className="size-5 text-ink-400" />
            <span className="flex-1">Persistent storage (no eviction)</span>
            <span className={`font-semibold ${storage.persisted ? 'text-brand-600' : 'text-amber-600'}`}>{storage.persisted ? 'Granted' : 'Best-effort'}</span>
          </div>
          <div className="flex items-center gap-3 p-4">
            <Database className="size-5 text-ink-400" />
            <span className="flex-1">{cloudEnabled ? 'Backend' : 'Inspections on (mock) server'}</span>
            <span className="font-semibold tabular-nums">{cloudEnabled ? 'Supabase' : (serverCount ?? '—')}</span>
          </div>
        </section>

        <button
          className="btn-ghost mt-6 w-full text-crit"
          onClick={async () => {
            if (!window.confirm('Delete all local data and reload the demo?')) return;
            await Promise.all([db.delete(), serverDb.delete()]);
            await signOut();
            location.href = '/';
          }}
        >
          <RotateCcw className="size-4" /> Reset demo data
        </button>
        <p className="mt-6 text-center text-[11px] text-ink-400">QC Inspect v0.1 · offline-first PWA prototype</p>
      </Page>
    </>
  );
}
