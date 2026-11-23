import Dexie, { type EntityTable } from 'dexie';
import type { AqlValue, InspectionLevel, SamplingPlan } from './aql';
import type { Severity } from './defects';
import type { Verdict } from './verdict';

export type InspectionType = 'inline' | 'pre-final' | 'final';
export type SyncState = 'local' | 'pending' | 'synced' | 'error';

export interface DefectEntry {
  id: string;
  code: string;
  severity: Severity;
  qty: number;
  note?: string;
  photoIds: string[];
  at: number;
}

export interface Measurement {
  pom: string;
  spec: number;
  tol: number;
  values: (number | null)[];
}

export interface Inspection {
  id: string;
  createdAt: number;
  updatedAt: number;
  /** Monotonic version for optimistic concurrency with the server. */
  version: number;
  status: 'draft' | 'completed';
  syncState: SyncState;
  syncedAt?: number;
  factoryId: string;
  poNumber: string;
  style: string;
  productCategory: string;
  type: InspectionType;
  lotSize: number;
  level: InspectionLevel;
  aqlMajor: AqlValue;
  aqlMinor: AqlValue;
  plan: SamplingPlan;
  inspected: number;
  defects: DefectEntry[];
  measurements: Measurement[];
  checklist: Record<string, 'ok' | 'nok' | 'na' | undefined>;
  comments: string;
  inspector: string;
  verdict: Verdict;
  completedAt?: number;
}

export interface Photo {
  id: string;
  inspectionId: string;
  blob: Blob;
  width: number;
  height: number;
  originalBytes: number;
  bytes: number;
  createdAt: number;
  uploaded: boolean;
}

export interface OutboxItem {
  id?: number;
  kind: 'inspection' | 'photo';
  refId: string;
  attempts: number;
  nextAttemptAt: number;
  createdAt: number;
  /** Bumped on every re-enqueue so an edit made while a push is in flight is never lost. */
  enqueuedAt: number;
  lastError?: string;
}

export interface Factory {
  id: string;
  name: string;
  location: string;
}

export interface Setting {
  key: string;
  value: unknown;
}

export class QcDatabase extends Dexie {
  inspections!: EntityTable<Inspection, 'id'>;
  photos!: EntityTable<Photo, 'id'>;
  outbox!: EntityTable<OutboxItem, 'id'>;
  factories!: EntityTable<Factory, 'id'>;
  settings!: EntityTable<Setting, 'key'>;

  constructor(name = 'qc-inspect') {
    super(name);
    // Only indexed fields are listed; Dexie stores the full object.
    this.version(1).stores({
      inspections: 'id, updatedAt, status, syncState, factoryId',
      photos: 'id, inspectionId, uploaded',
      outbox: '++id, [kind+refId], nextAttemptAt',
      factories: 'id',
      settings: 'key',
    });
  }
}

export const db = new QcDatabase();

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // Fallback for insecure contexts (e.g. testing over plain-http LAN IP)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return (row?.value as T) ?? fallback;
}

export function setSetting(key: string, value: unknown) {
  return db.settings.put({ key, value });
}
