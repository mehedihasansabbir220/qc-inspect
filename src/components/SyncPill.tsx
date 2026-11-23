import { useLiveQuery } from 'dexie-react-hooks';
import { RefreshCw, WifiOff, Zap } from 'lucide-react';
import { db } from '../lib/db';
import { useI18n } from '../lib/i18n';
import { syncEngine, useNetwork, useSyncStatus } from '../lib/sync';
import { Spinner } from './ui';

export function usePendingCount() {
  return useLiveQuery(() => db.outbox.count(), [], 0);
}

export function SyncPill() {
  const { t } = useI18n();
  const { online, mode } = useNetwork();
  const { running } = useSyncStatus();
  const pending = usePendingCount();

  let content;
  let tone;
  if (!online) {
    tone = 'bg-ink-800 text-ink-200 ring-ink-600';
    content = (
      <>
        <WifiOff className="size-3.5" /> {t('offline')}
        {pending > 0 && <span className="rounded-full bg-amber-400 px-1.5 text-[11px] font-bold text-ink-900">{pending}</span>}
      </>
    );
  } else if (running) {
    tone = 'bg-sky-500/15 text-sky-200 ring-sky-400/30';
    content = (
      <>
        <Spinner className="size-3.5" /> {t('syncing')} {pending > 0 && pending}
      </>
    );
  } else if (pending > 0) {
    tone = 'bg-amber-400/15 text-amber-200 ring-amber-300/30';
    content = (
      <>
        <RefreshCw className="size-3.5" /> {pending} {t('pending')}
      </>
    );
  } else {
    tone = 'bg-brand-500/15 text-emerald-200 ring-emerald-400/30';
    content = (
      <>
        <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_0_3px_rgb(52_211_153/0.25)]" /> {t('allSynced')}
      </>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void syncEngine.syncNow()}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition ${tone}`}
      title={t('syncNow')}
    >
      {content}
      {mode === 'flaky' && online && <Zap className="size-3.5 text-amber-300" aria-label="Flaky network simulation" />}
    </button>
  );
}
