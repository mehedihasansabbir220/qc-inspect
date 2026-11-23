import { useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { CheckCircle2, RefreshCw } from 'lucide-react';
import { seedIfEmpty } from './lib/seed';
import { network, syncEngine } from './lib/sync';
import { InspectionsList } from './pages/InspectionsList';
import { NewInspection } from './pages/NewInspection';
import { Inspect } from './pages/Inspect';
import { Report } from './pages/Report';
import { Insights } from './pages/Insights';
import { Settings } from './pages/Settings';
import { SharedLink } from './pages/SharedLink';

function PwaToast() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    // Check for a new version every 30 minutes while the app stays open (e.g. a long inspection day)
    onRegisteredSW(_url, reg) {
      if (reg) setInterval(() => void reg.update(), 30 * 60_000);
    },
  });

  useEffect(() => {
    if (!offlineReady) return;
    const timer = setTimeout(() => setOfflineReady(false), 4000);
    return () => clearTimeout(timer);
  }, [offlineReady, setOfflineReady]);

  if (!offlineReady && !needRefresh) return null;
  return (
    <div className="no-print animate-fade fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
      <div className="flex items-center gap-3 rounded-2xl bg-ink-900 px-4 py-3 text-sm text-white shadow-xl">
        {needRefresh ? (
          <>
            <RefreshCw className="size-4 text-emerald-300" /> New version available
            <button className="rounded-lg bg-white/10 px-2.5 py-1 font-semibold" onClick={() => updateServiceWorker(true)}>
              Reload
            </button>
          </>
        ) : (
          <>
            <CheckCircle2 className="size-4 text-emerald-300" /> Ready to work offline
          </>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    seedIfEmpty().finally(() => setReady(true));
    // Ask the browser not to evict our IndexedDB under storage pressure
    void navigator.storage?.persist?.();
    return syncEngine.start((cb) => network.subscribe(cb));
  }, []);

  if (!ready) return null;

  return (
    <>
      <Routes>
        <Route path="/" element={<InspectionsList />} />
        <Route path="/new" element={<NewInspection />} />
        <Route path="/inspect/:id" element={<Inspect />} />
        <Route path="/report/:id" element={<Report />} />
        <Route path="/insights" element={<Insights />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/s/:token" element={<SharedLink />} />
        <Route path="*" element={<InspectionsList />} />
      </Routes>
      <PwaToast />
    </>
  );
}
