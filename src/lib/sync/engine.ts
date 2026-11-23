import { OWNER_ACCESS, filePath, type Access, type Inspection, type OutboxItem, type QcDatabase } from '../db';
import { ConflictError, PermissionError, type InspectionPayload, type RemoteInspection, type SyncAdapter } from './adapter';
import { backoffDelay } from './backoff';

export interface SyncStatus {
  running: boolean;
  lastRunAt?: number;
  lastSuccessAt?: number;
  lastPullAt?: number;
  lastError?: string;
}

export interface SyncDeps {
  db: QcDatabase;
  adapter: SyncAdapter;
  isOnline: () => boolean;
  now?: () => number;
  /** Minimum gap between automatic pulls. */
  pullIntervalMs?: number;
  /** Extra outbox jobs, e.g. 'export' → send the report to Google Workspace. */
  handlers?: Partial<Record<'export', (refId: string) => Promise<void>>>;
}

const EPOCH = '1970-01-01T00:00:00.000Z';

export function toPayload(i: Inspection): InspectionPayload {
  const { syncState: _s, access: _a, syncedAt: _t, ...payload } = i;
  void _s, void _a, void _t;
  return payload;
}

function sameAccess(a?: Access, b?: Access) {
  return a?.role === b?.role && a?.canDownload === b?.canDownload && a?.canEdit === b?.canEdit && a?.ownerEmail === b?.ownerEmail;
}

/**
 * Outbox-pattern sync engine with two-way merge.
 *
 * PUSH
 *  1. Every write lands in IndexedDB first (the device is the source of truth while offline).
 *  2. A durable outbox row records "this entity needs pushing" — it survives app kills & reboots.
 *  3. The engine drains the outbox when connectivity returns: files (photos, attachments) before
 *     the inspection that references them, with exponential backoff + jitter on failure.
 *  4. Uploads are idempotent (keyed by client-generated UUID), so a retry after a timeout
 *     that actually succeeded server-side never creates duplicates.
 *
 * PULL
 *  5. Fetches records changed on the server (e.g. edited by a colleague with edit permission)
 *     and everything shared with this user, plus their files for offline viewing.
 *  6. Local unsynced edits are never overwritten by a pull; revoked shares are removed.
 */
