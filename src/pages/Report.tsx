import { useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, CheckCircle2, Clock, CloudUpload, Download, Eye, FileText, Lock, Paperclip, Pencil, Send, Trash2, Upload, Users, XCircle } from 'lucide-react';
import { TopBar } from '../components/AppShell';
import { PdfViewer } from '../components/PdfViewer';
import { ShareDialog } from '../components/ShareDialog';
import { RESULT_TONE, ResultPill, SEVERITY_STYLE, Spinner, SyncIcon, useObjectUrl } from '../components/ui';
import { CHECKLIST, defectByCode } from '../lib/defects';
import { db, type Photo } from '../lib/db';
import { downloadBlob, reportFileName } from '../lib/files';
import { useI18n } from '../lib/i18n';
import { formatBytes } from '../lib/photos';
import { DISCLAIMER, RESULT_LABEL, overallOf, reportNumber, reportSections } from '../lib/report';
import { accessOf, addAttachment, removeAttachment, updateInspection } from '../lib/repo';
import { tally } from '../lib/verdict';

function Thumb({ photo, className = 'size-12' }: { photo?: Photo; className?: string }) {
  const url = useObjectUrl(photo?.blob);
  return <div className={`${className} shrink-0 overflow-hidden rounded-lg bg-ink-100`}>{url && <img src={url} alt="" className="size-full object-cover" />}</div>;
}

