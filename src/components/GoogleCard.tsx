import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, CheckCircle2, ClipboardCopy, ExternalLink, FileSpreadsheet, PlugZap, XCircle } from 'lucide-react';
import { buildSetupScript, diagnoseUrl, getGoogleSettings, isConfigured, newToken, saveGoogleSettings, sheetIdFrom, testGoogleConnection, type GoogleSettings } from '../lib/google';
import { Spinner } from './ui';

function Step({ n, done, title, children }: { n: number; done: boolean; title: string; children?: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${done ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600'}`}>
        {done ? <Check className="size-4" strokeWidth={3} /> : n}
      </span>
      <div className="min-w-0 flex-1 pb-1">
        <div className="text-sm font-semibold">{title}</div>
        <div className="mt-1.5 space-y-2 text-sm text-ink-600">{children}</div>
      </div>
    </li>
  );
}

/**
 * Guided Google Drive / Sheets setup. The app writes the script for the user (their Sheet and a
 * secret token already inside), so in Google they only paste, save and deploy.
 */
export function GoogleCard() {
  const [s, setS] = useState<GoogleSettings>({ url: '', token: '', auto: true });
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState<string>(); // shown when the browser blocks automatic copying
  const [state, setState] = useState<{ kind: 'idle' | 'testing' | 'ok' | 'err'; msg?: string }>({ kind: 'idle' });

  useEffect(() => {
    void getGoogleSettings().then((g) => setS(g.token ? g : { ...g, token: newToken() }));
  }, []);

  const save = (next: GoogleSettings) => {
    setS(next);
    void saveGoogleSettings(next);
  };

  async function test(next = s) {
    setState({ kind: 'testing' });
    try {
      await testGoogleConnection(next);
      setState({ kind: 'ok', msg: 'Connected! Completed reports will now go to Google.' });
    } catch (e) {
      setState({ kind: 'err', msg: e instanceof Error ? e.message : String(e) });
    }
  }

  async function copyScript() {
    const next = { ...s, token: s.token || newToken() };
    save(next);
    const code = buildSetupScript(next.token, next.sheetUrl);
    try {
      await navigator.clipboard.writeText(code);
      setManual(undefined);
      setCopied(true);
    } catch {
      // Some browsers / phones block clipboard access — let the user copy it by hand.
      setManual(code);
    }
  }

  const sheetOk = !!sheetIdFrom(s.sheetUrl);
  const urlProblem = diagnoseUrl(s.url);
  const connected = state.kind === 'ok';

  return (
    <>
      <h2 className="mt-6 mb-2 flex items-center gap-1.5 px-1 text-xs font-bold tracking-wide text-ink-500 uppercase">
        <FileSpreadsheet className="size-3.5" /> Google Drive & Sheets
      </h2>
      <section className="card p-4">
        <p className="mb-4 text-sm text-ink-600">
          Every completed report is saved as a PDF in your Google Drive (a folder per buyer) and as a row in your Google Sheet. One-time setup, about 3 minutes, on a laptop.
        </p>

        <ol className="space-y-4">
          <Step n={1} done={sheetOk} title="Your Google Sheet (optional)">
            <input
              className="field !py-2.5 text-sm"
              placeholder="Paste your Sheet link: docs.google.com/spreadsheets/…"
              value={s.sheetUrl ?? ''}
              onChange={(e) => setS({ ...s, sheetUrl: e.target.value.trim() })}
              onBlur={() => save(s)}
              aria-label="Google Sheet link"
            />
            <p className="text-xs text-ink-500">{s.sheetUrl && !sheetOk ? '⚠️ That doesn’t look like a Google Sheet link.' : 'Leave empty and a new Sheet is created for you in Drive.'}</p>
          </Step>

          <Step n={2} done={copied} title="Copy the setup script">
            <button className="btn-primary !py-2.5 text-sm" onClick={() => void copyScript()}>
              {copied ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />} {copied ? 'Copied: your Sheet and secret are inside' : 'Copy setup script'}
            </button>
            {manual && (
              <div className="space-y-1.5">
                <p className="text-xs text-amber-800">Your browser blocked automatic copying. Tap in the box, select all (Ctrl/⌘ + A), copy (Ctrl/⌘ + C):</p>
                <textarea
                  readOnly
                  value={manual}
                  onFocus={(e) => e.currentTarget.select()}
                  onCopy={() => setCopied(true)}
                  className="h-28 w-full rounded-lg border border-ink-200 bg-ink-50 p-2 font-mono text-[11px]"
                  aria-label="Setup script"
                />
              </div>
            )}
          </Step>

          <Step n={3} done={false} title="Paste it into Google Apps Script">
            <a className="btn-ghost !py-2.5 text-sm" href="https://script.new" target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" /> Open Google Apps Script
            </a>
            <p className="text-xs">In the page that opens: select all the sample code (Ctrl/⌘ + A), <b>paste</b> (Ctrl/⌘ + V), then click <b>💾 Save</b>.</p>
          </Step>

          <Step n={4} done={false} title="Deploy it">
            <p className="text-xs leading-relaxed">
              Top right: <b>Deploy → New deployment</b> → click ⚙ next to “Select type” → <b>Web app</b> → “Who has access”: <b>Anyone</b> → <b>Deploy</b> → <b>Authorize</b>.
              <br />
              If Google says “hasn’t verified this app”: <b>Advanced → Go to (project name)</b> → <b>Allow</b>. Then <b>copy the Web app URL</b>.
            </p>
          </Step>

          <Step n={5} done={connected} title="Paste the Web app URL here">
            <input
              id="g-url"
              className="field !py-2.5 text-sm"
              placeholder="https://script.google.com/macros/s/…/exec"
              value={s.url}
              onChange={(e) => setS({ ...s, url: e.target.value.trim() })}
              onBlur={() => {
                save(s);
                if (isConfigured(s)) void test(s);
              }}
              aria-label="Web app URL"
            />
            {urlProblem && (
              <p className="flex gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900 ring-1 ring-amber-200" role="alert">
                <AlertTriangle className="size-4 shrink-0" /> {urlProblem}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <button className="btn-ghost !py-2 text-sm" onClick={() => void test()} disabled={!isConfigured(s) || state.kind === 'testing'}>
                {state.kind === 'testing' ? <Spinner /> : <PlugZap className="size-4" />} Test connection
              </button>
              {state.kind === 'ok' && (
                <span className="flex items-center gap-1 text-sm font-semibold text-brand-600">
                  <CheckCircle2 className="size-4" /> {state.msg}
                </span>
              )}
              {state.kind === 'err' && (
                <span className="flex items-center gap-1 text-sm text-crit">
                  <XCircle className="size-4" /> {state.msg}
                </span>
              )}
            </div>
          </Step>
        </ol>

        <label className="mt-4 flex items-center gap-3 border-t border-ink-100 pt-3 text-sm">
          <input type="checkbox" className="size-5 accent-emerald-600" checked={s.auto} onChange={(e) => save({ ...s, auto: e.target.checked })} />
          Send every completed report automatically
        </label>
      </section>
    </>
  );
}
