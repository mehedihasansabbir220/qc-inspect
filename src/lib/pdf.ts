import { jsPDF } from 'jspdf';
import autoTable, { type CellHookData } from 'jspdf-autotable';
import { defectName } from './defects';
import { checklistOf } from './templates';
import type { Inspection, Photo } from './db';
import { DISCLAIMER, RESULT_LABEL, overallResult, reportNumber, reportSections, type SectionResult } from './report';
import { tally } from './verdict';

type RGB = [number, number, number];
const INK: RGB = [15, 23, 42];
const INK2: RGB = [51, 65, 85];
const MUTED: RGB = [100, 116, 139];
const LINE: RGB = [226, 232, 240];
const SOFT: RGB = [248, 250, 252];
const TONE: Record<SectionResult, { fg: RGB; bg: RGB }> = {
  pass: { fg: [4, 120, 87], bg: [220, 252, 231] },
  fail: { fg: [185, 28, 28], bg: [254, 226, 226] },
  pending: { fg: [180, 83, 9], bg: [254, 243, 199] },
  na: { fg: [100, 116, 139], bg: [241, 245, 249] },
};
const SEV: Record<string, RGB> = { critical: [185, 28, 28], major: [194, 65, 12], minor: [161, 98, 7] };
const TYPE_LABEL: Record<Inspection['type'], string> = { inline: 'Inline (DUPRO)', 'pre-final': 'Pre-final', final: 'Final random' };

export interface ReportPdfOptions {
  factoryName: string;
  companyName: string;
  photos: Photo[];
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function imageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 4, h: img.naturalHeight || 3 });
    img.onerror = () => resolve({ w: 4, h: 3 });
    img.src = src;
  });
}

type Doc = jsPDF & { lastAutoTable?: { finalY: number } };

/**
 * Generates a third-party-style inspection report as a real PDF, entirely on the device
 * (works offline). Text is English: standard PDF fonts carry no Bengali glyphs.
 */
