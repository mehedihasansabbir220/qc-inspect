import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, CheckCircle2, CloudUpload, Download, Eye, FileText, Lock, Paperclip, Pencil, Send, Trash2, Upload, Users, XCircle } from 'lucide-react';
import { TopBar } from '../components/AppShell';
import { PdfViewer } from '../components/PdfViewer';
import { ShareDialog } from '../components/ShareDialog';
import { SEVERITY_STYLE, Spinner, SyncIcon, useObjectUrl } from '../components/ui';
import { CHECKLIST, defectByCode } from '../lib/defects';
import { db, type Photo } from '../lib/db';
import { useI18n } from '../lib/i18n';
import { downloadBlob, reportFileName } from '../lib/files';
import { formatBytes } from '../lib/photos';
import { accessOf, addAttachment, removeAttachment, updateInspection } from '../lib/repo';
import { tally } from '../lib/verdict';

function ReportPhoto({ photo, caption }: { photo: Photo; caption: string }) {
  const url = useObjectUrl(photo.blob);
  return (
    <figure className="overflow-hidden rounded-xl bg-ink-100 ring-1 ring-ink-200">
      {url && <img src={url} alt={caption} className="aspect-[4/3] w-full object-cover" />}
      <figcaption className="flex justify-between gap-2 px-2 py-1.5 text-[11px] text-ink-600">
        <span className="truncate">{caption}</span>
        <span className="shrink-0 text-ink-400" title={`Original ${formatBytes(photo.originalBytes)}`}>
          {formatBytes(photo.bytes)}
        </span>
      </figcaption>
    </figure>
  );
}