function Card({ n, title, right, children }: { n?: string; title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="card overflow-hidden">
      <header className="flex items-center gap-2 border-b border-ink-100 px-4 py-3">
        {n && <span className="grid size-6 place-items-center rounded-md bg-ink-900 text-[11px] font-bold text-white">{n}</span>}
        <h3 className="flex-1 text-sm font-bold tracking-wide uppercase">{title}</h3>
        {right}
      </header>
      {children}
    </section>
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
  const company = useLiveQuery(async () => ((await db.settings.get('companyName'))?.value as string | undefined) || 'QC Inspect', []);
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
  const sections = reportSections(insp);
  const overall = overallOf(insp);
  const reportNo = reportNumber(insp);
  const photoById = new Map((photos ?? []).map((p) => [p.id, p]));
  const orderedPhotos = insp.defects.flatMap((d) => d.photoIds).map((pid) => photoById.get(pid)).filter((p): p is Photo => !!p);
  const dateFmt = new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', { dateStyle: 'medium' });

  /** The PDF is generated on demand from live data, so it always reflects the latest edits. */
  async function generate(mode: 'preview' | 'download') {
    setGenerating(mode);
    try {
      const { buildReportPdf } = await import('../lib/pdf'); // lazy: jsPDF only loads when needed
      const blob = await buildReportPdf(insp!, { factoryName, companyName: company ?? 'QC Inspect', photos: orderedPhotos });
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

  const HeroIcon = overall === 'pass' ? CheckCircle2 : overall === 'fail' ? XCircle : Clock;
  const info: [string, ReactNode][] = [
    [t('buyer'), insp.buyer || '—'],
    ['Supplier / factory', factoryName],
    ['Factory location', insp.factoryLocation || factory?.location || '—'],
    ['Inspection date', dateFmt.format(insp.completedAt ?? insp.updatedAt)],
    [t('poNumber'), insp.poNumber],
    [t('style'), insp.style],
    [t('product'), insp.productCategory],
    [t('inspectionType'), t(insp.type)],
    [t('inspector'), insp.inspector || '—'],
    [t('factoryRep'), insp.factoryRep || '—'],
    ['Sampling', `Level ${plan.level} · code ${plan.codeLetter} · ${plan.sampleSize} pcs of ${insp.lotSize.toLocaleString()}`],
    [
      'Sync',
      <span key="s" className="inline-flex items-center gap-1.5">
        <SyncIcon state={insp.syncState} /> {insp.syncState === 'synced' ? 'On server' : insp.syncState === 'pending' ? 'Waiting to upload' : insp.syncState === 'error' ? 'Sync problem' : 'On this device'}
      </span>,
    ],
  ];

  return (
    <>
      <TopBar
        title={t('viewReport')}
        subtitle={reportNo}
        left={
          <button onClick={() => navigate('/')} className="-ml-1 grid size-9 place-items-center rounded-lg hover:bg-white/10" aria-label="Back">
            <ArrowLeft className="size-5" />
          </button>
        }
      />
      <main className="mx-auto max-w-2xl space-y-4 px-4 pt-4 pb-32">
        {!isOwner && (
          <div className="flex items-center gap-3 rounded-2xl bg-sky-50 p-3 text-sm text-sky-900 ring-1 ring-sky-200">
            <Users className="size-5 shrink-0" />
            <div className="min-w-0 flex-1">
              Shared with you by <b>{access.ownerEmail ?? 'a colleague'}</b>
              <div className="text-xs text-sky-700">
                You can: view{access.canDownload ? ' · download' : ''}
                {access.canEdit ? ' · edit' : ''}
              </div>
            </div>
          </div>
        )}

        {/* Hero: overall result */}
        <section className={`overflow-hidden rounded-2xl bg-gradient-to-br text-white shadow-lg ${RESULT_TONE[overall].solid}`}>
          <div className="flex items-start gap-4 p-5">
            <HeroIcon className="size-14 shrink-0" strokeWidth={1.5} />
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold tracking-widest uppercase opacity-80">Overall result</div>
              <div className="text-4xl leading-none font-black tracking-tight">{RESULT_LABEL[overall]}</div>
              <div className="mt-2 truncate text-sm font-medium">{insp.buyer ? `${insp.buyer} · ` : ''}{factoryName}</div>
              <div className="truncate text-xs opacity-80">
                {insp.poNumber} · {insp.style} · {insp.productCategory}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-4 divide-x divide-white/15 border-t border-white/15 bg-black/15 text-center">
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
          {overall === 'pending' && (
            <p className="border-t border-white/15 bg-black/10 px-5 py-2.5 text-xs">
              One or more items need the buyer’s decision or are not completed — see the summary below.
            </p>
          )}
        </section>

        {/* 1. Summary of results */}
        <Card n="1" title={t('summaryOfResults')}>
          <ul className="divide-y divide-ink-100">
            {sections.map((s) => (
              <li key={s.key} className="flex items-center gap-3 px-4 py-3">
                <span className={`size-2.5 shrink-0 rounded-full ${RESULT_TONE[s.result].dot}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{s.title}</div>
                  <div className="truncate text-xs text-ink-500">{s.remark}</div>
                </div>
                <ResultPill result={s.result} />
              </li>
            ))}
          </ul>
        </Card>

        {/* 2. General information */}
        <Card n="2" title="General information">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 text-sm">
            {info.map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-[11px] font-semibold text-ink-400 uppercase">{k}</dt>
                <dd className="truncate font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>

        {/* 3. Defects */}
        <Card n="3" title={`${t('defects')} (${c.critical + c.major + c.minor})`}>
          {insp.defects.length === 0 ? (
            <p className="p-4 text-sm text-ink-500">No defects found in the sample.</p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {insp.defects.map((d) => {
                const def = defectByCode.get(d.code);
                const st = SEVERITY_STYLE[d.severity];
                return (
                  <li key={d.id} className="flex items-center gap-3 px-4 py-2.5">
                    {d.photoIds.length ? <Thumb photo={photoById.get(d.photoIds[0])} /> : <div className={`h-12 w-1 shrink-0 rounded-full ${st.bar}`} />}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">
                        {def ? pick(def) : d.code}
                        {d.qty > 1 && <span className="text-ink-500"> ×{d.qty}</span>}
                      </div>
                      <div className="truncate text-xs text-ink-500">
                        <span className={`font-bold uppercase ${st.text}`}>{t(d.severity)}</span> · {d.code}
                        {d.note && ` · ${d.note}`}
                      </div>
                    </div>
                    {d.photoIds.length > 1 && <span className="text-xs text-ink-400">+{d.photoIds.length - 1}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* 4. Measurements */}
        <Card n="4" title="Measurement chart (cm)">
          <div className="space-y-2 p-4 text-sm">
            {insp.measurements.map((m) => (
              <div key={m.pom} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{m.pom}</span>
                <span className="text-xs text-ink-400 tabular-nums">
                  {m.spec}±{m.tol}
                </span>
                <div className="flex gap-1">
                  {m.values.map((v, i) => {
                    const bad = v != null && Math.abs(v - m.spec) > m.tol;
                    return (
                      <span key={i} className={`w-10 rounded-md py-0.5 text-center text-xs font-semibold tabular-nums ${v == null ? 'bg-ink-50 text-ink-300' : bad ? 'bg-red-50 text-crit' : 'bg-brand-50 text-brand-600'}`}>
                        {v ?? '—'}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* 5. Checklist */}
        <Card n="5" title={t('checklist')}>
          <ul className="divide-y divide-ink-100">
            {CHECKLIST.map((ci) => {
              const v = insp.checklist[ci.id];
              return (
                <li key={ci.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="flex-1">{pick(ci)}</span>
                  <ResultPill result={v === 'ok' ? 'pass' : v === 'nok' ? 'fail' : v === 'na' ? 'na' : 'pending'} />
                </li>
              );
            })}
          </ul>
        </Card>

        {/* 6. Remarks & signatures */}
        <Card n="6" title="Remarks & signatures">
          <p className="px-4 pt-3 text-sm whitespace-pre-wrap text-ink-700">{insp.comments || 'No additional remarks.'}</p>
          <div className="grid grid-cols-2 gap-3 p-4">
            {(
              [
                [t('inspector'), insp.inspector, insp.signatures?.inspector],
                [t('factoryRep'), insp.factoryRep, insp.signatures?.factory],
              ] as const
            ).map(([role, name, sig]) => (
              <div key={role} className="rounded-xl bg-ink-50 p-3 ring-1 ring-ink-200">
                <div className="grid h-16 place-items-center">{sig ? <img src={sig} alt={`${role} signature`} className="max-h-16" /> : <span className="text-xs text-ink-400">Not signed</span>}</div>
                <div className="mt-1 border-t border-ink-300 pt-1.5">
                  <div className="truncate text-sm font-semibold">{name || '—'}</div>
                  <div className="text-[11px] text-ink-500">{role}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* 7. Attachments */}
        <Card
          n="7"
          title="Attached reports"
          right={
            access.canEdit && (
              <button className="inline-flex items-center gap-1.5 rounded-lg bg-ink-100 px-3 py-1.5 text-xs font-semibold hover:bg-ink-200" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Spinner className="size-3.5" /> : <Upload className="size-3.5" />} Upload PDF
              </button>
            )
          }
        >
          <input ref={fileRef} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => (void onUpload(e.target.files), (e.target.value = ''))} />
          {uploadError && <p className="px-4 pt-3 text-sm text-crit">{uploadError}</p>}
          {!attachments?.length ? (
            <p className="p-4 text-sm text-ink-500">
              {access.canEdit ? (
                <>
                  <Paperclip className="mr-1 inline size-4" />
                  Attach existing reports — e.g. a lab test or third-party inspection PDF.
                </>
              ) : (
                'No attachments.'
              )}
            </p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {attachments.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-4 py-2.5">
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
                  <div className="flex">
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
        </Card>

        {/* Photos */}
        {orderedPhotos.length > 0 && (
          <Card title={`Photos (${orderedPhotos.length})`}>
            <div className="grid grid-cols-3 gap-2 p-4">
              {orderedPhotos.map((p, i) => (
                <div key={p.id} className="relative">
                  <Thumb photo={p} className="aspect-square w-full" />
                  <span className="absolute top-1 left-1 rounded bg-ink-900/70 px-1.5 text-[10px] font-bold text-white">#{i + 1}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {access.canEdit && insp.status === 'completed' && (
          <button
            className="btn-ghost w-full"
            onClick={async () => {
              await updateInspection(insp.id, { status: 'draft', syncState: 'local' });
              navigate(`/inspect/${insp.id}`);
            }}
          >
            <Pencil className="size-4" /> Edit inspection
          </button>
        )}

        <p className="px-1 text-[11px] leading-relaxed text-ink-400">{DISCLAIMER}</p>
      </main>

      {/* Sticky action bar — the three things people do with a report */}
      <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl gap-2 px-4 pt-3">
          <button className="btn-ghost flex-1 !px-2 whitespace-nowrap" onClick={() => generate('preview')} disabled={!!generating}>
            {generating === 'preview' ? <Spinner /> : <Eye className="size-4" />} Preview
          </button>
          {access.canDownload ? (
            <button className="btn-ghost flex-none !px-4" onClick={() => generate('download')} disabled={!!generating} aria-label="Download PDF">
              {generating === 'download' ? <Spinner /> : <Download className="size-4" />} PDF
            </button>
          ) : (
            <span className="btn-ghost flex-none cursor-not-allowed !px-4 opacity-50" title="Download not permitted">
              <Lock className="size-4" /> PDF
            </span>
          )}
          {isOwner && (
            <button className="btn-brand flex-[2] !px-2 whitespace-nowrap" onClick={() => setSending('Inspection report + attachments')}>
              <Send className="size-4" /> {t('shareWithBuyer')}
            </button>
          )}
        </div>
      </div>

      {preview && <PdfViewer blob={preview.blob} name={preview.name} canDownload={access.canDownload} onClose={() => setPreview(undefined)} />}
      {sending && <ShareDialog inspection={insp} subject={sending} onClose={() => setSending(undefined)} />}
    </>
  );
}
