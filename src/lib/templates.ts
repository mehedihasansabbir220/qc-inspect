import type { AqlValue, InspectionLevel } from './aql';
import { CATEGORIES, CHECKLIST, DEFECTS, defectByCode, type ChecklistItem, type DefectType } from './defects';
import type { Inspection } from './db';

/**
 * Inspection templates: what to check for each product type.
 *
 * Templates are plain data. A new product type (or a buyer's own QA manual) is a new entry
 * here — no code changes. Each inspection stores a *snapshot* of its checklist and points of
 * measure, so editing a template later never changes a report that was already issued.
 * Roadmap: manage templates in the database through an admin screen.
 */
export type Unit = 'cm' | 'mm' | 'g';

export interface PomTemplate {
  pom: string;
  spec: number;
  tol: number;
  unit: Unit;
}

export interface InspectionTemplate {
  id: string;
  group: 'Soft goods' | 'Hard goods';
  en: string;
  bn: string;
  products: string[];
  /** Defect codes offered in the defect library for this product type. */
  defects: string[];
  /** Core checks to keep (by id) + product-specific tests. */
  coreChecks: string[];
  tests: ChecklistItem[];
  poms: PomTemplate[];
}

const SAFETY_SOFT = ['SAF-01', 'SAF-02', 'SAF-03'];
const PACKING = ['PCK-01', 'PCK-02', 'PCK-03'];
const ALL_CORE = CHECKLIST.map((c) => c.id);
const test = (id: string, en: string, bn: string): ChecklistItem => ({ id: `t-${id}`, en, bn, section: 'tests' });

