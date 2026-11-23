import { db, getSetting, setSetting, type Photo } from './db';
import { reportFileName } from './files';
import { RESULT_LABEL, overallOf, reportNumber } from './report';
import { tally } from './verdict';

/**
 * Google Workspace integration via a small Apps Script web app the company deploys in its own
 * Google account (integrations/google-apps-script). No Google keys live in the app: the script
 * runs as the company's Drive owner and only accepts requests carrying the shared TOKEN.
 */
export interface GoogleSettings {
  url: string;
  token: string;
  /** Send every completed report automatically (queued offline like everything else). */
  auto: boolean;
}

const KEY = 'google';
export const getGoogleSettings = () => getSetting<GoogleSettings>(KEY, { url: '', token: '', auto: true });
export const saveGoogleSettings = (s: GoogleSettings) => setSetting(KEY, s);
/**
 * Explain a wrong URL in plain words. The most common mistake is pasting the Google Sheet's own
 * link instead of the Apps Script *web-app* link (…/macros/s/…/exec).
 */
export function diagnoseUrl(url: string): string | undefined {
  const u = url.trim();
  if (!u) return undefined;
  if (/docs\.google\.com\/spreadsheets/.test(u))
    return 'This is the link to your Google Sheet, not to the script. Open the Sheet → Extensions → Apps Script → paste Code.gs → Deploy → New deployment → Web app → copy the “Web app URL” (it ends in /exec).';
  if (/drive\.google\.com|docs\.google\.com/.test(u)) return 'This is a Drive / Docs link. You need the Apps Script “Web app URL” (script.google.com/macros/s/…/exec).';
  if (/script\.google\.com\/(home|d\/)/.test(u)) return 'This is the script editor link. In the editor: Deploy → New deployment → Web app → copy the “Web app URL” (ends in /exec).';
  if (/script\.google\.com\/macros\/s\/.+\/dev$/.test(u)) return 'This is a test (/dev) link that only works for you. Use Deploy → New deployment and copy the URL that ends in /exec.';
  if (/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec/.test(u) || /^http:\/\/(localhost|127\.0\.0\.1)/.test(u)) return undefined;
  return 'Expected a Google Apps Script web-app URL like https://script.google.com/macros/s/…/exec';
}

export const isConfigured = (s: GoogleSettings) => !!s.url && !diagnoseUrl(s.url);

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(',')[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function post(url: string, body: unknown) {
  // text/plain keeps this a "simple" CORS request (Apps Script can't answer preflight requests)
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' });
  if (!res.ok) throw new Error(`Google responded ${res.status}`);
  const data = (await res.json()) as { ok: boolean; error?: string; fileUrl?: string; sheetUrl?: string };
  if (!data.ok) throw new Error(data.error ?? 'Google script error');
  return data;
}

export async function testGoogleConnection(s: GoogleSettings) {
  const res = await fetch(s.url, { redirect: 'follow' });
  const data = (await res.json()) as { ok?: boolean };
  if (!data.ok) throw new Error('Unexpected response — is this the web-app URL?');
}

/** Generate the PDF and send it with the result row. Called by the sync engine for queued exports. */
export async function exportToGoogle(inspectionId: string) {
  const s = await getGoogleSettings();
  if (!isConfigured(s)) return; // integration switched off meanwhile — drop silently
  const insp = await db.inspections.get(inspectionId);
  if (!insp || insp.status !== 'completed') return;

  const factory = await db.factories.get(insp.factoryId);
  const factoryName = insp.factoryName ?? factory?.name ?? '—';
  const photos = (await db.photos.where('inspectionId').equals(insp.id).toArray()) as Photo[];
  const byId = new Map(photos.map((p) => [p.id, p]));
  const ordered = insp.defects.flatMap((d) => d.photoIds).map((id) => byId.get(id)).filter((p): p is Photo => !!p);
  const companyName = ((await db.settings.get('companyName'))?.value as string | undefined) || 'QC Inspect';
  const { buildReportPdf } = await import('./pdf');
  const pdf = await buildReportPdf(insp, { factoryName, companyName, photos: ordered });
  const c = tally(insp.defects);
  const overall = overallOf(insp);

  const res = await post(s.url, {
    token: s.token,
    reportNo: reportNumber(insp),
    date: new Date(insp.completedAt ?? insp.updatedAt).toISOString().slice(0, 10),
    buyer: insp.buyer ?? '',
    factory: factoryName,
    poNumber: insp.poNumber,
    style: insp.style,
    product: insp.productCategory,
    type: insp.type,
    result: RESULT_LABEL[overall],
    critical: c.critical,
    major: c.major,
    minor: c.minor,
    sample: `${insp.inspected}/${insp.plan.sampleSize}`,
    inspector: insp.inspector,
    fileName: reportFileName(insp),
    pdfBase64: await toBase64(pdf),
  });
  // Local-only bookkeeping (no version bump, so it doesn't trigger another sync)
  await db.inspections.update(insp.id, { exportedAt: Date.now(), driveUrl: res.fileUrl });
}
