import type { OutboxItem, QcDatabase } from '../db';
import { ConflictError, type SyncAdapter } from './adapter';
import { backoffDelay } from './backoff';

export interface SyncStatus {
  running: boolean;
  lastRunAt?: number;
  lastSuccessAt?: number;
  lastError?: string;
}

export interface SyncDeps {
  db: QcDatabase;
  adapter: SyncAdapter;
  isOnline: () => boolean;
  now?: () => number;
}

/**
 * Outbox-pattern sync engine.
 *
 *  1. Every write lands in IndexedDB first (the device is the source of truth while offline).
 *  2. A durable outbox row records "this entity needs pushing" — it survives app kills & reboots.
 *  3. The engine drains the outbox when connectivity returns, photos before the inspection
 *     that references them, with exponential backoff + jitter on failure.
 *  4. Uploads are idempotent (keyed by client-generated UUID), so a retry after a timeout
 *     that actually succeeded server-side never creates duplicates.
 */
export function createSyncEngine({ db, adapter, isOnline, now = Date.now }: SyncDeps) {
  let status: SyncStatus = { running: false };
  const listeners = new Set<() => void>();
  const setStatus = (patch: Partial<SyncStatus>) => {
    status = { ...status, ...patch };
    listeners.forEach((l) => l());
  };

  async function enqueue(kind: OutboxItem['kind'], refId: string) {
    const t = now();
    await db.transaction('rw', db.outbox, async () => {
      const existing = await db.outbox.where('[kind+refId]').equals([kind, refId]).first();
      if (existing) {
        await db.outbox.update(existing.id!, { enqueuedAt: t, nextAttemptAt: t, attempts: 0 });
      } else {
        await db.outbox.add({ kind, refId, attempts: 0, nextAttemptAt: t, createdAt: t, enqueuedAt: t });
      }
    });
  }

  async function process(item: OutboxItem) {
    if (item.kind === 'photo') {
      const photo = await db.photos.get(item.refId);
      if (!photo) return; // deleted locally — nothing to do
      await adapter.pushPhoto(photo);
      await db.photos.update(photo.id, { uploaded: true });
      return;
    }

    const inspection = await db.inspections.get(item.refId);
    if (!inspection) return;
    const waiting = await db.photos.where('inspectionId').equals(inspection.id).filter((p) => !p.uploaded).count();
    if (waiting > 0) throw new Error(`Waiting for ${waiting} photo(s) to upload`);

    const { syncState: _omit, ...payload } = inspection;
    void _omit;
    await adapter.pushInspection(payload);
    await db.transaction('rw', db.inspections, async () => {
      const current = await db.inspections.get(inspection.id);
      // Only mark synced if nobody edited it while the request was in flight
      if (current && current.version === inspection.version) {
        await db.inspections.update(inspection.id, { syncState: 'synced', syncedAt: now() });
      }
    });
  }

  async function runOnce(): Promise<{ pushed: number; failed: number }> {
    const result = { pushed: 0, failed: 0 };
    if (status.running || !isOnline()) return result;
    setStatus({ running: true, lastRunAt: now() });
    try {
      const due = await db.outbox.where('nextAttemptAt').belowOrEqual(now()).toArray();
      due.sort((a, b) => (a.kind === b.kind ? a.createdAt - b.createdAt : a.kind === 'photo' ? -1 : 1));

      for (const item of due) {
        if (!isOnline()) break;
        try {
          await process(item);
          await db.transaction('rw', db.outbox, async () => {
            const fresh = await db.outbox.get(item.id!);
            if (fresh && fresh.enqueuedAt === item.enqueuedAt) await db.outbox.delete(item.id!);
          });
          result.pushed++;
        } catch (err) {
          result.failed++;
          const message = err instanceof Error ? err.message : String(err);
          if (err instanceof ConflictError) {
            // Server already has a newer revision (e.g. edited by a supervisor). Surface it, don't loop.
            await db.outbox.delete(item.id!);
            await db.inspections.update(item.refId, { syncState: 'error' });
          } else {
            const attempts = item.attempts + 1;
            await db.outbox.update(item.id!, { attempts, nextAttemptAt: now() + backoffDelay(attempts), lastError: message });
            if (item.kind === 'inspection' && attempts >= 5) await db.inspections.update(item.refId, { syncState: 'error' });
          }
          setStatus({ lastError: message });
        }
      }
      if (result.failed === 0) setStatus({ lastError: undefined, lastSuccessAt: result.pushed ? now() : status.lastSuccessAt });
    } finally {
      setStatus({ running: false });
    }
    return result;
  }

  /** Retry everything immediately (user tapped "Sync now"). */
  async function syncNow() {
    await db.outbox.toCollection().modify({ nextAttemptAt: now() });
    return runOnce();
  }

  function start(subscribeNetwork: (cb: () => void) => () => void, intervalMs = 10_000) {
    const kick = () => void runOnce();
    const unsub = subscribeNetwork(kick);
    const timer = setInterval(kick, intervalMs);
    const onVisible = () => document.visibilityState === 'visible' && kick();
    document.addEventListener('visibilitychange', onVisible);
    kick();
    return () => {
      unsub();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }

  return {
    enqueue,
    runOnce,
    syncNow,
    start,
    getStatus: () => status,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

export type SyncEngine = ReturnType<typeof createSyncEngine>;
