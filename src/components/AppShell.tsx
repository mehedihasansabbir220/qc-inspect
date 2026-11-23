import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { BarChart3, ClipboardList, Plus, Settings2, ShieldCheck } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { SyncPill } from './SyncPill';

export function TopBar({ title, subtitle, left, right }: { title: ReactNode; subtitle?: ReactNode; left?: ReactNode; right?: ReactNode }) {
  return (
    <header className="no-print sticky top-0 z-30 bg-ink-900 text-white" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
        {left ?? (
          <div className="grid size-8 place-items-center rounded-lg bg-brand-500/15 text-emerald-300">
            <ShieldCheck className="size-5" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] leading-tight font-semibold">{title}</div>
          {subtitle && <div className="truncate text-xs text-ink-400">{subtitle}</div>}
        </div>
        {right}
        <SyncPill />
      </div>
    </header>
  );
}

export function BottomNav() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const item = ({ isActive }: { isActive: boolean }) =>
    `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold transition ${isActive ? 'text-ink-900' : 'text-ink-400'}`;
  return (
    <nav className="no-print pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-end px-2">
        <NavLink to="/" end className={item}>
          <ClipboardList className="size-6" />
          {t('inspections')}
        </NavLink>
        <NavLink to="/insights" className={item}>
          <BarChart3 className="size-6" />
          {t('insights')}
        </NavLink>
        <div className="flex flex-1 justify-center">
          <button
            onClick={() => navigate('/new')}
            className="-mt-6 grid size-14 place-items-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-emerald-600/30 transition active:scale-95"
            aria-label={t('newInspection')}
          >
            <Plus className="size-7" strokeWidth={2.5} />
          </button>
        </div>
        <NavLink to="/settings" className={item}>
          <Settings2 className="size-6" />
          {t('settings')}
        </NavLink>
      </div>
    </nav>
  );
}

export function Page({ children, nav = true }: { children: ReactNode; nav?: boolean }) {
  return (
    <>
      <main className={`mx-auto max-w-2xl px-4 pt-4 ${nav ? 'pb-28' : 'pb-10'}`}>{children}</main>
      {nav && <BottomNav />}
    </>
  );
}
