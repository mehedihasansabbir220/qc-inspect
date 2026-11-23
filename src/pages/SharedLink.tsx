import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Lock } from 'lucide-react';
import { TopBar } from '../components/AppShell';
import { AuthForm } from '../components/AuthForm';
import { Spinner } from '../components/ui';
import { db } from '../lib/db';
import { redeemShare } from '../lib/share';
import { cloudEnabled, useSession } from '../lib/supabase';
import { syncEngine, useNetwork } from '../lib/sync';

/** Landing page for a share link: /s/:token → sign in → join → pull the report → open it. */
export function SharedLink() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const session = useSession();
  const { online } = useNetwork();
  const [error, setError] = useState<string>();
  const [step, setStep] = useState<string>();

  useEffect(() => {
    if (!cloudEnabled || !session || !online) return;
    let cancelled = false;
    (async () => {
      try {
        setStep('Checking link…');
        const id = await redeemShare(token);
        setStep('Downloading report…');
        await syncEngine.syncNow();
        for (let i = 0; i < 20 && !(await db.inspections.get(id)); i++) {
          await new Promise((r) => setTimeout(r, 500));
          if (i % 4 === 3) await syncEngine.syncNow();
        }
        if (!cancelled) navigate(`/report/${id}`, { replace: true });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, session, online, navigate]);

  return (
    <>
      <TopBar title="Shared QC report" />
      <main className="mx-auto max-w-md px-4 pt-8">
        <div className="card p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-xl bg-ink-900 text-emerald-300">
              <Lock className="size-5" />
            </div>
            <div>
              <h1 className="font-bold">A QC report was shared with you</h1>
              <p className="text-sm text-ink-500">Reports contain confidential brand data, so recipients sign in.</p>
            </div>
          </div>
          {!cloudEnabled ? (
            <p className="text-sm text-ink-600">This installation has no cloud backend configured.</p>
          ) : error ? (
            <p className="flex gap-2 rounded-xl bg-red-50 p-3 text-sm text-crit">
              <AlertTriangle className="size-5 shrink-0" /> {error}
            </p>
          ) : !online ? (
            <p className="text-sm text-ink-600">You’re offline. Connect to the internet to open this link.</p>
          ) : !session ? (
            <AuthForm />
          ) : (
            <p className="flex items-center gap-2 text-sm text-ink-600">
              <Spinner /> {step}
            </p>
          )}
        </div>
      </main>
    </>
  );
}
