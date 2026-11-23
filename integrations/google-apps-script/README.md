# Google Drive + Sheets integration (5-minute setup)

Every completed report is sent automatically to the company's Google account:

- **Drive:** `QC Inspect Reports / <Buyer> / QC-final-<PO>-<style>.pdf` (a newer version replaces the old file)
- **Sheet:** `QC Inspect Reports / QC Inspections`: one row per report (report no, date, buyer,
  factory, PO, style, product, type, result, defect counts, sample, inspector, PDF link)

The app holds no Google keys. A small **Apps Script** runs inside your own Google account and
only accepts requests that carry your secret token. Exports wait in the app's offline queue
(and retry with backoff) until there is internet.

## Steps (done once, by the Google account that should own the files)

> ⚠️ The app needs the **script's web-app URL** (`https://script.google.com/macros/s/…/exec`),
> **not** the link of your Google Sheet (`docs.google.com/spreadsheets/…`). A Sheet link can't receive
> data. The app warns you if you paste one.

1. **Recommended: start from your own Sheet.** Open the Google Sheet you want the rows in →
   **Extensions → Apps Script**. Rows then go into *that* Sheet (tab "Inspections").
   *Or* open **https://script.google.com** → **New project**; a Sheet "QC Inspections" is then created
   in the Drive folder for you.
2. Delete the sample code, paste **`Code.gs`** from this folder, name the project `QC Inspect bridge`,
   and **Save** (💾).
3. ⚙ **Project Settings** → **Script properties** → **Add property**:
   `TOKEN` = a long random secret (e.g. generate one at a password manager). Save.
4. **Deploy → New deployment** → type **Web app**:
   - *Execute as:* **Me**
   - *Who has access:* **Anyone** (the token protects it)
   → **Deploy** → allow the permissions (Drive + Sheets) → copy the **Web app URL** (ends in `/exec`).
5. In QC Inspect: **Settings → Google Workspace** → paste the URL and the same TOKEN →
   **Test connection** → "Connected to your Google script".
6. Complete an inspection (or open a report → **Google Drive & Sheets → Send**) → the PDF appears
   in Drive and a row in the Sheet within seconds.

**Updating the script later:** Deploy → *Manage deployments* → ✏ → Version: *New version* → Deploy
(the URL stays the same).

**Tested:** the app side was tested end to end against a local stand-in with the same contract
(PDF received, valid, sheet row complete). The Apps Script itself runs only inside Google, so do
one real test in step 6.
