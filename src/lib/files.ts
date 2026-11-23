import type { Inspection } from './db';

export function reportFileName(insp: Pick<Inspection, 'poNumber' | 'style' | 'type'>) {
  return `QC-${insp.type}-${insp.poNumber}-${insp.style}.pdf`.replace(/[^\w.-]+/g, '_');
}

export function downloadBlob(blob: Blob, name: string) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
