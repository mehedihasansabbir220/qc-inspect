import type { Inspection, Photo } from '../db';

/**
 * The sync engine talks to a backend only through this interface. The demo ships a
 * mock server; swapping in Supabase, Firebase or a REST API means implementing
 * these two methods — the offline queue, retries and UI stay untouched.
 */
export interface SyncAdapter {
  /** Idempotent upsert. Must reject with ConflictError if server holds a newer version. */
  pushInspection(inspection: Omit<Inspection, 'syncState'>): Promise<{ serverVersion: number }>;
  /** Idempotent upload keyed by photo.id. */
  pushPhoto(photo: Photo): Promise<{ url: string }>;
}

export class ConflictError extends Error {
  constructor(public serverVersion: number) {
    super(`Server has newer version ${serverVersion}`);
  }
}

export class NetworkError extends Error {}
