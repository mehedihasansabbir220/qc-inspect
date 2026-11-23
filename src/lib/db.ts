import Dexie, { type EntityTable } from 'dexie';
import type { AqlValue, InspectionLevel, SamplingPlan } from './aql';
import type { ChecklistItem, Severity } from './defects';
import type { Verdict } from './verdict';

export type InspectionType = 'inline' | 'pre-final' | 'final';
export type SyncState = 'local' | 'pending' | 'synced' | 'error';

export interface DefectEntry {
  id: string;
  code: string;
  /** Inspector's own description (used for "Other" defects). */
  label?: string;
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
  unit?: 'cm' | 'mm' | 'g';
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
  /** Snapshot so the name still shows on devices that don't have this factory in master data. */
  factoryName?: string;
  factoryLocation?: string;
  /** Inspection template (product type). Missing on records created before templates → apparel. */
  templateId?: string;
  /** Snapshot of the checklist at creation, so later template edits never change issued reports. */
  checklistItems?: ChecklistItem[];
  /** Buyer / client the goods are inspected for (shown on the report cover). */
  buyer?: string;
  /** Factory representative who witnessed the inspection and signs the report. */
  factoryRep?: string;
  /** PNG data-URLs captured on screen. Small (~10 KB), so they travel inside the record. */
  signatures?: { inspector?: string; factory?: string; signedAt?: number };
  attachments?: AttachmentMeta[];
  /** Local-only: when the report was last sent to Google Drive, and the file link. */
  exportedAt?: number;
  driveUrl?: string;
  /** Local-only: who owns this record and what this user may do with it. Never pushed. */
  access?: Access;
}

export interface Access {
  /** owner = mine · shared = via a link · team = I'm a QA manager (read-only) */
  role: 'owner' | 'shared' | 'team';
  ownerEmail?: string;
  canDownload: boolean;
  canEdit: boolean;
}

export const OWNER_ACCESS: Access = { role: 'owner', canDownload: true, canEdit: true };

export interface AttachmentMeta {
  id: string;
  name: string;
  bytes: number;
  addedAt: number;
}

/** An uploaded document (e.g. a third-party inspection report PDF). */
export interface Attachment {
  id: string;
  inspectionId: string;
  name: string;
  blob: Blob;
  bytes: number;
  createdAt: number;
  uploaded: boolean;
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
  kind: 'inspection' | 'photo' | 'attachment' | 'export' | 'delete';
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
  attachments!: EntityTable<Attachment, 'id'>;
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
    this.version(2).stores({
      attachments: 'id, inspectionId, uploaded',
    });
  }
}

export const db = new QcDatabase();

export const filePath = {
  photo: (inspectionId: string, id: string) => `${inspectionId}/photos/${id}.jpg`,
  attachment: (inspectionId: string, id: string) => `${inspectionId}/attachments/${id}.pdf`,
};

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
