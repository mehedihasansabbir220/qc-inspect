export type Severity = 'critical' | 'major' | 'minor';

export interface DefectType {
  code: string;
  category: DefectCategory;
  en: string;
  bn: string;
  severity: Severity; // default classification; inspector can override
}

export type DefectCategory = 'fabric' | 'workmanship' | 'trims' | 'measurement' | 'packing' | 'safety';

export const CATEGORIES: { id: DefectCategory; en: string; bn: string }[] = [
  { id: 'safety', en: 'Safety', bn: 'নিরাপত্তা' },
  { id: 'fabric', en: 'Fabric', bn: 'কাপড়' },
  { id: 'workmanship', en: 'Workmanship', bn: 'সেলাই ও কারিগরি' },
  { id: 'trims', en: 'Trims & accessories', bn: 'ট্রিমস ও এক্সেসরিজ' },
  { id: 'measurement', en: 'Measurement', bn: 'মাপ' },
  { id: 'packing', en: 'Packing & labelling', bn: 'প্যাকিং ও লেবেল' },
];

/** Garment / home-textile defect library. Codes are stable IDs used in sync payloads & reports. */
export const DEFECTS: DefectType[] = [
  { code: 'SAF-01', category: 'safety', en: 'Broken needle / metal found', bn: 'ভাঙা সুই / ধাতব বস্তু', severity: 'critical' },
  { code: 'SAF-02', category: 'safety', en: 'Mould / mildew', bn: 'ছত্রাক / স্যাঁতসেঁতে দাগ', severity: 'critical' },
  { code: 'SAF-03', category: 'safety', en: 'Sharp edge / point', bn: 'ধারালো প্রান্ত', severity: 'critical' },

  { code: 'FAB-01', category: 'fabric', en: 'Hole', bn: 'ছিদ্র', severity: 'major' },
  { code: 'FAB-02', category: 'fabric', en: 'Stain', bn: 'দাগ', severity: 'major' },
  { code: 'FAB-03', category: 'fabric', en: 'Shade variation', bn: 'রঙের তারতম্য', severity: 'major' },
  { code: 'FAB-04', category: 'fabric', en: 'Slub / yarn defect', bn: 'সুতার ত্রুটি', severity: 'minor' },
  { code: 'FAB-05', category: 'fabric', en: 'Oil spot', bn: 'তেলের দাগ', severity: 'major' },

  { code: 'WRK-01', category: 'workmanship', en: 'Broken stitch', bn: 'সেলাই ছেঁড়া', severity: 'major' },
  { code: 'WRK-02', category: 'workmanship', en: 'Skipped stitch', bn: 'সেলাই বাদ পড়া', severity: 'major' },
  { code: 'WRK-03', category: 'workmanship', en: 'Open seam', bn: 'সেলাই খোলা', severity: 'major' },
  { code: 'WRK-04', category: 'workmanship', en: 'Puckering', bn: 'কুঁচকানো সেলাই', severity: 'minor' },
  { code: 'WRK-05', category: 'workmanship', en: 'Uneven hem', bn: 'অসমান হেম', severity: 'minor' },
  { code: 'WRK-06', category: 'workmanship', en: 'Loose / untrimmed thread', bn: 'আলগা সুতা', severity: 'minor' },

  { code: 'TRM-01', category: 'trims', en: 'Missing button', bn: 'বোতাম নেই', severity: 'major' },
  { code: 'TRM-02', category: 'trims', en: 'Zip not working', bn: 'চেইন কাজ করে না', severity: 'major' },
  { code: 'TRM-03', category: 'trims', en: 'Wrong care label', bn: 'ভুল কেয়ার লেবেল', severity: 'major' },

  { code: 'MEA-01', category: 'measurement', en: 'Out of tolerance', bn: 'মাপ সীমার বাইরে', severity: 'major' },

  { code: 'PCK-01', category: 'packing', en: 'Wrong carton marking', bn: 'কার্টনে ভুল মার্কিং', severity: 'minor' },
  { code: 'PCK-02', category: 'packing', en: 'Damaged polybag', bn: 'পলিব্যাগ নষ্ট', severity: 'minor' },
  { code: 'PCK-03', category: 'packing', en: 'Barcode unreadable', bn: 'বারকোড পড়া যায় না', severity: 'major' },
];

export const defectByCode = new Map(DEFECTS.map((d) => [d.code, d]));

/** Points of measure template for a woven/knit top — specs in cm. */
export const DEFAULT_POMS = [
  { pom: 'Chest width (1 cm below armhole)', spec: 52, tol: 1 },
  { pom: 'Body length (HPS)', spec: 70, tol: 1.5 },
  { pom: 'Sleeve length', spec: 62, tol: 1 },
];

export const CHECKLIST = [
  { id: 'approved-sample', en: 'Matches approved sample (colour, hand-feel)', bn: 'অনুমোদিত নমুনার সাথে মিল' },
  { id: 'qty', en: 'Quantity packed matches PO', bn: 'পিও অনুযায়ী পরিমাণ সঠিক' },
  { id: 'carton', en: 'Carton marking & dimensions', bn: 'কার্টন মার্কিং ও মাপ' },
  { id: 'labels', en: 'Main, size & care labels correct', bn: 'লেবেল সঠিক' },
  { id: 'drop-test', en: 'Carton drop test passed', bn: 'কার্টন ড্রপ টেস্ট পাস' },
  { id: 'metal', en: 'Metal detection log reviewed', bn: 'মেটাল ডিটেকশন লগ যাচাই' },
] as const;
