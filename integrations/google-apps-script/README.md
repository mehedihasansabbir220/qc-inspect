# Google Drive + Sheets integration (5-minute setup)

Every completed report is sent automatically to the company's Google account:

- **Drive:** `QC Inspect Reports / <Buyer> / QC-final-<PO>-<style>.pdf` (a newer version replaces the old file)
- **Sheet:** `QC Inspect Reports / QC Inspections`: one row per report (report no, date, buyer,
  factory, PO, style, product, type, result, defect counts, sample, inspector, PDF link)

The app holds no Google keys. A small **Apps Script** runs inside your own Google account and
only accepts requests that carry your secret token. Exports wait in the app's offline queue
(and retry with backoff) until there is internet.

## Easiest way: the guided setup in the app (about 3 minutes, on a laptop)

Open **Settings → Google Drive & Sheets** and follow the 5 numbered steps:

1. **Your Google Sheet (optional):** paste your Sheet's normal link. Leave it empty to get a new Sheet.
2. **Copy setup script:** the app copies this script with **your Sheet and a secret token already
   inside**. There's nothing to configure in Google. (If the browser blocks copying, the script appears
   in a box to copy by hand.)
3. **Open Google Apps Script** (opens script.new) → select all → paste → 💾 Save.
4. **Deploy → New deployment → ⚙ Web app → Who has access: Anyone → Deploy → Authorize**.
   If Google says "hasn't verified this app": *Advanced → Go to (project name) → Allow*.
   Copy the **Web app URL** (ends in `/exec`).
5. **Paste the Web app URL** in the app. It tests the connection by itself.

> Pasting the Sheet link in step 5 is the most common mistake. The app tells you if you do.

## Alternative for step 3: create the script from inside your Sheet

Instead of script.new you can open your Sheet → **Extensions → Apps Script** (menu bar: File · Edit
· View · Insert · Format · Data · Tools · **Extensions** · Help; not available in the Sheets phone
app). Paste the script you copied in step 2 there. Everything else stays the same.

> Always paste the script **copied from the app**, not the plain `Code.gs` file. The app's copy
> contains your secret token, and the app only trusts a script with that token.

**Updating the script later:** Deploy → *Manage deployments* → ✏ → Version: *New version* → Deploy
(the URL stays the same).

**Tested:** the app side was tested end to end against a local stand-in with the same contract
(PDF received, valid, sheet row complete). The Apps Script itself runs only inside Google, so do
one real test in step 6.
