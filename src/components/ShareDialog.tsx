import { useCallback, useEffect, useState } from 'react';
import { Check, CloudUpload, Copy, Download, Link2, Mail, MessageCircle, Pencil, Send, ShieldCheck, Trash2, Users, X } from 'lucide-react';
import type { Inspection } from '../lib/db';
import { RESULT_LABEL, overallOf, reportNumber } from '../lib/report';
import { createShare, listShares, shareUrl, updateShare, type ShareLink } from '../lib/share';
import { cloudEnabled, useSession } from '../lib/supabase';
import { syncEngine, useNetwork } from '../lib/sync';
import { AuthForm } from './AuthForm';
import { Spinner } from './ui';

interface Props {
  inspection: Inspection;
  /** What the user tapped "Send" on — the link always covers the report and its attachments. */
  subject: string;
  onClose: () => void;
}

function Toggle({ on, onChange, disabled, label, hint, icon }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string; hint: string; icon: React.ReactNode }) {
  return (
    <label className={`flex items-center gap-3 rounded-xl p-3 ring-1 transition ${on ? 'bg-brand-50 ring-emerald-200' : 'bg-ink-50 ring-ink-200'} ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
      <span className={`grid size-9 place-items-center rounded-lg ${on ? 'bg-brand-600 text-white' : 'bg-white text-ink-500'}`}>{icon}</span>
      <span className="flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-xs text-ink-500">{hint}</span>
      </span>
      <input type="checkbox" className="peer sr-only" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className={`relative h-6 w-11 rounded-full transition ${on ? 'bg-brand-600' : 'bg-ink-200'}`}>
        <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
    </label>
  );
}

export function ShareDialog({ inspection, subject, onClose }: Props) {
  const session = useSession();
  const { online } = useNetwork();
  const [canDownload, setCanDownload] = useState(true); // default: buyer preset
  const [canEdit, setCanEdit] = useState(false);
  const [links, setLinks] = useState<ShareLink[]>();
  const [newToken, setNewToken] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string>();
  const [error, setError] = useState<string>();
  const synced = inspection.syncState === 'synced';

  const refresh = useCallback(async () => {
    try {
      setLinks(await listShares(inspection.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [inspection.id]);

  useEffect(() => {
    if (cloudEnabled && session && online && synced) void refresh();
  }, [session, online, synced, refresh]);

  async function create() {
    setBusy(true);
    setError(undefined);
    try {
      const token = await createShare(inspection.id, { canDownload, canEdit });
      setNewToken(token);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, p: Parameters<typeof updateShare>[1]) {
    setLinks((ls) => ls?.map((l) => (l.id === id ? { ...l, ...p } : l)));
    try {
      await updateShare(id, p);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      void refresh();
    }
  }

  async function copy(token: string) {
    await navigator.clipboard?.writeText(shareUrl(token));
    setCopied(token);
    setTimeout(() => setCopied(undefined), 1800);
  }

  const overall = RESULT_LABEL[overallOf(inspection)];
  /** Professional message a buyer expects, ready for WhatsApp / e-mail. */
  const message = (token: string) =>
    [
      `Dear ${inspection.buyer ? `${inspection.buyer} team` : 'Sir / Madam'},`,
      '',
      `Please find the ${inspection.type === 'final' ? 'final random' : inspection.type} inspection report below.`,
      `Report: ${reportNumber(inspection)}`,
      `PO / Style: ${inspection.poNumber} / ${inspection.style} — ${inspection.productCategory}`,
      `Factory: ${inspection.factoryName ?? ''}`,
      `Overall result: ${overall}`,
      '',
      `Open the report (sign-in required): ${shareUrl(token)}`,
      '',
      'Best regards,',
      inspection.inspector,
    ].join('\n');
  const PRESETS = [
    { label: 'Buyer', hint: 'View + download', dl: true, ed: false },
    { label: 'QA colleague', hint: 'View + download + edit', dl: true, ed: true },
    { label: 'View only', hint: 'No download, no edit', dl: false, ed: false },
  ];

  let body: React.ReactNode;
  if (!cloudEnabled) {
    body = (
      <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-amber-200">
        Sending needs the cloud backend. Add your Supabase URL and key to <code>.env.local</code> (see README → “Supabase setup”) and restart the app.
      </p>
    );
  } else if (!session) {
    body = <AuthForm intro="Sign in to send reports. Recipients also sign in, so only the people you send it to can open it." />;
  } else if (!online) {
    body = <p className="rounded-xl bg-ink-100 p-4 text-sm text-ink-600">You’re offline. Sending needs a connection — the report is safe on this device.</p>;
  } else if (!synced) {
    body = (
      <div className="space-y-3 rounded-xl bg-ink-100 p-4 text-sm text-ink-600">
        <p>The report must reach the server before it can be sent{inspection.status === 'draft' ? ' — complete the inspection first, or it syncs with its attachments' : ''}.</p>
        <button className="btn-ghost w-full bg-white" onClick={() => void syncEngine.syncNow()}>
          <CloudUpload className="size-4" /> Sync now
        </button>
      </div>
    );
  } else {
    body = (
      <div className="space-y-4">
        <div>
          <span className="label">Who is it for?</span>
          <div className="grid grid-cols-3 gap-2">
            {PRESETS.map((p) => {
              const on = canDownload === p.dl && canEdit === p.ed;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => (setCanDownload(p.dl), setCanEdit(p.ed))}
                  className={`rounded-xl p-2.5 text-left ring-1 transition ${on ? 'bg-ink-900 text-white ring-ink-900' : 'bg-white ring-ink-200 hover:ring-ink-400'}`}
                >
                  <span className="block text-sm font-bold">{p.label}</span>
                  <span className={`block text-[11px] leading-tight ${on ? 'text-ink-300' : 'text-ink-500'}`}>{p.hint}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="space-y-2">
          <Toggle on icon={<ShieldCheck className="size-5" />} label="View" hint="Always on: open the report and preview PDFs in the app" onChange={() => {}} disabled />
          <Toggle on={canDownload} onChange={setCanDownload} icon={<Download className="size-5" />} label="Allow download" hint="Save the generated PDF and attached files" />
          <Toggle on={canEdit} onChange={setCanEdit} icon={<Pencil className="size-5" />} label="Allow edit" hint="Change defects, checklist & comments; add attachments" />
        </div>
        <button className="btn-brand w-full" onClick={create} disabled={busy}>
          {busy ? <Spinner /> : <Link2 className="size-4" />} Create link
        </button>

        {newToken && (
          <div className="animate-fade space-y-2 rounded-xl bg-ink-900 p-3 text-white">
            <div className="truncate rounded-lg bg-white/10 px-3 py-2 font-mono text-xs">{shareUrl(newToken)}</div>
            <div className="grid grid-cols-4 gap-2 text-xs font-semibold">
              <button className="flex flex-col items-center gap-1 rounded-lg bg-white/10 py-2" onClick={() => copy(newToken)}>
                {copied === newToken ? <Check className="size-4 text-emerald-300" /> : <Copy className="size-4" />} Copy
              </button>
              <a className="flex flex-col items-center gap-1 rounded-lg bg-white/10 py-2" href={`https://wa.me/?text=${encodeURIComponent(message(newToken))}`} target="_blank" rel="noreferrer">
                <MessageCircle className="size-4" /> WhatsApp
              </a>
              <a className="flex flex-col items-center gap-1 rounded-lg bg-white/10 py-2" href={`mailto:?subject=${encodeURIComponent(`QC report ${inspection.poNumber}`)}&body=${encodeURIComponent(message(newToken))}`}>
                <Mail className="size-4" /> Email
              </a>
              <button
                className="flex flex-col items-center gap-1 rounded-lg bg-white/10 py-2"
                onClick={() => navigator.share?.({ title: 'QC report', text: message(newToken), url: shareUrl(newToken) }).catch(() => {})}
              >
                <Send className="size-4" /> More
              </button>
            </div>
            <details className="rounded-lg bg-white/5 px-3 py-2 text-xs text-ink-300">
              <summary className="cursor-pointer font-semibold text-white">Message preview</summary>
              <pre className="mt-2 font-sans whitespace-pre-wrap">{message(newToken)}</pre>
            </details>
          </div>
        )}

        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold tracking-wide text-ink-500 uppercase">
            <Users className="size-3.5" /> Active links
          </h3>
          {!links ? (
            <Spinner />
          ) : links.filter((l) => !l.revoked).length === 0 ? (
            <p className="text-sm text-ink-500">Not shared yet.</p>
          ) : (
            <ul className="space-y-2">
              {links
                .filter((l) => !l.revoked)
                .map((l) => (
                  <li key={l.id} className="rounded-xl p-3 ring-1 ring-ink-200">
                    <div className="flex items-center gap-2">
                      <span className="flex-1 truncate font-mono text-xs text-ink-500">…/s/{l.token.slice(0, 10)}</span>
                      <button className="rounded-md p-1.5 text-ink-500 hover:bg-ink-100" onClick={() => copy(l.token)} aria-label="Copy link">
                        {copied === l.token ? <Check className="size-4 text-brand-600" /> : <Copy className="size-4" />}
                      </button>
                      <button className="rounded-md p-1.5 text-crit hover:bg-red-50" onClick={() => patch(l.id, { revoked: true })} aria-label="Revoke link" title="Revoke">
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                    <div className="mt-2 flex gap-2 text-xs">
                      <button
                        onClick={() => patch(l.id, { canDownload: !l.canDownload })}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold ring-1 ${l.canDownload ? 'bg-brand-50 text-brand-600 ring-emerald-200' : 'text-ink-400 ring-ink-200 line-through'}`}
                      >
                        <Download className="size-3" /> Download
                      </button>
                      <button
                        onClick={() => patch(l.id, { canEdit: !l.canEdit })}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold ring-1 ${l.canEdit ? 'bg-brand-50 text-brand-600 ring-emerald-200' : 'text-ink-400 ring-ink-200 line-through'}`}
                      >
                        <Pencil className="size-3" /> Edit
                      </button>
                    </div>
                    {l.members.length > 0 && (
                      <div className="mt-2 text-xs text-ink-500">Opened by: {l.members.map((m) => m.email ?? 'unknown').join(', ')}</div>
                    )}
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Send report">
      <div className="animate-fade absolute inset-0 bg-ink-950/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="animate-sheet pb-safe relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white px-5 pt-4 shadow-2xl sm:rounded-3xl sm:pb-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Send className="size-5" /> Send
            </h2>
            <p className="text-sm text-ink-500">{subject}</p>
            <p className="text-xs text-ink-400">The link opens the full report with all its attachments.</p>
          </div>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-full bg-ink-100" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        {error && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-crit">{error}</p>}
        {body}
        <div className="h-4" />
      </div>
    </div>
  );
}
