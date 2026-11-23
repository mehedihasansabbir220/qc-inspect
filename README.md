# QC Inspect — offline-first quality inspection PWA

A field app for garment and home-textile quality inspectors working inside factories where
connectivity is weak or absent. Inspectors run AQL inspections, log defects with photos,
take measurements and complete checklists — **entirely offline**. Everything syncs
automatically and safely when a signal returns.

> Built as a working prototype for a digital quality-management solution in the
> Bangladesh sourcing context. Factory names and inspection data are fictional demo data.

| Inspections | Live inspection | Defect + photo | Report | Insights |
|---|---|---|---|---|
| ![](docs/screenshots/home.png) | ![](docs/screenshots/inspect.png) | ![](docs/screenshots/defect-sheet.png) | ![](docs/screenshots/report.png) | ![](docs/screenshots/insights.png) |

## What it does

- **AQL sampling engine (ISO 2859-1 / ANSI Z1.4)** — enter lot size, inspection level and AQL
  values; the app derives the code letter, sample size and Ac/Re numbers, correctly resolving the
  standard's ↑/↓ arrows. Unit-tested against the published tables.
- **Live verdict** — critical / major / minor tallies against their rejection numbers. A lot is
  failed *as soon as* it reaches Re (saves inspector time); passes only once the full sample is checked.
- **Defect library** — 21 coded defects (safety, fabric, workmanship, trims, measurement, packing)
  with default severities the inspector can override; quantity, notes and photos per entry.
- **Photos** — camera capture, on-device resize + JPEG re-encode (4–6 MB → ~300 KB) before
  storage, uploaded in the background as the inspection progresses.
- **Measurements** — points of measure × 5 pieces with tolerance highlighting.
- **Checklist** — approved sample, quantity, carton, labels, drop test, metal detection.
- **Report** — printable / PDF, share sheet, compression savings, sync status.
- **Insights** — pass rate, DHU (defects per hundred units), pass rate by factory, Pareto of top
  defects, **CSV export** for Google Sheets / Excel.