export async function buildReportPdf(insp: Inspection, { factoryName, companyName, photos }: ReportPdfOptions): Promise<Blob> {
  const doc: Doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 14;
  const CW = W - 2 * M;
  const c = tally(insp.defects);
  const { plan } = insp;
  const sections = reportSections(insp);
  const overall = insp.status === 'draft' ? 'pending' : overallResult(sections);
  const reportNo = reportNumber(insp);
  const date = (ts?: number) => (ts ? new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
  const photoIndex = new Map(photos.map((p, i) => [p.id, i + 1]));

  // Preload images once
  const photoData = new Map<string, { url: string; w: number; h: number }>();
  for (const p of photos) {
    const url = await blobToDataUrl(p.blob);
    photoData.set(p.id, { url, ...(await imageSize(url)) });
  }

  const base = {
    margin: { left: M, right: M, top: 22, bottom: 18 },
    rowPageBreak: 'avoid' as const, // never split a row (e.g. a photo) across pages
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2.2, textColor: INK, lineColor: LINE, lineWidth: 0.2, valign: 'middle' as const },
    headStyles: { fillColor: SOFT, textColor: MUTED, fontStyle: 'bold' as const, fontSize: 7.5 },
    alternateRowStyles: { fillColor: [255, 255, 255] as RGB },
  };
  let y = 0;
  const after = (gap = 7) => (y = (doc.lastAutoTable?.finalY ?? y) + gap);
  const heading = (n: string, title: string) => {
    if (y > H - 40) {
      doc.addPage();
      y = 24;
    }
    doc.setFillColor(...INK);
    doc.rect(M, y - 3.6, 1.2, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...INK);
    doc.text(`${n}  ${title.toUpperCase()}`, M + 3.5, y);
    y += 3;
  };
  const resultCell = (d: CellHookData, col: number) => {
    if (d.section !== 'body' || d.column.index !== col) return;
    const r = String(d.cell.raw).toLowerCase() as SectionResult;
    const tone = TONE[r === ('n/a' as string) ? 'na' : r] ?? TONE.na;
    d.cell.styles.textColor = tone.fg;
    d.cell.styles.fillColor = tone.bg;
    d.cell.styles.fontStyle = 'bold';
    d.cell.styles.halign = 'center';
  };

  // ── Cover header ──────────────────────────────────────────────
  doc.setFillColor(...INK);
  doc.rect(0, 0, W, 34, 'F');
  doc.setTextColor(148, 163, 184);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(companyName.toUpperCase(), M, 11);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text('QUALITY INSPECTION REPORT', M, 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  doc.text(`${TYPE_LABEL[insp.type]} inspection  ·  ISO 2859-1 / ANSI Z1.4  ·  AQL ${plan.major.aql} major / ${plan.minor.aql} minor`, M, 27);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.text(reportNo, W - M, 14, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(203, 213, 225);
  doc.text(`Inspection date ${date(insp.completedAt ?? insp.updatedAt)}`, W - M, 20, { align: 'right' });

  // ── Overall result banner ─────────────────────────────────────
  y = 42;
  const tone = TONE[overall];
  doc.setFillColor(...tone.bg);
  doc.roundedRect(M, y, CW, 26, 2.5, 2.5, 'F');
  doc.setFillColor(...tone.fg);
  doc.roundedRect(M, y, 58, 26, 2.5, 2.5, 'F');
  doc.rect(M + 50, y, 8, 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('OVERALL RESULT', M + 5, y + 8);
  doc.setFontSize(22);
  doc.text(RESULT_LABEL[overall], M + 5, y + 19);

  const facts: [string, string][] = [
    ['Sample inspected', `${insp.inspected} / ${plan.sampleSize} pcs`],
    ['Defects found', `${c.critical} critical · ${c.major} major · ${c.minor} minor`],
    ['Lot quantity', `${insp.lotSize.toLocaleString('en')} pcs`],
    ['Workmanship (AQL)', RESULT_LABEL[sections.find((s) => s.key === 'workmanship')!.result]],
  ];
  facts.forEach(([k, v], i) => {
    const x = M + 64 + (i % 2) * 60;
    const yy = y + 9 + Math.floor(i / 2) * 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(k.toUpperCase(), x, yy - 3.2);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text(v, x, yy + 1);
  });
  y += 34;

  // ── 1. General information ─────────────────────────────────────
  heading('1', 'General information');
  autoTable(doc, {
    ...base,
    startY: y,
    theme: 'grid',
    body: [
      ['Buyer / client', insp.buyer || '—', 'Report number', reportNo],
      ['Supplier / factory', factoryName, 'Inspection type', TYPE_LABEL[insp.type]],
      ['Factory location', insp.factoryLocation || '—', 'Inspection date', date(insp.completedAt ?? insp.updatedAt)],
      ['PO number', insp.poNumber, 'Inspector', insp.inspector || '—'],
      ['Style', insp.style, 'Factory representative', insp.factoryRep || '—'],
      ['Product', insp.productCategory, 'Sampling', `Level ${plan.level} · code ${plan.codeLetter} · ${plan.sampleSize} pcs`],
    ],
    columnStyles: { 0: { textColor: MUTED, cellWidth: 34 }, 1: { fontStyle: 'bold' }, 2: { textColor: MUTED, cellWidth: 38 }, 3: { fontStyle: 'bold' } },
  });
  after();

  // ── 2. Summary of results ─────────────────────────────────────
  heading('2', 'Summary of results');
  autoTable(doc, {
    ...base,
    startY: y,
    head: [['#', 'Inspection item', 'Result', 'Remarks']],
    body: sections.map((s, i) => [i + 1, s.title, RESULT_LABEL[s.result], s.remark]),
    columnStyles: { 0: { cellWidth: 8, halign: 'center', textColor: MUTED }, 1: { cellWidth: 46, fontStyle: 'bold' }, 2: { cellWidth: 24 } },
    didParseCell: (d) => resultCell(d, 2),
  });
  after();

  // ── 3. AQL result ─────────────────────────────────────────────
  heading('3', 'Workmanship — AQL result');
  autoTable(doc, {
    ...base,
    startY: y,
    head: [['Defect class', 'AQL', 'Sample size', 'Accept (Ac)', 'Reject (Re)', 'Found', 'Result']],
    body: (['critical', 'major', 'minor'] as const).map((s) => [
      s[0].toUpperCase() + s.slice(1),
      s === 'critical' ? '0 (not allowed)' : plan[s].aql,
      plan.sampleSize,
      plan[s].ac,
      plan[s].re,
      c[s],
      c[s] >= plan[s].re ? 'FAIL' : insp.inspected < plan.sampleSize ? 'PENDING' : 'PASS',
    ]),
    columnStyles: { 0: { fontStyle: 'bold' }, 2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'center' }, 5: { halign: 'center', fontStyle: 'bold' } },
    didParseCell: (d) => resultCell(d, 6),
  });
  after();

  // ── 4. Defects found (with inline photos) ─────────────────────
  heading('4', `Defects found (${c.critical + c.major + c.minor})`);
  const thumbH = 16;
  autoTable(doc, {
    ...base,
    startY: y,
    head: [['Code', 'Defect description', 'Class', 'Qty', 'Remarks', 'Photo']],
    body: insp.defects.length
      ? insp.defects.map((d) => [d.code, defectName(d), d.severity.toUpperCase(), d.qty, d.note ?? '', d.photoIds.map((p) => `#${photoIndex.get(p) ?? ''}`).join(' ')])
      : [['—', 'No defects found in the sample', '', '', '', '']],
    columnStyles: { 0: { cellWidth: 16, textColor: MUTED }, 2: { cellWidth: 19, fontStyle: 'bold' }, 3: { cellWidth: 10, halign: 'center' }, 5: { cellWidth: 26, minCellHeight: insp.defects.some((d) => d.photoIds.length) ? thumbH + 3 : 0, textColor: [255, 255, 255] } },
    didParseCell: (d) => {
      if (d.section === 'body' && d.column.index === 2) d.cell.styles.textColor = SEV[String(d.cell.raw).toLowerCase()] ?? INK;
    },
    didDrawCell: (d) => {
      if (d.section !== 'body' || d.column.index !== 5) return;
      const defect = insp.defects[d.row.index];
      const pid = defect?.photoIds[0];
      const img = pid ? photoData.get(pid) : undefined;
      if (!img) return;
      const s = Math.min((d.cell.width - 3) / img.w, thumbH / img.h);
      doc.addImage(img.url, 'JPEG', d.cell.x + 1.5, d.cell.y + 1.5, img.w * s, img.h * s);
      if (defect.photoIds.length > 1) {
        doc.setFontSize(6.5);
        doc.setTextColor(...MUTED);
        doc.text(`+${defect.photoIds.length - 1}`, d.cell.x + d.cell.width - 1.5, d.cell.y + d.cell.height - 1.5, { align: 'right' });
      }
    },
  });
  after();

  // ── 5. Measurements ───────────────────────────────────────────
  heading('5', 'Measurement chart');
  autoTable(doc, {
    ...base,
    startY: y,
    head: [['Point of measure', 'Spec', 'Tol ±', 'S1', 'S2', 'S3', 'S4', 'S5', 'Out']],
    // unit is shown with the point of measure
    body: insp.measurements.map((m) => {
      const out = m.values.filter((v) => v != null && Math.abs(v - m.spec) > m.tol).length;
      return [`${m.pom} (${m.unit ?? 'cm'})`, m.spec, m.tol, ...m.values.map((v) => (v == null ? '—' : v)), out];
    }),
    columnStyles: { 0: { cellWidth: 56 }, 1: { fontStyle: 'bold' }, 8: { fontStyle: 'bold', halign: 'center' } },
    didParseCell: (d) => {
      if (d.section !== 'body') return;
      const m = insp.measurements[d.row.index];
      if (d.column.index >= 3 && d.column.index <= 7) {
        const v = m.values[d.column.index - 3];
        d.cell.styles.halign = 'center';
        if (v != null) {
          const bad = Math.abs(v - m.spec) > m.tol;
          d.cell.styles.textColor = bad ? TONE.fail.fg : INK2;
          if (bad) d.cell.styles.fillColor = TONE.fail.bg;
        }
      }
      if (d.column.index === 8) d.cell.styles.textColor = Number(d.cell.raw) ? TONE.fail.fg : TONE.pass.fg;
    },
  });
  after();

  // ── 6. Checklist / on-site tests ──────────────────────────────
  heading('6', 'Checklist & on-site tests');
  autoTable(doc, {
    ...base,
    startY: y,
    head: [['Check', 'Result']],
    body: checklistOf(insp).map((ci) => {
      const v = insp.checklist[ci.id];
      return [ci.en, v === 'ok' ? 'PASS' : v === 'nok' ? 'FAIL' : v === 'na' ? 'N/A' : 'PENDING'];
    }),
    columnStyles: { 1: { cellWidth: 26 } },
    didParseCell: (d) => resultCell(d, 1),
  });
  after();

  // ── 7. Remarks & attachments ──────────────────────────────────
  heading('7', 'Inspector remarks');
  autoTable(doc, {
    ...base,
    startY: y,
    theme: 'plain',
    body: [[insp.comments || 'No additional remarks.']],
    styles: { ...base.styles, fillColor: SOFT, cellPadding: 3.5 },
  });
  after();
  if (insp.attachments?.length) {
    heading('8', 'Attached documents');
    autoTable(doc, {
      ...base,
      startY: y,
      head: [['Document', 'Size']],
      body: insp.attachments.map((a) => [a.name, `${Math.max(1, Math.round(a.bytes / 1024))} KB`]),
      columnStyles: { 1: { cellWidth: 26, halign: 'right' } },
    });
    after();
  }

  // ── Signatures ────────────────────────────────────────────────
  if (y > H - 62) {
    doc.addPage();
    y = 24;
  }
  heading(insp.attachments?.length ? '9' : '8', 'Signatures');
  y += 2;
  const boxW = (CW - 6) / 2;
  const sigs: [string, string | undefined, string | undefined][] = [
    ['Inspector', insp.inspector, insp.signatures?.inspector],
    ['Factory representative', insp.factoryRep, insp.signatures?.factory],
  ];
  for (let i = 0; i < 2; i++) {
    const [role, name, sig] = sigs[i];
    const x = M + i * (boxW + 6);
    doc.setDrawColor(...LINE);
    doc.setFillColor(...SOFT);
    doc.roundedRect(x, y, boxW, 34, 2, 2, 'FD');
    if (sig) {
      const { w, h } = await imageSize(sig);
      const s = Math.min((boxW - 10) / w, 18 / h);
      doc.addImage(sig, 'PNG', x + 5, y + 3, w * s, h * s);
    }
    doc.setDrawColor(...MUTED);
    doc.line(x + 5, y + 23, x + boxW - 5, y + 23);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...INK);
    doc.text(name || '—', x + 5, y + 27.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(`${role}${insp.signatures?.signedAt && sig ? ` · signed ${date(insp.signatures.signedAt)}` : sig ? '' : ' · not signed'}`, x + 5, y + 31.5);
  }
  y += 40;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text(doc.splitTextToSize(DISCLAIMER, CW), M, y);

  // ── Photo appendix: 2 per row, numbered ───────────────────────
  if (photos.length) {
    const caption = new Map<string, string>();
    for (const d of insp.defects) for (const p of d.photoIds) caption.set(p, `${d.code} · ${defectName(d)} (${d.severity})${d.note ? ` — ${d.note}` : ''}`);
    doc.addPage();
    y = 24;
    heading('A', `Photo appendix (${photos.length})`);
    y += 2;
    const gap = 6;
    const cellW = (CW - gap) / 2;
    const cellH = cellW * 0.72;
    photos.forEach((p, i) => {
      const col = i % 2;
      if (col === 0 && i > 0) y += cellH + 12;
      if (y + cellH + 8 > H - 14) {
        doc.addPage();
        y = 24;
      }
      const x = M + col * (cellW + gap);
      const img = photoData.get(p.id)!;
      const s = Math.min(cellW / img.w, cellH / img.h);
      doc.setFillColor(...SOFT);
      doc.rect(x, y, cellW, cellH, 'F');
      doc.addImage(img.url, 'JPEG', x + (cellW - img.w * s) / 2, y + (cellH - img.h * s) / 2, img.w * s, img.h * s);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...INK);
      doc.text(`#${i + 1}`, x, y + cellH + 4.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...MUTED);
      doc.text(doc.splitTextToSize(caption.get(p.id) ?? '', cellW - 8)[0] ?? '', x + 7, y + cellH + 4.5);
    });
  }

  // ── Running header (pages 2+) & footer ───────────────────────
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    if (p > 1) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...INK);
      doc.text(`${companyName} · Quality inspection report`, M, 12);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...MUTED);
      doc.text(`${reportNo} · ${insp.poNumber} · ${insp.style} · ${RESULT_LABEL[overall]}`, W - M, 12, { align: 'right' });
      doc.setDrawColor(...LINE);
      doc.line(M, 14.5, W - M, 14.5);
    }
    doc.setDrawColor(...LINE);
    doc.line(M, H - 12, W - M, H - 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(`${reportNo} · generated ${new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} · QC Inspect`, M, H - 7);
    doc.text(`Page ${p} of ${pages}`, W - M, H - 7, { align: 'right' });
  }

  return doc.output('blob');
}