export function Report() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { t, pick, lang } = useI18n();
  const insp = useLiveQuery(() => db.inspections.get(id), [id]);
  const factory = useLiveQuery(() => (insp ? db.factories.get(insp.factoryId) : undefined), [insp?.factoryId]);
  const photos = useLiveQuery(() => db.photos.where('inspectionId').equals(id).toArray(), [id]);
  const attachments = useLiveQuery(() => db.attachments.where('inspectionId').equals(id).toArray(), [id]);
  const [preview, setPreview] = useState<{ blob: Blob; name: string }>();
  const [sending, setSending] = useState<string>();
  const [generating, setGenerating] = useState<'preview' | 'download'>();
  const [uploadError, setUploadError] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  if (!insp) return null;

  const access = accessOf(insp);
  const isOwner = access.role === 'owner';
  const factoryName = insp.factoryName ?? factory?.name ?? '—';

  const c = tally(insp.defects);
  const { plan } = insp;
  const pass = insp.verdict === 'pass';
  const photoCaption = new Map<string, string>();
  for (const d of insp.defects) for (const p of d.photoIds) photoCaption.set(p, defectByCode.get(d.code)?.en ?? d.code);

  const byCode = new Map<string, { code: string; critical: number; major: number; minor: number }>();
  for (const d of insp.defects) {
    const row = byCode.get(d.code) ?? { code: d.code, critical: 0, major: 0, minor: 0 };
    row[d.severity] += d.qty;
    byCode.set(d.code, row);
  }

  const dateFmt = new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const savedBytes = (photos ?? []).reduce((n, p) => n + p.originalBytes - p.bytes, 0);

  /** The report PDF is generated on demand from live data, so it always reflects the latest edits. */
  async function generate(mode: 'preview' | 'download') {
    setGenerating(mode);
    try {
      const photoOrder = insp!.defects.flatMap((d) => d.photoIds);
      const ordered = photoOrder.map((pid) => photos?.find((p) => p.id === pid)).filter((p): p is Photo => !!p);
      const { buildReportPdf } = await import('../lib/pdf'); // lazy: jsPDF only loads when needed
      const blob = await buildReportPdf(insp!, factoryName, ordered);
      const name = reportFileName(insp!);
      if (mode === 'download') downloadBlob(blob, name);
      else setPreview({ blob, name });
    } finally {
      setGenerating(undefined);
    }
  }

  async function onUpload(files: FileList | null) {
    if (!files?.length) return;
    setUploadError(undefined);
    setUploading(true);
    try {
      for (const f of Array.from(files)) await addAttachment(insp!.id, f);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <TopBar
        title={t('viewReport')}
        subtitle={`${insp.poNumber} · ${insp.style}`}
        left={
          <button onClick={() => navigate('/')} className="-ml-1 grid size-9 place-items-center rounded-lg hover:bg-white/10" aria-label="Back">
            <ArrowLeft className="size-5" />
          </button>
        }
      />
      <main className="mx-auto max-w-2xl space-y-4 px-4 pt-4 pb-16">
        {!isOwner && (
          <div className="no-print flex items-center gap-3 rounded-2xl bg-sky-50 p-3 text-sm text-sky-900 ring-1 ring-sky-200">
            <Users className="size-5 shrink-0" />
            <div className="min-w-0 flex-1">
              Shared by <b>{access.ownerEmail ?? 'a colleague'}</b>
              <div className="text-xs text-sky-700">
                View{access.canDownload ? ' · Download' : ''}
                {access.canEdit ? ' · Edit' : ''}
              </div>
            </div>
          </div>
        )}

        <div className="no-print grid grid-cols-4 gap-2">
          <button className="btn-primary col-span-2 !px-2" onClick={() => generate('preview')} disabled={!!generating}>
            {generating === 'preview' ? <Spinner /> : <Eye className="size-4" />} Preview PDF
          </button>
          {access.canDownload ? (
            <button className="btn-ghost !px-2" onClick={() => generate('download')} disabled={!!generating} title="Download PDF">
              {generating === 'download' ? <Spinner /> : <Download className="size-4" />}
            </button>
          ) : (
            <span className="btn-ghost cursor-not-allowed !px-2 opacity-50" title="Download not permitted">
              <Lock className="size-4" />
            </span>
          )}
          {isOwner ? (
            <button className="btn-brand !px-2" onClick={() => setSending('Inspection report + attachments')}>
              <Send className="size-4" /> Send
            </button>
          ) : (
            <span />
          )}
        </div>

        <div className="no-print flex gap-2">
          {access.canEdit && insp.status === 'completed' && (
            <button
              className="btn-ghost w-full"
              title="Reopen to edit"
              onClick={async () => {
                await updateInspection(insp.id, { status: 'draft', syncState: 'local' });
                navigate(`/inspect/${insp.id}`);
              }}
            >
              <Pencil className="size-4" /> Edit inspection
            </button>
          )}
        </div>

        <section className={`overflow-hidden rounded-2xl text-white ${pass ? 'bg-gradient-to-br from-emerald-600 to-emerald-800' : insp.verdict === 'fail' ? 'bg-gradient-to-br from-red-600 to-red-800' : 'bg-ink-800'}`}>
          <div className="flex items-center gap-4 p-5">
            {pass ? <CheckCircle2 className="size-14 shrink-0" strokeWidth={1.5} /> : <XCircle className="size-14 shrink-0" strokeWidth={1.5} />}
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold tracking-widest uppercase opacity-80">
                {t(insp.type)} · AQL {plan.major.aql}/{plan.minor.aql}
              </div>
              <div className="text-3xl font-black tracking-tight">{insp.verdict === 'in-progress' ? t('in-progress') : t(insp.verdict).toUpperCase()}</div>
              <div className="truncate text-sm opacity-90">{factoryName}</div>
            </div>
          </div>
          <div className="grid grid-cols-4 divide-x divide-white/15 border-t border-white/15 bg-black/10 text-center">
            {[
              [t('sample'), `${insp.inspected}/${plan.sampleSize}`],
              [t('critical'), `${c.critical}/${plan.critical.ac}`],
              [t('major'), `${c.major}/${plan.major.ac}`],
              [t('minor'), `${c.minor}/${plan.minor.ac}`],
            ].map(([k, v]) => (
              <div key={k} className="py-2.5">
                <div className="text-lg font-bold tabular-nums">{v}</div>
                <div className="text-[10px] font-semibold uppercase opacity-75">{k}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="card grid grid-cols-2 gap-x-4 gap-y-3 p-4 text-sm">
          {[
            [t('poNumber'), insp.poNumber],
            [t('style'), insp.style],
            [t('product'), insp.productCategory],
            [t('lotSize'), insp.lotSize.toLocaleString()],
            ['Level / code', `${plan.level} / ${plan.codeLetter}`],
            [t('inspector'), insp.inspector],
            ['Completed', insp.completedAt ? dateFmt.format(insp.completedAt) : '—'],
            [
              'Sync',
              <span key="s" className="inline-flex items-center gap-1.5">
                <SyncIcon state={insp.syncState} /> {insp.syncState === 'synced' && insp.syncedAt ? dateFmt.format(insp.syncedAt) : insp.syncState}
              </span>,
            ],
          ].map(([k, v], i) => (
            <div key={i}>
              <div className="text-[11px] font-semibold text-ink-400 uppercase">{k}</div>
              <div className="font-medium">{v}</div>
            </div>
          ))}
        </section>

        <section className="card overflow-hidden">
          <h3 className="px-4 pt-4 font-semibold">{t('defects')}</h3>
          {byCode.size === 0 ? (
            <p className="p-4 text-sm text-ink-500">{t('noDefects')}</p>
          ) : (
            <table className="mt-2 w-full text-sm">
              <thead className="text-left text-[11px] text-ink-400 uppercase">
                <tr>
                  <th className="px-4 py-2 font-semibold">Defect</th>
                  {(['critical', 'major', 'minor'] as const).map((s) => (
                    <th key={s} className={`w-14 py-2 text-center font-semibold ${SEVERITY_STYLE[s].text}`}>
                      {t(s)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {[...byCode.values()].map((r) => {
                  const def = defectByCode.get(r.code);
                  return (
                    <tr key={r.code}>
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{def ? pick(def) : r.code}</div>
                        <div className="text-[11px] text-ink-400">{r.code}</div>
                      </td>
                      {(['critical', 'major', 'minor'] as const).map((s) => (
                        <td key={s} className="text-center font-semibold tabular-nums">
                          {r[s] || <span className="text-ink-200">·</span>}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <section className="card p-4">
          <h3 className="font-semibold">{t('measure')}</h3>
          <div className="mt-2 space-y-2 text-sm">
            {insp.measurements.map((m) => (
              <div key={m.pom} className="flex items-center gap-2">
                <span className="flex-1 truncate">{m.pom}</span>
                <span className="text-xs text-ink-400 tabular-nums">
                  {m.spec}±{m.tol}
                </span>
                <div className="flex gap-1">
                  {m.values.map((v, i) => {
                    const bad = v != null && Math.abs(v - m.spec) > m.tol;
                    return (
                      <span key={i} className={`w-11 rounded-md py-0.5 text-center text-xs font-semibold tabular-nums ${v == null ? 'bg-ink-50 text-ink-300' : bad ? 'bg-red-50 text-crit' : 'bg-brand-50 text-brand-600'}`}>
                        {v ?? '—'}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-4">
          <h3 className="font-semibold">{t('checklist')}</h3>
          <ul className="mt-2 space-y-1.5 text-sm">
            {CHECKLIST.map((ci) => {
              const v = insp.checklist[ci.id];
              return (
                <li key={ci.id} className="flex items-center gap-2">
                  <span className={`w-10 rounded-md py-0.5 text-center text-[11px] font-bold ${v === 'ok' ? 'bg-brand-50 text-brand-600' : v === 'nok' ? 'bg-red-50 text-crit' : 'bg-ink-100 text-ink-500'}`}>
                    {v ? v.toUpperCase() : '—'}
                  </span>
                  {pick(ci)}
                </li>
              );
            })}
          </ul>
        </section>

        {insp.comments && (
          <section className="card p-4">
            <h3 className="font-semibold">{t('comments')}</h3>
            <p className="mt-1 text-sm whitespace-pre-wrap text-ink-600">{insp.comments}</p>
          </section>
        )}

        <section className="card p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 font-semibold">
              <Paperclip className="size-4" /> Attached reports
            </h3>
            {access.canEdit && (
              <button className="no-print inline-flex items-center gap-1.5 rounded-lg bg-ink-100 px-3 py-1.5 text-sm font-semibold hover:bg-ink-200" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Spinner /> : <Upload className="size-4" />} Upload PDF
              </button>
            )}
            <input ref={fileRef} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => (void onUpload(e.target.files), (e.target.value = ''))} />
          </div>
          {uploadError && <p className="mt-2 text-sm text-crit">{uploadError}</p>}
          {!attachments?.length ? (
            <p className="mt-2 text-sm text-ink-500">
              {access.canEdit ? 'Attach existing reports — e.g. a third-party inspection or lab test PDF.' : 'No attachments.'}
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-ink-100">
              {attachments.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2.5">
                  <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-red-50 text-crit">
                    <FileText className="size-5" />
                  </div>
                  <button className="min-w-0 flex-1 text-left" onClick={() => setPreview({ blob: a.blob, name: a.name })}>
                    <div className="truncate text-sm font-semibold">{a.name}</div>
                    <div className="flex items-center gap-1 text-xs text-ink-500">
                      {formatBytes(a.bytes)}
                      {!a.uploaded && (
                        <span className="inline-flex items-center gap-0.5 text-amber-600">
                          · <CloudUpload className="size-3" /> waiting to upload
                        </span>
                      )}
                    </div>
                  </button>
                  <div className="no-print flex">
                    <button className="grid size-9 place-items-center rounded-lg text-ink-500 hover:bg-ink-100" onClick={() => setPreview({ blob: a.blob, name: a.name })} aria-label="Preview">
                      <Eye className="size-4" />
                    </button>
                    {access.canDownload && (
                      <button className="grid size-9 place-items-center rounded-lg text-ink-500 hover:bg-ink-100" onClick={() => downloadBlob(a.blob, a.name)} aria-label="Download">
                        <Download className="size-4" />
                      </button>
                    )}
                    {isOwner && (
                      <button className="grid size-9 place-items-center rounded-lg text-ink-500 hover:bg-ink-100" onClick={() => setSending(a.name)} aria-label="Send">
                        <Send className="size-4" />
                      </button>
                    )}
                    {access.canEdit && (
                      <button className="grid size-9 place-items-center rounded-lg text-ink-400 hover:bg-red-50 hover:text-crit" onClick={() => removeAttachment(insp.id, a.id)} aria-label="Remove">
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {photos && photos.length > 0 && (
          <section className="card p-4">
            <div className="flex items-baseline justify-between">
              <h3 className="font-semibold">Photos ({photos.length})</h3>
              {savedBytes > 0 && <span className="text-xs text-ink-400">{formatBytes(savedBytes)} saved by on-device compression</span>}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {photos.map((p) => (
                <ReportPhoto key={p.id} photo={p} caption={photoCaption.get(p.id) ?? ''} />
              ))}
            </div>
          </section>
        )}
      </main>
      {preview && <PdfViewer blob={preview.blob} name={preview.name} canDownload={access.canDownload} onClose={() => setPreview(undefined)} />}
      {sending && <ShareDialog inspection={insp} subject={sending} onClose={() => setSending(undefined)} />}
    </>
  );
}