- **English / বাংলা** — UI and defect names switch language, so line QC can use it in their own language.
- **Network simulator** — force *Offline* or *Flaky 3G* (40% of requests dropped) to demo sync behaviour.
- **Generated PDF report** — built on the device with jsPDF (works offline): verdict, sampling plan,
  colour-coded defect / measurement / checklist tables, photo pages. **Preview** in-app (pdf.js,
  works on Android/iOS where browsers can't show PDFs inline) and **Download**.
- **Attach existing reports** — upload any PDF (third-party inspection, lab test) to an inspection;
  stored offline first, synced through the same outbox, previewed in-app.
- **Send with permissions** — create a link for the report (+ attachments), share via WhatsApp,
  e-mail, copy or the native share sheet. Each link carries **View** (always), **Download** and
  **Edit** switches the owner can change or **revoke** at any time, and shows who opened it.
  Enforced by Postgres Row Level Security — not just hidden buttons.
- **Two-way sync** — edits by a colleague with edit permission flow back to the owner's device;
  local unsynced work is never overwritten; revoked reports disappear from the recipient's device.

## Architecture

```mermaid
flowchart LR
  UI[React UI] -->|every edit| IDB[(IndexedDB · Dexie)]
  IDB -->|useLiveQuery| UI
  UI -->|complete / photo| OB[(Outbox table)]
  SE[Sync engine] -->|drain when online| OB
  SE -->|SyncAdapter| API[(Backend: mock · Supabase · Firebase · REST)]
  SW[Service worker · Workbox] -->|precached app shell| UI
```

**Offline-first, local-first.** The device is the source of truth while offline. Every keystroke
is written to IndexedDB (autosave), so killing the app or a dead battery loses nothing. The app
shell is precached by a Workbox service worker, so it boots with zero connectivity.

**Outbox pattern** (`src/lib/sync/engine.ts`)
1. Writes that must reach the server create a durable outbox row (survives restarts).
2. The engine drains it on `online` events, app focus, a 10 s timer, or a manual “Sync now”.
3. **Photos upload before the inspection** that references them.
4. Failures retry with **exponential backoff + full jitter** (capped at 5 min) so a fleet of devices
   regaining signal after a power cut doesn’t stampede the API.
5. **Idempotent** pushes keyed by client UUIDs → a retried request that already succeeded never duplicates.
6. **Optimistic concurrency**: every edit bumps `version`; a record is only marked synced if it
   wasn’t edited while the upload was in flight, and the server rejects stale versions (`ConflictError`).

**Pluggable backend.** The engine only knows the `SyncAdapter` interface (`pushInspection`,
`pushPhoto`). The demo ships a mock server in a separate IndexedDB so it runs anywhere without
keys. A Supabase adapter is ~20 lines:

```ts
export const supabaseAdapter: SyncAdapter = {
  async pushInspection(i) {
    const { error } = await supabase.rpc('upsert_inspection', { payload: i }); // version check in SQL
    if (error?.code === '40001') throw new ConflictError(error.details as unknown as number);
    if (error) throw error;
    return { serverVersion: i.version };
  },
  async pushPhoto(p) {
    const path = `${p.inspectionId}/${p.id}.jpg`;
    const { error } = await supabase.storage.from('qc-photos').upload(path, p.blob, { upsert: true });
    if (error) throw error;
    return { url: supabase.storage.from('qc-photos').getPublicUrl(path).data.publicUrl };
  },
};
```

## Sharing & permissions (Supabase)

```mermaid
sequenceDiagram
  participant O as Owner (inspector)
  participant DB as Supabase (Postgres + RLS + Storage)
  participant R as Recipient
  O->>DB: insert shares (can_download, can_edit) → token
  O-->>R: link /s/<token> via WhatsApp / e-mail
  R->>DB: sign in, rpc redeem_share(token) → becomes member
  R->>DB: rpc pull_inspections → report + effective permissions
  R->>DB: storage download (RLS: can_view)
  R->>DB: rpc upsert_inspection (RLS: can_edit, version check)
  DB-->>O: next pull brings the edit back
```

| Action | Owner | Link: view | + download | + edit | Revoked / stranger |
|---|---|---|---|---|---|
| Open report & preview PDFs | ✅ | ✅ | ✅ | ✅ | ❌ |
| Download generated PDF & attachments | ✅ | ❌ | ✅ | ✅ | ❌ |
| Edit inspection, upload attachments | ✅ | ❌ | ❌ | ✅ | ❌ |
| Create / change / revoke links | ✅ | ❌ | ❌ | ❌ | ❌ |
| Delete | ✅ | ❌ | ❌ | ❌ | ❌ |

- **Recipients sign in.** QC reports are confidential brand data, so links are not public: a leaked
  link is useless without an account, and the owner sees exactly who opened it.
- **Enforced server-side** in `supabase/schema.sql`: RLS policies on `inspections`, `shares`,
  `share_members` and `storage.objects` all go through `can_view / can_edit / can_download`.
  Edits go through `upsert_inspection`, which also enforces optimistic concurrency (`40001` on a
  stale version → the app keeps the server copy and flags the conflict).
- **Honest limit:** "no download" removes the download path (UI + file save), but anyone who can
  *view* a document can still screenshot it — the same model as Google Drive's "disable download".
- **Verified:** `npm run test:db` runs 30 permission scenarios (owner, view-only, editor, revoked
  editor, stranger) against real Postgres. It caught a real hole during development: a storage
  policy that used a plain sub-query let strangers upload into another user's folder because RLS
  hid the row — fixed with a `SECURITY DEFINER` existence check.

### Supabase setup (≈10 minutes, free tier)

1. Create a project at [supabase.com](https://supabase.com) (region: Singapore is closest to Dhaka).
2. **SQL Editor** → paste `supabase/schema.sql` → **Run**.
3. **Authentication → Providers → Email**: for a quick demo, turn **off** "Confirm email".
4. **Authentication → URL Configuration**: add your deployed URL and `http://localhost:5173`.
5. **Project Settings → API**: copy *Project URL* and *anon public* key into `.env.local`
   (see `.env.example`), then restart `npm run dev`. On Vercel, add the same two variables.

Without these variables the app runs in **demo mode** against the on-device mock server — everything
works except accounts and sending.

**Storage durability.** The app requests `navigator.storage.persist()` so the browser won’t evict
inspection data under storage pressure.

## Tech stack

React 18 · TypeScript (strict) · Vite · Tailwind CSS v4 · Dexie (IndexedDB) · Workbox via
vite-plugin-pwa · Vitest + fake-indexeddb · lucide icons. No runtime network dependencies
(system fonts, inline icons) — nothing breaks offline.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 (also exposed on your LAN)
npm test           # 37 unit tests: AQL tables, verdict, backoff, sync engine (push + pull + permissions)
npm run test:db -- "host=127.0.0.1 port=5432 user=postgres"   # 30 RLS permission tests on local Postgres
npm run build && npm run preview   # production build with service worker
```

> Service workers and `crypto.randomUUID` need a secure context: use `localhost`, or deploy
> (HTTPS) to test on a phone.

### Deploy (free, ~2 minutes)

Push to GitHub, then import the repo on **Vercel** or **Netlify** (framework: Vite, build
`npm run build`, output `dist`). SPA rewrites are already configured (`vercel.json`,
`public/_redirects`). Open the URL on an Android phone → “Install app”.

## How to verify it works

1. `npm test` → 37 passed. `npm run build` → builds with a service worker.
2. **Offline:** `npm run preview`, open DevTools → Network → *Offline*, reload — the app still
   opens. Complete an inspection → pill shows *1 pending*. Go back online → *All synced*.
3. **Flaky network:** Settings → *Flaky 3G* → watch retries with backoff in the outbox list.
4. **PDF:** open a report → *Preview PDF* (2+ page report) → *Download*. Upload a PDF under
   *Attached reports* → tap it to preview.
5. **Sharing (needs Supabase):** sign in as user A on the phone, *Send* a report with only *View*.
   Open the link in an incognito window, sign up as user B → report opens, **no download / edit**.
   On A, switch on *Edit* for that link → B (after sync) sees *Edit inspection*; B changes a comment
   → A sees it after the next sync. A taps 🗑 *Revoke* → the report disappears from B.
6. **Permissions on the server:** `npm run test:db` → 30 passed.

## Project layout

```
src/
  lib/
    aql.ts            ISO 2859-1 sampling engine (+ tests)
    verdict.ts        pass / fail / in-progress rules (+ tests)
    defects.ts        bilingual defect library, POMs, checklist
    db.ts             Dexie schema & types
    repo.ts           domain operations (create, autosave, add defect, complete)
    photos.ts         on-device compression
    sync/             outbox engine (push + pull), backoff, adapter interface, Supabase adapter, mock server, network simulator
    pdf.ts            on-device PDF report generation (lazy-loaded)
    share.ts          share links: create, update, revoke, redeem
    supabase.ts       client + session store (works offline)
  pages/              Inspections, NewInspection, Inspect, Report, Insights, Settings, SharedLink
  components/         AppShell, SyncPill, DefectSheet, PdfViewer, ShareDialog, AuthForm, UI primitives
supabase/
  schema.sql          tables, RLS policies, RPCs, storage bucket & policies
  test/               Postgres permission test-suite (stubs Supabase auth/storage)
```

## Roadmap to production

1. **Roles & organisations** — factory / brand / QA-manager roles on top of per-report sharing;
   link expiry; audit log of who changed what.
2. **Master data sync** — pull POs, styles, factories, spec sheets and AQL presets per customer
   from the existing ERP / Google Sheets.
3. **Background Sync API** + periodic sync on Android so uploads finish with the app closed.
4. **Photo annotation** (circle the defect), barcode / QR scan of carton labels.
5. **Supervisor review & sign-off**, automatic e-mail of the PDF report to the brand (Edge Function).
6. **Conflict UI** for the rare case a supervisor and inspector edit the same record.
7. **Field pilot** with 2–3 inspectors, measure time-per-inspection vs. paper, iterate.
8. If needed, wrap with Capacitor for Play Store distribution and native camera access.