export const TEMPLATES: InspectionTemplate[] = [
  {
    id: 'apparel-top',
    group: 'Soft goods',
    en: 'Apparel — tops',
    bn: 'পোশাক — টপস',
    products: ['Knit T-shirt', 'Woven shirt', 'Polo shirt', 'Sweater / knitwear', 'Dress'],
    defects: [...SAFETY_SOFT, 'FAB-01', 'FAB-02', 'FAB-03', 'FAB-04', 'FAB-05', 'WRK-01', 'WRK-02', 'WRK-03', 'WRK-04', 'WRK-05', 'WRK-06', 'TRM-01', 'TRM-02', 'TRM-03', 'MEA-01', ...PACKING],
    coreChecks: ALL_CORE,
    tests: [test('seam-strength', 'Seam strength (pull) test', 'সেলাইয়ের শক্তি পরীক্ষা'), test('button-pull', 'Button pull test', 'বোতাম টান পরীক্ষা')],
    poms: [
      { pom: 'Chest width (1 cm below armhole)', spec: 52, tol: 1, unit: 'cm' },
      { pom: 'Body length (HPS)', spec: 70, tol: 1.5, unit: 'cm' },
      { pom: 'Sleeve length', spec: 62, tol: 1, unit: 'cm' },
    ],
  },
  {
    id: 'apparel-bottom',
    group: 'Soft goods',
    en: 'Apparel — bottoms',
    bn: 'পোশাক — বটমস',
    products: ['Denim jeans', 'Chino trousers', 'Shorts', 'Skirt'],
    defects: [...SAFETY_SOFT, 'FAB-01', 'FAB-02', 'FAB-03', 'FAB-05', 'WRK-01', 'WRK-02', 'WRK-03', 'WRK-04', 'WRK-05', 'WRK-06', 'TRM-01', 'TRM-02', 'TRM-03', 'MEA-01', ...PACKING],
    coreChecks: ALL_CORE,
    tests: [test('zip-rivet', 'Zip & rivet pull test', 'চেইন ও রিভেট টান পরীক্ষা'), test('wash-shrink', 'Shrinkage after wash within limit', 'ধোয়ার পর সংকোচন সীমার মধ্যে')],
    poms: [
      { pom: 'Waist (relaxed)', spec: 40, tol: 1, unit: 'cm' },
      { pom: 'Hip (half)', spec: 52, tol: 1, unit: 'cm' },
      { pom: 'Inseam', spec: 81, tol: 1.5, unit: 'cm' },
      { pom: 'Front rise', spec: 27, tol: 0.6, unit: 'cm' },
    ],
  },
  {
    id: 'towel',
    group: 'Soft goods',
    en: 'Home textile — towels',
    bn: 'হোম টেক্সটাইল — তোয়ালে',
    products: ['Bath towel', 'Hand towel', 'Bath mat', 'Beach towel'],
    defects: ['SAF-02', 'FAB-01', 'FAB-02', 'FAB-03', 'FAB-05', 'HT-01', 'HT-02', 'HT-04', 'WRK-01', 'WRK-03', 'WRK-06', 'TRM-03', 'MEA-01', ...PACKING],
    coreChecks: ['approved-sample', 'qty', 'carton', 'labels', 'drop-test'],
    tests: [test('absorbency', 'Absorbency (water drop) test', 'শোষণ ক্ষমতা পরীক্ষা'), test('gsm', 'Weight / GSM within spec', 'ওজন / জিএসএম সঠিক')],
    poms: [
      { pom: 'Length', spec: 140, tol: 2, unit: 'cm' },
      { pom: 'Width', spec: 70, tol: 1.5, unit: 'cm' },
      { pom: 'Weight per piece', spec: 500, tol: 25, unit: 'g' },
    ],
  },
  {
    id: 'bed-linen',
    group: 'Soft goods',
    en: 'Home textile — bed linen',
    bn: 'হোম টেক্সটাইল — বিছানার চাদর',
    products: ['Duvet cover set', 'Fitted sheet', 'Flat sheet', 'Pillowcase'],
    defects: ['SAF-01', 'SAF-02', 'FAB-01', 'FAB-02', 'FAB-03', 'FAB-04', 'FAB-05', 'HT-02', 'HT-03', 'HT-04', 'WRK-01', 'WRK-02', 'WRK-03', 'WRK-06', 'TRM-01', 'TRM-02', 'TRM-03', 'MEA-01', ...PACKING],
    coreChecks: ALL_CORE,
    tests: [test('rub-fastness', 'Colour fastness to rubbing (on-site)', 'ঘষায় রঙ স্থায়িত্ব পরীক্ষা'), test('closure', 'Closure (buttons / zip) works', 'বোতাম / চেইন ঠিকমতো কাজ করে')],
    poms: [
      { pom: 'Duvet cover length', spec: 220, tol: 3, unit: 'cm' },
      { pom: 'Duvet cover width', spec: 140, tol: 2, unit: 'cm' },
      { pom: 'Pillowcase length', spec: 80, tol: 1.5, unit: 'cm' },
    ],
  },
  {
    id: 'ceramics',
    group: 'Hard goods',
    en: 'Tableware & ceramics',
    bn: 'টেবিলওয়্যার ও সিরামিক',
    products: ['Dinner plate', 'Bowl', 'Mug', 'Serving platter'],
    defects: ['SAF-03', 'CER-01', 'CER-02', 'CER-03', 'CER-04', 'CER-05', 'CER-06', 'MEA-01', ...PACKING],
    coreChecks: ['approved-sample', 'qty', 'carton', 'labels', 'drop-test'],
    tests: [
      test('food-contact', 'Food-contact compliance documents (EU 1935/2004)', 'খাদ্য-সংস্পর্শ সম্মতির কাগজপত্র'),
      test('thermal-shock', 'Thermal shock test', 'তাপমাত্রা পরিবর্তন পরীক্ষা'),
      test('stacking', 'Stacking / fit check', 'স্তূপ করে রাখার পরীক্ষা'),
    ],
    poms: [
      { pom: 'Diameter', spec: 270, tol: 2, unit: 'mm' },
      { pom: 'Height', spec: 25, tol: 1, unit: 'mm' },
      { pom: 'Weight', spec: 650, tol: 20, unit: 'g' },
    ],
  },
  {
    id: 'furniture',
    group: 'Hard goods',
    en: 'Furniture & home décor',
    bn: 'আসবাবপত্র ও গৃহসজ্জা',
    products: ['Dining table', 'Chair', 'Side table', 'Shelf unit'],
    defects: ['SAF-03', 'FUR-01', 'FUR-02', 'FUR-03', 'FUR-04', 'FUR-05', 'FUR-06', 'MEA-01', ...PACKING],
    coreChecks: ['approved-sample', 'qty', 'carton', 'labels', 'drop-test'],
    tests: [
      test('stability', 'Stability / wobble test', 'স্থিতিশীলতা পরীক্ষা'),
      test('assembly', 'Assembly test with instructions', 'নির্দেশনা অনুযায়ী জোড়া লাগানোর পরীক্ষা'),
      test('load', 'Static load test', 'ভার বহন পরীক্ষা'),
      test('moisture', 'Wood moisture content ≤ 12 %', 'কাঠের আর্দ্রতা ১২% এর কম'),
    ],
    poms: [
      { pom: 'Width', spec: 120, tol: 0.5, unit: 'cm' },
      { pom: 'Depth', spec: 60, tol: 0.5, unit: 'cm' },
      { pom: 'Height', spec: 75, tol: 0.5, unit: 'cm' },
    ],
  },
];

