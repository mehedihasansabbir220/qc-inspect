import { useEffect, useState, type ReactNode } from 'react';
import { AlertOctagon, CheckCircle2, CloudOff, CloudUpload, Cloud, Loader2, XCircle } from 'lucide-react';
import type { Severity } from '../lib/defects';
import type { SyncState } from '../lib/db';
import type { Verdict } from '../lib/verdict';
import { useI18n } from '../lib/i18n';

export const SEVERITY_STYLE: Record<Severity, { text: string; bg: string; bar: string; ring: string }> = {
  critical: { text: 'text-crit', bg: 'bg-red-50', bar: 'bg-crit', ring: 'ring-red-200' },
  major: { text: 'text-major', bg: 'bg-orange-50', bar: 'bg-major', ring: 'ring-orange-200' },
  minor: { text: 'text-minor', bg: 'bg-yellow-50', bar: 'bg-minor', ring: 'ring-yellow-200' },
};

export function VerdictBadge({ verdict, status, size = 'sm' }: { verdict: Verdict; status?: 'draft' | 'completed'; size?: 'sm' | 'lg' }) {
  const { t } = useI18n();
  const big = size === 'lg';
  const cls = big ? 'px-3 py-1.5 text-sm gap-1.5' : 'px-2 py-0.5 text-xs gap-1';
  if (verdict === 'fail')
    return (
      <span className={`inline-flex items-center rounded-full bg-red-50 font-bold text-crit ring-1 ring-red-200 ${cls}`}>
        <XCircle className={big ? 'size-4' : 'size-3'} /> {t('fail')}
      </span>
    );
  if (verdict === 'pass')
    return (
      <span className={`inline-flex items-center rounded-full bg-brand-50 font-bold text-brand-600 ring-1 ring-emerald-200 ${cls}`}>
        <CheckCircle2 className={big ? 'size-4' : 'size-3'} /> {t('pass')}
      </span>
    );
  return (
    <span className={`inline-flex items-center rounded-full bg-ink-100 font-semibold text-ink-600 ring-1 ring-ink-200 ${cls}`}>
      {status === 'draft' ? t('draft') : t('in-progress')}
    </span>
  );
}

export function SyncIcon({ state, className = 'size-4' }: { state: SyncState; className?: string }) {
  switch (state) {
    case 'synced':
      return <Cloud className={`${className} text-brand-600`} aria-label="Synced" />;
    case 'pending':
      return <CloudUpload className={`${className} text-amber-500`} aria-label="Waiting to sync" />;
    case 'error':
      return <AlertOctagon className={`${className} text-crit`} aria-label="Sync error" />;
    default:
      return <CloudOff className={`${className} text-ink-400`} aria-label="On device only" />;
  }
}

export function Spinner({ className = 'size-4' }: { className?: string }) {
  return <Loader2 className={`${className} animate-spin`} />;
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] }) {
  return (
    <div className="seg" role="group">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Object URL for a Blob with automatic cleanup. */
export function useObjectUrl(blob?: Blob) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

export function relativeTime(ts: number, lang: 'en' | 'bn' = 'en') {
  const rtf = new Intl.RelativeTimeFormat(lang === 'bn' ? 'bn-BD' : 'en', { numeric: 'auto' });
  const diff = (ts - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}
