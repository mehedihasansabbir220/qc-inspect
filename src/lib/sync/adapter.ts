import type { Attachment, Inspection, Photo } from '../db';

/** What goes over the wire: the inspection without device-local fields. */
export type InspectionPayload = Omit<Inspection, 'syncState' | 'access' | 'syncedAt'>;

export interface RemoteInspection {
  id: string;
  version: number;
  data: InspectionPayload;
  ownerEmail?: string;
  isOwner: boolean;
  canDownload: boolean;
  canEdit: boolean;
  updatedAt: string; // server timestamp (ISO)
  /** Why I can see it: my own, shared with me by link, or team view (I'm a QA manager). */
  via?: 'owner' | 'share' | 'team';
}

/**
 * The sync engine talks to a backend only through this interface. The demo ships a
 * mock server; the Supabase adapter implements the same contract. The offline queue,
 * retries and UI stay untouched whichever backend is plugged in.
 */
export interface SyncAdapter {
  /** Idempotent upsert. Must reject with ConflictError if server holds a newer version. */
  pushInspection(inspection: InspectionPayload): Promise<{ serverVersion: number }>;
  /** Idempotent upload keyed by photo.id. */
  pushPhoto(photo: Photo): Promise<{ url: string }>;
  /** Idempotent upload keyed by attachment.id. */
  pushAttachment?(attachment: Attachment): Promise<void>;
  /** Two-way sync: records changed on the server since `since`, plus everything shared with me. */
  pullInspections?(since: string): Promise<RemoteInspection[]>;
  /** Owner deletes an inspection with all its files. Must succeed if it's already gone. */
  deleteInspection?(id: string): Promise<void>;
  /** Fetch a stored file (photo / attachment) by its storage path. */
  downloadFile?(path: string): Promise<Blob>;
}

export class ConflictError extends Error {
  constructor(public serverVersion: number) {
    super(`Server has newer version ${serverVersion}`);
  }
}

/** Not retryable — the user lacks permission (e.g. edit access was revoked). */
export class PermissionError extends Error {}

export class NetworkError extends Error {}
