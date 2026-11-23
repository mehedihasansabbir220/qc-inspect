/**
 * QC Inspect → Google Drive + Google Sheets bridge (Google Apps Script web app).
 *
 * What it does for every completed inspection the app sends:
 *   • saves the report PDF in Drive:  QC Inspect Reports / <Buyer> / QC-<type>-<PO>-<style>.pdf
 *     (a newer version of the same report replaces the old file)
 *   • adds or updates one row per report in the Google Sheet "QC Inspections" (same folder)
 *
 * Setup (5 minutes) — see README.md in this folder:
 *   1. script.google.com → New project → paste this file.
 *   2. Project Settings → Script properties → add  TOKEN = <a long random secret>.
 *   3. Deploy → New deployment → Web app · Execute as: Me · Who has access: Anyone.
 *   4. In the app: Settings → Google Workspace → paste the web-app URL and the same TOKEN.
 */

const ROOT_FOLDER = 'QC Inspect Reports';
const SPREADSHEET = 'QC Inspections';
const SHEET = 'Inspections';
const HEADERS = ['Report no', 'Inspection date', 'Buyer', 'Factory', 'PO', 'Style', 'Product', 'Type', 'Result',
  'Critical', 'Major', 'Minor', 'Sample', 'Inspector', 'PDF', 'Received'];

function doPost(e) {
  try {
    const p = JSON.parse(e.postData.contents);
    const token = PropertiesService.getScriptProperties().getProperty('TOKEN');
    if (!token || p.token !== token) return json_({ ok: false, error: 'Invalid token' });

    const root = folder_(DriveApp.getRootFolder(), ROOT_FOLDER);
    const buyerFolder = folder_(root, p.buyer || 'No buyer');

    // Replace an older version of the same report
    const old = buyerFolder.getFilesByName(p.fileName);
    while (old.hasNext()) old.next().setTrashed(true);
    const pdf = Utilities.newBlob(Utilities.base64Decode(p.pdfBase64), 'application/pdf', p.fileName);
    const file = buyerFolder.createFile(pdf);

    const sheet = sheet_(root);
    const row = [p.reportNo, p.date, p.buyer, p.factory, p.poNumber, p.style, p.product, p.type, p.result,
      p.critical, p.major, p.minor, p.sample, p.inspector, file.getUrl(), new Date()];
    const reportNos = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), 1).getValues().map(function (r) { return r[0]; });
    const at = reportNos.indexOf(p.reportNo);
    if (at > 0) sheet.getRange(at + 1, 1, 1, row.length).setValues([row]);
    else sheet.appendRow(row);

    return json_({ ok: true, fileUrl: file.getUrl(), sheetUrl: sheet.getParent().getUrl() });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/** "Test connection" button in the app calls this. */
function doGet() {
  return json_({ ok: true, service: 'QC Inspect bridge' });
}

function folder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function sheet_(root) {
  const files = root.getFilesByName(SPREADSHEET);
  let ss;
  if (files.hasNext()) {
    ss = SpreadsheetApp.open(files.next());
  } else {
    ss = SpreadsheetApp.create(SPREADSHEET);
    DriveApp.getFileById(ss.getId()).moveTo(root);
  }
  let sh = ss.getSheetByName(SHEET);
  if (!sh) {
    sh = ss.getSheets()[0];
    sh.setName(SHEET);
  }
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
  return sh;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