export const templateById = new Map(TEMPLATES.map((t) => [t.id, t]));
export const DEFAULT_TEMPLATE = TEMPLATES[0];

/** Buyer QA-manual profiles: their default AQL and extra requirements (fictional demo buyers). */
export interface BuyerProfile {
  name: string;
  level: InspectionLevel;
  aqlMajor: AqlValue;
  aqlMinor: AqlValue;
  checks: ChecklistItem[];
}

const buyer = (id: string, en: string, bn: string): ChecklistItem => ({ id: `b-${id}`, en, bn, section: 'buyer' });

export const BUYERS: BuyerProfile[] = [
  {
    name: 'Nordic Home AB',
    level: 'II',
    aqlMajor: '2.5',
    aqlMinor: '4.0',
    checks: [buyer('reach', 'REACH chemical compliance declaration on file', 'রিচ রাসায়নিক সম্মতির ঘোষণাপত্র আছে'), buyer('fsc', 'FSC / OEKO-TEX certificate valid for this order', 'এফএসসি / ওকো-টেক্স সনদ বৈধ')],
  },
  {
    name: 'Maison Lumière',
    level: 'II',
    aqlMajor: '1.5',
    aqlMinor: '2.5',
    checks: [buyer('shade-band', 'Checked against approved shade band', 'অনুমোদিত শেড ব্যান্ডের সাথে মিলানো হয়েছে'), buyer('hangtag', 'Hang-tag & price ticket per brand manual', 'ব্র্যান্ড নির্দেশিকা অনুযায়ী হ্যাংট্যাগ')],
  },
  {
    name: 'Value Retail UK',
    level: 'II',
    aqlMajor: '4.0',
    aqlMinor: '6.5',
    checks: [buyer('ean', 'EAN-13 barcode scans correctly', 'ইএএন-১৩ বারকোড ঠিকমতো স্ক্যান হয়')],
  },
];

export const buyerByName = (name?: string) => BUYERS.find((b) => b.name.toLowerCase() === name?.trim().toLowerCase());

/** Checklist snapshot for a new inspection: template core checks + product tests + buyer requirements. */
export function buildChecklist(t: InspectionTemplate, buyerName?: string): ChecklistItem[] {
  return [...CHECKLIST.filter((c) => t.coreChecks.includes(c.id)), ...t.tests, ...(buyerByName(buyerName)?.checks ?? [])];
}

// ── Accessors that also work for inspections created before templates existed ──

export function checklistOf(i: Pick<Inspection, 'checklistItems'>): ChecklistItem[] {
  return i.checklistItems ?? CHECKLIST;
}

export function templateOf(i: Pick<Inspection, 'templateId'>): InspectionTemplate {
  return templateById.get(i.templateId ?? '') ?? DEFAULT_TEMPLATE;
}

export function defectsOf(i: Pick<Inspection, 'templateId'>): DefectType[] {
  return templateOf(i).defects.map((c) => defectByCode.get(c)).filter((d): d is DefectType => !!d);
}

export function categoriesOf(i: Pick<Inspection, 'templateId'>) {
  const used = new Set(defectsOf(i).map((d) => d.category));
  return CATEGORIES.filter((c) => used.has(c.id));
}

export { DEFECTS };
