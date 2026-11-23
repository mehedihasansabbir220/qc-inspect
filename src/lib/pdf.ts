import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CHECKLIST, defectByCode } from './defects';
import type { Inspection, Photo } from './db';
import { tally } from './verdict';

const INK: [number, number, number] = [15, 23, 42];
const MUTED: [number, number, number] = [100, 116, 139];
const GREEN: [number, number, number] = [5, 150, 105];
const RED: [number, number, number] = [220, 38, 38];
const AMBER: [number, number, number] = [202, 138, 4];

const TYPE_LABEL: Record<Inspection['type'], string> = { inline: 'Inline', 'pre-final': 'Pre-final', final: 'Final random' };

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function imageSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 4, h: 3 });
    img.src = dataUrl;
  });
}

type DocWithTable = jsPDF & { lastAutoTable?: { finalY: number } };

/**
 * Generates the inspection report as a real PDF on the device — works offline, nothing is
 * sent to a server. Text is English (standard PDF fonts have no Bengali glyphs).
 */
export async function buildReportPdf(insp: Inspection, factoryName: string, photos: Photo[]): Promise<Blob> {
  const doc: DocWithTable = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 14;
  const c = tally(insp.defects);
  const { plan } = insp;
  const verdictColor = insp.verdict === 'pass' ? GREEN : insp.verdict === 'fail' ? RED : AMBER;
  const fmt = (ts?: number) => (ts ? new Date(ts).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

  // Header band
  doc.setFillColor(...INK);
  doc.rect(0, 0, W, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('QUALITY INSPECTION REPORT', M, 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`${TYPE_LABEL[insp.type]} inspection  ·  ${insp.poNumber}  ·  ${insp.style}`, M, 21);
  doc.text(factoryName, W - M, 21, { align: 'right' });

  // Verdict block
  let y = 38;
  doc.setFillColor(...verdictColor);
  doc.roundedRect(M, y, W - 2 * M, 22, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text(insp.verdict === 'in-progress' ? 'IN PROGRESS' : insp.verdict.toUpperCase(), M + 6, y + 14);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const summary = [
    `Sample ${insp.inspected}/${plan.sampleSize}`,
    `Critical ${c.critical} (Ac ${plan.critical.ac})`,
    `Major ${c.major} (Ac ${plan.major.ac})`,
    `Minor ${c.minor} (Ac ${plan.minor.ac})`,
  ].join('     ');
  doc.text(summary, W - M - 6, y + 13, { align: 'right' });
  y += 30;

  const tableBase = {
    margin: { left: M, right: M },
    styles: { fontSize: 9, cellPadding: 2.2, textColor: INK, lineColor: [226, 232, 240] as [number, number, number], lineWidth: 0.2 },
    headStyles: { fillColor: [241, 245, 249] as [number, number, number], textColor: MUTED, fontStyle: 'bold' as const },
  };
  const section = (title: string) => {
    y = (doc.lastAutoTable?.finalY ?? y) + 8;
    if (y > 270) {
      doc.addPage();
      y = 18;
    }
    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(title, M, y);
    y += 2;
  };

  // Details
  autoTable(doc, {
    ...tableBase,
    startY: y,
    theme: 'grid',
    body: [
      ['Factory', factoryName, 'PO number', insp.poNumber],
      ['Style', insp.style, 'Product', insp.productCategory],
      ['Lot size', insp.lotSize.toLocaleString('en'), 'Inspection level / code', `${plan.level} / ${plan.codeLetter}`],
      ['AQL major / minor', `${plan.major.aql} / ${plan.minor.aql}`, 'Inspector', insp.inspector],
      ['Created', fmt(insp.createdAt), 'Completed', fmt(insp.completedAt)],
    ],
    columnStyles: { 0: { textColor: MUTED, cellWidth: 32 }, 2: { textColor: MUTED, cellWidth: 40 } },
  });

  section('Sampling plan (ISO 2859-1, single sampling, normal)');
  autoTable(doc, {
    ...tableBase,
    startY: y + 2,
    head: [['Class', 'AQL', 'Accept (Ac)', 'Reject (Re)', 'Found', 'Result']],
    body: (['critical', 'major', 'minor'] as const).map((s) => [
      s[0].toUpperCase() + s.slice(1),
      s === 'critical' ? '0' : plan[s].aql,
      plan[s].ac,
      plan[s].re,
      c[s],
      c[s] >= plan[s].re ? 'REJECT' : 'OK',
    ]),
    didParseCell: (d) => {
      if (d.section === 'body' && d.column.index === 5) d.cell.styles.textColor = d.cell.raw === 'REJECT' ? RED : GREEN;
    },
  });

  section(`Defects (${c.critical + c.major + c.minor})`);
  autoTable(doc, {
    ...tableBase,
    startY: y + 2,
    head: [['Code', 'Defect', 'Severity', 'Qty', 'Note', 'Photos']],
    body: insp.defects.length
      ? insp.defects.map((d) => [d.code, defectByCode.get(d.code)?.en ?? d.code, d.severity, d.qty, d.note ?? '', d.photoIds.length || ''])
      : [['—', 'No defects recorded', '', '', '', '']],
    didParseCell: (d) => {
      if (d.section === 'body' && d.column.index === 2) d.cell.styles.textColor = d.cell.raw === 'critical' ? RED : d.cell.raw === 'major' ? [234, 88, 12] : AMBER;
    },
  });

  section('Measurements (cm)');
  autoTable(doc, {
    ...tableBase,
    startY: y + 2,
    head: [['Point of measure', 'Spec', 'Tol ±', 'P1', 'P2', 'P3', 'P4', 'P5']],
    body: insp.measurements.map((m) => [m.pom, m.spec, m.tol, ...m.values.map((v) => (v == null ? '—' : v))]),
    didParseCell: (d) => {
      if (d.section !== 'body' || d.column.index < 3) return;
      const m = insp.measurements[d.row.index];
      const v = m.values[d.column.index - 3];
      if (v != null) d.cell.styles.textColor = Math.abs(v - m.spec) > m.tol ? RED : GREEN;
    },
  });

  section('Checklist');
  autoTable(doc, {
    ...tableBase,
    startY: y + 2,
    body: CHECKLIST.map((ci) => [ci.en, (insp.checklist[ci.id] ?? '—').toString().toUpperCase()]),
    columnStyles: { 1: { cellWidth: 22, halign: 'center', fontStyle: 'bold' } },
    didParseCell: (d) => {
      if (d.column.index === 1) d.cell.styles.textColor = d.cell.raw === 'OK' ? GREEN : d.cell.raw === 'NOK' ? RED : MUTED;
    },
  });

  if (insp.comments) {
    section('Inspector comments');
    autoTable(doc, { ...tableBase, startY: y + 2, theme: 'plain', body: [[insp.comments]] });
  }

  if (insp.attachments?.length) {
    section('Attached documents');
    autoTable(doc, { ...tableBase, startY: y + 2, body: insp.attachments.map((a) => [a.name, `${(a.bytes / 1024).toFixed(0)} KB`]) });
  }

  // Photos — 3 per row
  if (photos.length) {
    const caption = new Map<string, string>();
    for (const d of insp.defects) for (const p of d.photoIds) caption.set(p, `${d.code} · ${defectByCode.get(d.code)?.en ?? ''}`);
    doc.addPage();
    y = 18;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(`Photos (${photos.length})`, M, y);
    y += 5;
    const gap = 4;
    const cellW = (W - 2 * M - 2 * gap) / 3;
    const cellH = cellW * 0.75;
    for (let i = 0; i < photos.length; i++) {
      const col = i % 3;
      if (col === 0 && i > 0) y += cellH + 9;
      if (y + cellH > 285) {
        doc.addPage();
        y = 18;
      }
      const x = M + col * (cellW + gap);
      const url = await blobToDataUrl(photos[i].blob);
      const { w, h } = await imageSize(url);
      const scale = Math.min(cellW / w, cellH / h);
      doc.setFillColor(241, 245, 249);
      doc.rect(x, y, cellW, cellH, 'F');
      doc.addImage(url, 'JPEG', x + (cellW - w * scale) / 2, y + (cellH - h * scale) / 2, w * scale, h * scale);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...MUTED);
      doc.text(caption.get(photos[i].id) ?? '', x, y + cellH + 4, { maxWidth: cellW });
    }
  }

  // Footer on every page
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated ${new Date().toLocaleString('en-GB')} by QC Inspect · ID ${insp.id}`, M, 290);
    doc.text(`Page ${p} of ${pages}`, W - M, 290, { align: 'right' });
  }

  return doc.output('blob');
}
