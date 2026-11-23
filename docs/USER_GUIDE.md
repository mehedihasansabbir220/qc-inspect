# QC Inspect — User Guide

QC Inspect is a quality-inspection app for garment and home-textile factories. You can run a full
AQL inspection on your phone **without internet**: count pieces, log defects with photos, take
measurements, complete the checklist and produce a PDF report. Everything uploads by itself when
you have signal again.

**Who this guide is for**

| You are… | Read |
|---|---|
| A **QC inspector** doing inspections in factories | [1](#1-getting-started) → [2](#2-doing-an-inspection) → [3](#3-reports-pdfs-and-attachments) → [5](#5-working-without-internet) |
| A **QA manager** who sends reports and follows results | [3](#3-reports-pdfs-and-attachments) → [4](#4-sending-a-report) → [6](#6-insights-for-managers) |
| Someone who **received a link** to a report | [7](#7-you-received-a-shared-report) |

---

## 1. Getting started

### Install the app on your phone (once)
QC Inspect is a web app that installs like a normal app — no Play Store needed.

1. Open the app link in **Chrome** (Android) or **Safari** (iPhone).
2. **Android:** tap the ⋮ menu → **Install app** (or *Add to Home screen*).
   **iPhone:** tap the **Share** button → **Add to Home Screen**.
3. Open it **once while you have internet**. You'll see *"Ready to work offline"* — from now on it
   opens even with no signal.

### Create your account
1. Tap **Settings** (bottom right) → **Cloud account** → **Create account**.
2. Enter your work e-mail and a password (at least 6 characters).
3. Also in Settings: type your **name** under *Inspector* and your **company name on reports**
   (both appear on every PDF), and choose your **language** — **English** or **বাংলা**.

> You can start inspecting before you have an account. Everything is kept on the phone and
> uploads automatically the first time you sign in.

### The screen at a glance

```
┌──────────────────────────────────────┐
│ 🛡 QC Inspect          ● All synced  │  ← sync status (tap to sync now)
├──────────────────────────────────────┤
│  78%        9            0           │  ← pass rate · inspections · open drafts
│  Pass rate  Inspections  Drafts      │
│                                      │
│  Gazipur Knit Composite    ✅ Pass   │  ← your inspections
│  PO-24810 · KNI-1040                 │
│  ...                                 │
├──────────────────────────────────────┤
│ Inspections  Insights   ➕   Settings │  ← ➕ = new inspection
└──────────────────────────────────────┘
```

**Sync status (top right)**

| You see | Meaning |
|---|---|
| ● **All synced** | Everything is safely on the server |
| ⟳ **3 pending** | 3 items are saved on the phone and waiting to upload |
| **Syncing…** | Uploading right now |
| 📵 **Offline 2** | No internet — 2 items will upload when signal returns. Keep working. |

---

## 2. Doing an inspection

### Step 1 — Start a new inspection
Tap the green **➕** button. First pick the **product type**: Apparel tops, Apparel bottoms,
Towels, Bed linen, Tableware & ceramics, or Furniture & décor. It decides which defects, checks and
measurements you get. Then fill in the fields.

**Buyer, Factory and Product are dropdowns where you can also type:** tap the field or the ▾ arrow
to see all options, tap ✕ to clear it, or just type a new name and choose **Use "…"**. A new factory
asks for its location and is saved for next time. Picking a known buyer (e.g. *Nordic Home AB*)
applies their QA manual automatically: their AQL, level and extra buyer checks.

| Field | Example | Tip |
|---|---|---|
| Buyer / client | Nordic Home AB | shown on the report cover |
| Factory | Gazipur Knit Composite | |
| PO number / Style | PO-25102 / KNT-1048 | |
| Product | Knit T-shirt | |
| Inspection type | Inline · Pre-final · **Final random** | |
| Lot size | 3000 | total pieces in the order/shipment |
| Inspection level | **II** | use II unless the buyer says otherwise |
| AQL major / minor | **2.5 / 4.0** | from the buyer's QA manual |

The dark **Sampling plan** card fills in by itself, e.g.:

> **125 pcs sample** · Code K · Critical Ac 0 / Re 1 · Major Ac 7 / Re 8 · Minor Ac 10 / Re 11

- **Sample** = how many pieces you must check.
- **Ac (accept)** = the most defects allowed while the lot still passes.
- **Re (reject)** = when defects reach this number, the lot **fails**.
- **Critical** (safety) defects: **one is enough to fail**.

Tap **Start inspection**. Next time, the app remembers your last buyer, factory and AQL settings —
you only type the new PO and style.

The inspection has **4 steps**, shown at the top: **1 Defects → 2 Measure → 3 Checklist → 4 Finish**.
A step turns ✓ green when it's complete. Use the big **Next** button at the bottom, or tap any step.

### Step 2 — Check pieces and log defects
At the top you see **Pieces inspected 10 / 125**, the live result, and three counters
(Critical / Major / Minor) against their limits.

- Each good piece → tap **+ 1 pc OK**. Use **+5** to go faster, **All** when the sample is done,
  **–** to correct a mistake.
- Found a defect → tap it in the list (e.g. **Broken stitch**), or type in **Search defects…**
  (e.g. "stitch") to find it fast. A panel opens:
  1. **Severity** — pre-selected; change it if needed (Critical / Major / Minor).
  2. **Quantity** — how many of this defect.
  3. **Add photo** — take a picture of the defect (recommended). Photos are shrunk automatically
     so they upload fast on weak networks.
  4. **Note** — optional, e.g. *"carton 14, left sleeve"*.
  5. Tap **Log defect**.
- Logged a defect by mistake? Scroll to **Logged defects** and tap 🗑.

**Live result**

| Badge | Meaning |
|---|---|
| **In progress** | Keep inspecting |
| ✅ **Pass** | Full sample checked, all counters below their reject number |
| ❌ **Fail** | A counter reached its reject number (or 1 critical). You can stop early. |

> Every tap is saved on the phone immediately ("✓ Saved on device"). If the battery dies or the
> app closes, nothing is lost — just open it again.

### Step 3 — Measurements
Open the **Measure** step. For each point of measure enter the measurement of 5 pieces (the unit,
cm / mm / g, is shown next to the spec). Values **outside tolerance turn red**, inside tolerance
turn green.

**Your own measurement points:** tap **Edit points** to rename a point or change its spec, tolerance
or unit, or 🗑 remove it. Tap **Add your own measurement point** for a new one, e.g. *Hanging loop length*.

### Step 4 — Checklist
Open the **Checklist** step and mark each line **✓ OK**, **✗ Not OK** or **N/A**. Checks are grouped
the same way as the report: Product conformity, Quantity, Packing & labels, Safety, **Product
tests** (e.g. absorbency for towels, thermal shock for ceramics) and **Buyer requirements**.

**Your own check:** at the bottom, type it (e.g. *Gift box print correct*), choose which report
section it belongs to, and tap **Add**. It counts in the result like any other check.

**A defect that isn't in the list?** On the Defects step tap **Other defect — describe it yourself**,
type the description, and log it like any other defect.

### Step 5 — Finish & sign
Open the **Finish** step:
1. **Report preview** shows the result the buyer will see — each section and the overall
   **PASS / FAIL / PENDING** (see below).
2. Check the list (sample done? measurements OK? checklist complete?).
3. Write your **comments** — what you found and what the factory agreed to do.
4. **Signatures:** type the **factory representative's** name, then both of you sign on the screen
   with a finger. Tap *Clear* to sign again. Signatures appear on the PDF.
5. Tap **Complete & queue for sync**.

**Changed your mind?** At the bottom of the Finish step, **Discard this draft** deletes it (tap twice).

**How the overall result is decided** (the same rule third-party inspection companies use):

| Overall | When |
|---|---|
| ✅ **PASS** | Every section passed |
| ❌ **FAIL** | Any section failed — e.g. AQL exceeded, a critical defect, a checklist item *Not OK*, or many measurements out of tolerance (more than 10 %) |
| ⏳ **PENDING** | Nothing failed, but something is open or needs the buyer's decision — e.g. an unanswered checklist item, or a few measurements slightly out of tolerance |

The report opens. If you are offline it shows *pending* — it uploads by itself later.

---

## 3. Reports, PDFs and attachments

### Finding a report
The **Inspections** list shows every report with its factory, buyer, PO, style, **who created it**
(👤 inspector) and **report number**.
- **Search:** type a PO, style, buyer, factory, inspector or report number.
- **Sort** (top right): newest, oldest, **fail / pending first** (good for managers), factory A–Z, buyer A–Z.
- **Filters:** All · Draft · Completed · Shared (sent to you) · Team (managers).

Open any completed inspection from the list to see its report.

**Delete a report:** scroll to the bottom of the report → **Delete report** → tap again to confirm.
Only the person who created it can delete it. It's removed from the server as soon as there's internet.

**Google Drive & Sheets:** if your company set it up (*Settings → Google Workspace*), every completed
report is saved to Drive in a folder per buyer, and added as a row to the company's QC Sheet. The
report shows a link to the PDF in Drive; **Send again** re-sends it after changes.

The bar at the bottom of every report:

| Button | What it does |
|---|---|
| 👁 **Preview** | Builds the official PDF report and shows it in the app (works offline) |
| ⬇ **PDF** | Saves the PDF to your phone/computer |
| ➤ **Share with buyer** | Send the report — see [section 4](#4-sending-a-report) |

**Edit inspection** (further down the page) re-opens it; complete it again to re-upload.

The PDF follows the layout buyers know from third-party inspection companies:

1. **Cover** — report number (e.g. `QC-2611-34A7F2`), overall result, sample and defect totals
2. **General information** — buyer, supplier/factory, location, PO, style, product, date, inspector, factory representative, sampling plan
3. **Summary of results** — Quantity · Product conformity · Workmanship (AQL) · Measurements · Packing, marking & labels · Safety, each PASS / FAIL / PENDING with remarks
4. **AQL result** — accept/reject numbers vs. defects found
5. **Defects found** — with the photo next to each defect
6. **Measurement chart** — out-of-tolerance readings highlighted
7. **Checklist & on-site tests**, **inspector remarks**
8. **Signatures** of inspector and factory representative, plus the standard inspection disclaimer
9. **Photo appendix** — large, numbered photos with captions

### Attach an existing report (PDF)
Have a lab test or a third-party inspection report? Attach it to the inspection:

1. On the report, find **Attached reports** → **Upload PDF**.
2. Pick the PDF (max 20 MB each; several at once is fine).
3. It appears in the list immediately. *"waiting to upload"* disappears once it reaches the server.

Tap an attachment (or 👁) to **preview** it, ⬇ to download, ➤ to send, 🗑 to remove.

---

## 4. Sending a report

Sending needs an account and internet. The report must be uploaded first (sync status
*All synced*).

1. Open the report → tap **Send** (or ➤ next to an attachment — the link always opens the full
   report **with all its attachments**).
2. Tap who it's for — **Buyer** (view + download, the default), **QA colleague** (view + download +
   edit) or **View only** — or set the switches yourself:

   | Permission | They can |
   |---|---|
   | **View** (always on) | Open the report and preview the PDFs in the app |
   | **Allow download** | Also save the PDF report and attachments |
   | **Allow edit** | Also change defects, checklist and comments, and add attachments |

3. Tap **Create link**, then send it with **WhatsApp**, **Email**, **Copy**, or **More**. A
   professional message is filled in for you (greeting, report number, PO/style, factory, overall
   result, link) — open **Message preview** to see it.

### Manage who has access
Open **Send** again on the same report. Under **Active links** you can:
- see **who opened** each link (their e-mail),
- turn **Download** or **Edit** on/off at any time — it applies on their next sync,
- tap 🗑 to **revoke** a link — the report disappears from their device.

> Tip: create **one link per person or company** (e.g. one for the buyer with *View + Download*,
> one for your QA colleague with *Edit*). Then you can remove one without affecting the others.

**Good to know:** "no download" stops the file from being saved, but anyone who can see a report
could still take a screenshot — only send reports to people you trust.

---

## 5. Working without internet

You can do **everything except sending** without signal:

| Without internet | Works? |
|---|---|
| Start and complete inspections, photos, measurements, checklist | ✅ |
| Preview and download the PDF report | ✅ |
| Attach PDFs that are already on the phone | ✅ |
| Upload to the server | ⏳ waits, then goes automatically |
| Send a report / open a shared link | ❌ needs internet |

When signal comes back, the app uploads by itself (photos first, then the report). To force it,
tap the sync status at the top, or *Settings → Sync now*.

**Please don't:**
- clear Chrome's browsing data / site data while items are *pending* — that deletes them;
- **sign out** while items are *pending* (the app warns you) — another person signing in on the
  same phone would remove your unsent work.

---

## 6. For QA managers

**Roles:** everyone starts as an **Inspector**. A **QA manager** sees and downloads every
inspector's reports (read-only) under the **Team** filter, and assigns roles in **Settings → Team &
roles**, which lists each person with their number of inspections and last activity. A manager can't
change their own role, so the team can't be locked out by accident.

### Insights

The **Insights** tab summarises all completed inspections on the device:

- **Pass rate** — share of inspections that passed.
- **DHU %** — *defects per hundred units* inspected (the standard garment-industry quality KPI;
  lower is better).
- **Pass rate by factory** — green ≥ 80 %, amber ≥ 50 %, red below.
- **Top defects** — the most frequent defects, i.e. where corrective action helps most.
- **Export CSV** — opens in Excel or Google Sheets for weekly reporting.

---

## 7. You received a shared report

1. Open the link (from WhatsApp or e-mail).
2. **Sign in**, or tap **Create account** if you don't have one. Reports contain confidential buyer
   data, so only signed-in people can open them — and the sender can see who opened the link.
3. The report opens. A blue banner shows **who shared it** and **what you may do**
   (View · Download · Edit).
4. It also appears in your **Inspections** list under the **Shared** filter, and stays available
   offline.

| If you have… | You can |
|---|---|
| View | Read the report, **Preview PDF**, preview attachments |
| + Download | Also **Download** the PDF and attachments |
| + Edit | Also **Edit inspection** and **Upload PDF** attachments — your changes reach the sender automatically |

If the link says *"invalid or was revoked"*, ask the sender for a new one.

---

## 8. Troubleshooting

| Problem | What to do |
|---|---|
| Items stay **pending** for a long time | Check internet. Tap the sync status to retry. Make sure you're **signed in** (Settings). |
| A report shows a red ⚠ sync icon | Your change was not uploaded: someone else changed the same report at the same time, or your edit permission was removed. Your copy stays on the phone — check with the report owner before editing again. |
| **Send** says *"must reach the server first"* | Complete the inspection and wait for *All synced*, then try again. |
| **Send** says *"needs the cloud backend"* | The app is in demo mode — ask your administrator to connect it. |
| Shared link: *"Sign in required"* | Create an account or sign in, then open the link again. |
| Camera doesn't open | Allow camera access for the app/browser in phone settings. |
| App asks to **Reload** (new version) | Tap **Reload** — your data stays. |
| Text is in the wrong language | Settings → Language → English / বাংলা. (PDF reports are always in English.) |

---

## Quick reference card

```
NEW INSPECTION   ➕ → buyer, factory, PO, style, lot size, AQL → Start
EACH GOOD PIECE  + 1 pc OK     (+5 / All for speed)
DEFECT           tap defect (or search) → severity → photo → Log defect
STEPS            Next → Measure → Next → Checklist → Next → Finish
FINISH           comments → factory rep name → 2 signatures → Complete
PDF              open report → Preview / PDF
ATTACH           Attached reports → Upload PDF
SEND             Share with buyer → Buyer → Create link → WhatsApp
STOP SHARING     Send → Active links → 🗑
OFFLINE?         keep working — it uploads by itself
```
