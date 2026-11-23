import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type Lang = 'en' | 'bn';

export const DICT = {
  inspections: { en: 'Inspections', bn: 'পরিদর্শন' },
  insights: { en: 'Insights', bn: 'বিশ্লেষণ' },
  settings: { en: 'Settings', bn: 'সেটিংস' },
  newInspection: { en: 'New inspection', bn: 'নতুন পরিদর্শন' },
  online: { en: 'Online', bn: 'অনলাইন' },
  offline: { en: 'Offline', bn: 'অফলাইন' },
  syncing: { en: 'Syncing', bn: 'সিঙ্ক হচ্ছে' },
  allSynced: { en: 'All synced', bn: 'সব সিঙ্ক হয়েছে' },
  pending: { en: 'pending', bn: 'অপেক্ষমাণ' },
  savedOnDevice: { en: 'Saved on device', bn: 'ডিভাইসে সংরক্ষিত' },
  factory: { en: 'Factory', bn: 'ফ্যাক্টরি' },
  poNumber: { en: 'PO number', bn: 'পিও নম্বর' },
  style: { en: 'Style', bn: 'স্টাইল' },
  product: { en: 'Product', bn: 'পণ্য' },
  inspectionType: { en: 'Inspection type', bn: 'পরিদর্শনের ধরন' },
  inline: { en: 'Inline', bn: 'ইনলাইন' },
  'pre-final': { en: 'Pre-final', bn: 'প্রি-ফাইনাল' },
  final: { en: 'Final random', bn: 'ফাইনাল' },
  lotSize: { en: 'Lot size (pcs)', bn: 'লটের পরিমাণ (পিস)' },
  level: { en: 'Inspection level', bn: 'পরিদর্শন স্তর' },
  samplingPlan: { en: 'Sampling plan', bn: 'নমুনা পরিকল্পনা' },
  sample: { en: 'Sample', bn: 'নমুনা' },
  start: { en: 'Start inspection', bn: 'পরিদর্শন শুরু করুন' },
  critical: { en: 'Critical', bn: 'সংকটপূর্ণ' },
  major: { en: 'Major', bn: 'প্রধান' },
  minor: { en: 'Minor', bn: 'গৌণ' },
  defects: { en: 'Defects', bn: 'ত্রুটি' },
  measure: { en: 'Measure', bn: 'মাপ' },
  checklist: { en: 'Checklist', bn: 'চেকলিস্ট' },
  finish: { en: 'Finish', bn: 'শেষ' },
  piecesInspected: { en: 'Pieces inspected', bn: 'পরিদর্শিত পিস' },
  pass: { en: 'Pass', bn: 'পাস' },
  fail: { en: 'Fail', bn: 'ফেল' },
  'in-progress': { en: 'In progress', bn: 'চলমান' },
  draft: { en: 'Draft', bn: 'খসড়া' },
  logDefect: { en: 'Log defect', bn: 'ত্রুটি যোগ করুন' },
  addPhoto: { en: 'Add photo', bn: 'ছবি যোগ করুন' },
  note: { en: 'Note (optional)', bn: 'মন্তব্য (ঐচ্ছিক)' },
  quantity: { en: 'Quantity', bn: 'পরিমাণ' },
  severity: { en: 'Severity', bn: 'তীব্রতা' },
  loggedDefects: { en: 'Logged defects', bn: 'যোগ করা ত্রুটি' },
  noDefects: { en: 'No defects logged yet.', bn: 'এখনো কোনো ত্রুটি নেই।' },
  comments: { en: 'Inspector comments', bn: 'পরিদর্শকের মন্তব্য' },
  inspector: { en: 'Inspector', bn: 'পরিদর্শক' },
  complete: { en: 'Complete & queue for sync', bn: 'সম্পন্ন করুন ও সিঙ্কে পাঠান' },
  viewReport: { en: 'View report', bn: 'রিপোর্ট দেখুন' },
  cancel: { en: 'Cancel', bn: 'বাতিল' },
  language: { en: 'Language', bn: 'ভাষা' },
  syncNow: { en: 'Sync now', bn: 'এখনই সিঙ্ক করুন' },
  buyer: { en: 'Buyer / client', bn: 'ক্রেতা' },
  next: { en: 'Next', bn: 'পরবর্তী' },
  back: { en: 'Back', bn: 'পিছনে' },
  searchDefects: { en: 'Search defects…', bn: 'ত্রুটি খুঁজুন…' },
  continueInspection: { en: 'Continue inspection', bn: 'পরিদর্শন চালিয়ে যান' },
  resultPending: { en: 'Pending', bn: 'বিবেচনাধীন' },
  signatures: { en: 'Signatures', bn: 'স্বাক্ষর' },
  factoryRep: { en: 'Factory representative', bn: 'ফ্যাক্টরি প্রতিনিধি' },
  shareWithBuyer: { en: 'Share with buyer', bn: 'ক্রেতার সাথে শেয়ার করুন' },
  summaryOfResults: { en: 'Summary of results', bn: 'ফলাফলের সারাংশ' },
  clear: { en: 'Clear', bn: 'মুছুন' },
  signHere: { en: 'Sign here', bn: 'এখানে স্বাক্ষর করুন' },
} as const;

export type TKey = keyof typeof DICT;

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: TKey) => string;
  /** Pick the right field from a bilingual record like a defect type. */
  pick: (r: { en: string; bn: string }) => string;
}

const Ctx = createContext<I18n | null>(null);

function initialLang(): Lang {
  try {
    return localStorage.getItem('qc.lang') === 'bn' ? 'bn' : 'en';
  } catch {
    return 'en';
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    document.documentElement.lang = l;
    try {
      localStorage.setItem('qc.lang', l);
    } catch {
      /* ignore */
    }
  }, []);
  const value = useMemo<I18n>(
    () => ({ lang, setLang, t: (k) => DICT[k][lang], pick: (r) => r[lang] }),
    [lang, setLang],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n outside provider');
  return v;
}
