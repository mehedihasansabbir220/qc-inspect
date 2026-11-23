import { useEffect, useState } from 'react';
import { CheckCircle2, FileSpreadsheet, PlugZap, XCircle } from 'lucide-react';
import { getGoogleSettings, isConfigured, saveGoogleSettings, testGoogleConnection, type GoogleSettings } from '../lib/google';
import { Spinner } from './ui';

/** Settings: connect the company's Google Drive / Sheets through its Apps Script bridge. */
export function GoogleCard() {
  const [s, setS] = useState<GoogleSettings>({ url: '', token: '', auto: true });
  const [state, setState] = useState<{ kind: 'idle' | 'testing' | 'ok' | 'err'; msg?: string }>({ kind: 'idle' });

  useEffect(() => {
    void getGoogleSettings().then(setS);
  }, []);

  const save = (next: GoogleSettings) => {
    setS(next);
    void saveGoogleSettings(next);
  };

  async function test() {
    setState({ kind: 'testing' });
    try {
      await testGoogleConnection(s);
      setState({ kind: 'ok', msg: 'Connected to your Google script' });
    } catch (e) {
      setState({ kind: 'err', msg: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <>
      <h2 className="mt-6 mb-2 flex items-center gap-1.5 px-1 text-xs font-bold tracking-wide text-ink-500 uppercase">
        <FileSpreadsheet className="size-3.5" /> Google Workspace
      </h2>
      <section className="card space-y-3 p-4">
        <p className="text-sm text-ink-600">Completed reports go to <b>Google Drive</b> (a folder per buyer) and a row in a <b>Google Sheet</b>. Setup: README → “Google Workspace”.</p>
        <div>
          <label className="label" htmlFor="g-url">Web-app URL</label>
          <input id="g-url" className="field text-sm" placeholder="https://script.google.com/macros/s/…/exec" value={s.url} onChange={(e) => setS({ ...s, url: e.target.value.trim() })} onBlur={() => save(s)} />
        </div>
        <div>
          <label className="label" htmlFor="g-token">Token (same as in the script)</label>
          <input id="g-token" className="field text-sm" type="password" autoComplete="off" value={s.token} onChange={(e) => setS({ ...s, token: e.target.value })} onBlur={() => save(s)} />
        </div>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" className="size-5 accent-emerald-600" checked={s.auto} onChange={(e) => save({ ...s, auto: e.target.checked })} />
          Send every completed report automatically
        </label>
        <div className="flex items-center gap-3">
          <button className="btn-ghost !py-2 text-sm" onClick={() => void test()} disabled={!isConfigured(s) || state.kind === 'testing'}>
            {state.kind === 'testing' ? <Spinner /> : <PlugZap className="size-4" />} Test connection
          </button>
          {state.kind === 'ok' && (
            <span className="flex items-center gap-1 text-sm text-brand-600">
              <CheckCircle2 className="size-4" /> {state.msg}
            </span>
          )}
          {state.kind === 'err' && (
            <span className="flex items-center gap-1 text-sm text-crit">
              <XCircle className="size-4" /> {state.msg}
            </span>
          )}
        </div>
      </section>
    </>
  );
}
