// Generates docs/BANGLA_REVIEW.md — every Bangla string in the app next to its English source,
// for review by a native-speaking QC professional.  Run: npx vite-node scripts/bangla-review.ts
import { writeFileSync } from 'node:fs';
import { CATEGORIES, CHECKLIST, DEFECTS } from '../src/lib/defects';
import { BUYERS, TEMPLATES } from '../src/lib/templates';
import { DICT } from '../src/lib/i18n';

const rows: [string, string, string][] = [];
const add = (area: string, en: string, bn: string) => rows.push([area, en, bn]);
for (const [k, v] of Object.entries(DICT)) add(`UI · ${k}`, v.en, v.bn);
for (const c of CATEGORIES) add('Defect category', c.en, c.bn);
for (const d of DEFECTS) add(`Defect ${d.code}`, d.en, d.bn);
for (const c of CHECKLIST) add('Checklist (core)', c.en, c.bn);
for (const t of TEMPLATES) {
  add('Template', t.en, t.bn);
  for (const c of t.tests) add(`Test · ${t.en}`, c.en, c.bn);
}
for (const b of BUYERS) for (const c of b.checks) add(`Buyer · ${b.name}`, c.en, c.bn);

const md = [
  '# Bangla review sheet',
  '',
  'Every Bangla text shown in QC Inspect, next to its English source. Please ask a native-speaking QC',
  'inspector to mark each line **OK** or write a better term — the words used on the factory floor',
  '(often English loan words like "stitch", "carton", "shade") matter more than dictionary Bangla.',
  '',
  `Generated from the source code — ${rows.length} strings. Regenerate: \`npx vite-node scripts/bangla-review.ts\``,
  '',
  '| # | Where | English | বাংলা (current) | OK? / Better term |',
  '|---|---|---|---|---|',
  ...rows.map(([a, en, bn], i) => `| ${i + 1} | ${a} | ${en.replace(/\|/g, '/')} | ${bn.replace(/\|/g, '/')} | |`),
  '',
].join('\n');
writeFileSync('docs/BANGLA_REVIEW.md', md);
console.log(`docs/BANGLA_REVIEW.md — ${rows.length} strings`);