export function createSyncEngine({ db, adapter, isOnline, now = Date.now, pullIntervalMs = 15_000, handlers = {} }: SyncDeps) {
  let status: SyncStatus = { running: false };
  let lastPullRun = 0;
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
    if (item.kind === 'export') {
      await handlers.export?.(item.refId);
      return;
    }
    if (item.kind === 'photo') {
      const photo = await db.photos.get(item.refId);
      if (!photo) return; // deleted locally — nothing to do
      await adapter.pushPhoto(photo);
      await db.photos.update(photo.id, { uploaded: true });
      return;
    }
    if (item.kind === 'attachment') {
      const att = await db.attachments.get(item.refId);
      if (!att) return;
      if (!adapter.pushAttachment) throw new PermissionError('This backend does not support attachments');
      await adapter.pushAttachment(att);
      await db.attachments.update(att.id, { uploaded: true });
      return;
    }

    const inspection = await db.inspections.get(item.refId);
    if (!inspection) return;
    const waiting =
      (await db.photos.where('inspectionId').equals(inspection.id).filter((p) => !p.uploaded).count()) +
      (await db.attachments.where('inspectionId').equals(inspection.id).filter((a) => !a.uploaded).count());
    if (waiting > 0) throw new Error(`Waiting for ${waiting} file(s) to upload`);

    const payload = toPayload(inspection);
    // Older records predate the factoryName snapshot — fill it so recipients see a name, not an id.
    if (!payload.factoryName) payload.factoryName = (await db.factories.get(payload.factoryId))?.name;
    await adapter.pushInspection(payload);
    await db.transaction('rw', db.inspections, async () => {
      const current = await db.inspections.get(inspection.id);
      // Only mark synced if nobody edited it while the request was in flight
      if (current && current.version === inspection.version) {
        await db.inspections.update(inspection.id, { syncState: 'synced', syncedAt: now() });
      }
    });
  }

  // files → inspection record → exports (which need the finished record)
  const order = (k: OutboxItem['kind']) => (k === 'inspection' ? 1 : k === 'export' ? 2 : 0);

  async function push(result: { pushed: number; failed: number }) {
    const due = await db.outbox.where('nextAttemptAt').belowOrEqual(now()).toArray();
    due.sort((a, b) => order(a.kind) - order(b.kind) || a.createdAt - b.createdAt);

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
        if (err instanceof ConflictError || err instanceof PermissionError) {
          // Not retryable: a newer server revision exists, or edit access was revoked. Surface it.
          await db.outbox.delete(item.id!);
          if (item.kind === 'inspection') await db.inspections.update(item.refId, { syncState: 'error' });
        } else {
          const attempts = item.attempts + 1;
          await db.outbox.update(item.id!, { attempts, nextAttemptAt: now() + backoffDelay(attempts), lastError: message });
          if (item.kind === 'inspection' && attempts >= 5) await db.inspections.update(item.refId, { syncState: 'error' });
        }
        setStatus({ lastError: message });
      }
    }
  }

  async function fetchMissingFiles(data: InspectionPayload) {
    if (!adapter.downloadFile) return;
    const photoIds = data.defects.flatMap((d) => d.photoIds);
    for (const id of photoIds) {
      if (await db.photos.get(id)) continue;
      try {
        const blob = await adapter.downloadFile(filePath.photo(data.id, id));
        await db.photos.put({ id, inspectionId: data.id, blob, width: 0, height: 0, bytes: blob.size, originalBytes: blob.size, createdAt: now(), uploaded: true });
      } catch {
        /* retried on next pull */
      }
    }
    for (const a of data.attachments ?? []) {
      if (await db.attachments.get(a.id)) continue;
      try {
        const blob = await adapter.downloadFile(filePath.attachment(data.id, a.id));
        await db.attachments.put({ id: a.id, inspectionId: data.id, name: a.name, blob, bytes: blob.size, createdAt: a.addedAt, uploaded: true });
      } catch {
        /* retried on next pull */
      }
    }
  }

  async function removeLocal(id: string) {
    await db.transaction('rw', [db.inspections, db.photos, db.attachments], async () => {
      await db.photos.where('inspectionId').equals(id).delete();
      await db.attachments.where('inspectionId').equals(id).delete();
      await db.inspections.delete(id);
    });
  }

  async function mergeRemote(r: RemoteInspection) {
    const access: Access = r.isOwner ? OWNER_ACCESS : { role: r.via === 'team' ? 'team' : 'shared', ownerEmail: r.ownerEmail, canDownload: r.canDownload, canEdit: r.canEdit };
    const local = await db.inspections.get(r.id);
    if (local && (local.syncState === 'pending' || local.syncState === 'local')) {
      // Never clobber unsynced local work; just keep permissions fresh.
      if (!sameAccess(local.access, access)) await db.inspections.update(r.id, { access });
      return;
    }
    if (!local || local.version < r.version || local.syncState === 'error') {
      await db.inspections.put({ ...r.data, access, syncState: 'synced', syncedAt: now() });
    } else if (!sameAccess(local.access ?? OWNER_ACCESS, access)) {
      await db.inspections.update(r.id, { access });
    }
    if (r.data.factoryId && !(await db.factories.get(r.data.factoryId))) {
      await db.factories.put({ id: r.data.factoryId, name: r.data.factoryName ?? r.data.factoryId, location: '' });
    }
    await fetchMissingFiles(r.data);
  }

  async function pull(force = false) {
    if (!adapter.pullInspections || !isOnline()) return;
    if (!force && now() - lastPullRun < pullIntervalMs) return;
    lastPullRun = now();
    const since = ((await db.settings.get('lastPullAt'))?.value as string | undefined) ?? EPOCH;
    const rows = await adapter.pullInspections(since);
    let maxTs = since;
    const sharedIds = new Set<string>();
    for (const r of rows) {
      if (Date.parse(r.updatedAt) > Date.parse(maxTs)) maxTs = r.updatedAt;
      if (!r.isOwner) sharedIds.add(r.id);
      await mergeRemote(r);
    }
    // Shares / team access that disappeared from the server were revoked — remove local copies.
    const localShared = await db.inspections.filter((i) => i.access?.role === 'shared' || i.access?.role === 'team').toArray();
    for (const i of localShared) if (!sharedIds.has(i.id)) await removeLocal(i.id);
    await db.settings.put({ key: 'lastPullAt', value: maxTs });
    setStatus({ lastPullAt: now() });
  }

  async function runOnce(opts: { forcePull?: boolean } = {}): Promise<{ pushed: number; failed: number }> {
    const result = { pushed: 0, failed: 0 };
    if (status.running || !isOnline()) return result;
    setStatus({ running: true, lastRunAt: now() });
    try {
      await push(result);
      try {
        await pull(opts.forcePull);
      } catch (err) {
        result.failed++;
        setStatus({ lastError: err instanceof Error ? err.message : String(err) });
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
    return runOnce({ forcePull: true });
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
