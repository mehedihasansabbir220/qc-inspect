import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { samplingPlan } from '../aql';
import { QcDatabase, uid, type Inspection } from '../db';
import { PermissionError, type RemoteInspection, type SyncAdapter } from './adapter';
import { createSyncEngine } from './engine';

function makeInspection(id: string): Inspection {
  return {
    id, createdAt: 0, updatedAt: 0, version: 1, status: 'completed', syncState: 'pending',
    factoryId: 'f1', poNumber: 'PO-1', style: 'S1', productCategory: 'Knit top', type: 'final',
    lotSize: 3000, level: 'II', aqlMajor: '2.5', aqlMinor: '4.0', plan: samplingPlan(3000),
    inspected: 125, defects: [], measurements: [], checklist: {}, comments: '', inspector: 'QA', verdict: 'pass',
  };
}

describe('sync engine', () => {
  let db: QcDatabase;
  let online: boolean;
  let adapter: SyncAdapter & { pushInspection: ReturnType<typeof vi.fn> };
  let clock: number;

  beforeEach(() => {
    db = new QcDatabase(`test-${uid()}`);
    online = true;
    clock = 1_000_000;
    adapter = {
      pushInspection: vi.fn(async (i) => ({ serverVersion: i.version })),
      pushPhoto: vi.fn(async () => ({ url: 'x' })),
    };
  });

  const engine = () => createSyncEngine({ db, adapter, isOnline: () => online, now: () => clock });

  it('does nothing while offline, then drains the queue when back online', async () => {
    const e = engine();
    await db.inspections.add(makeInspection('a'));
    await e.enqueue('inspection', 'a');
    online = false;
    expect(await e.runOnce()).toEqual({ pushed: 0, failed: 0 });
    expect(await db.outbox.count()).toBe(1);

    online = true;
    expect(await e.runOnce()).toEqual({ pushed: 1, failed: 0 });
    expect(await db.outbox.count()).toBe(0);
    expect((await db.inspections.get('a'))?.syncState).toBe('synced');
  });

  it('de-duplicates repeated enqueues of the same record', async () => {
    const e = engine();
    await db.inspections.add(makeInspection('a'));
    await e.enqueue('inspection', 'a');
    await e.enqueue('inspection', 'a');
    expect(await db.outbox.count()).toBe(1);
  });

  it('schedules a backoff retry on failure', async () => {
    const e = engine();
    adapter.pushInspection.mockRejectedValueOnce(new Error('timeout'));
    await db.inspections.add(makeInspection('a'));
    await e.enqueue('inspection', 'a');
    expect(await e.runOnce()).toEqual({ pushed: 0, failed: 1 });
    const item = (await db.outbox.toArray())[0];
    expect(item.attempts).toBe(1);
    expect(item.nextAttemptAt).toBeGreaterThan(clock);

    expect((await e.runOnce()).pushed).toBe(0); // not due yet
    clock += 60_000;
    expect((await e.runOnce()).pushed).toBe(1);
  });

  it('keeps an edit made while the upload was in flight', async () => {
    const e = engine();
    await db.inspections.add(makeInspection('a'));
    await e.enqueue('inspection', 'a');
    adapter.pushInspection.mockImplementationOnce(async (i) => {
      // inspector edits during upload
      clock += 1;
      await db.inspections.update('a', { version: 2, comments: 'late note' });
      await e.enqueue('inspection', 'a');
      return { serverVersion: i.version };
    });
    await e.runOnce();
    expect((await db.inspections.get('a'))?.syncState).not.toBe('synced');
    expect(await db.outbox.count()).toBe(1); // v2 still queued
    await e.runOnce();
    expect(adapter.pushInspection).toHaveBeenLastCalledWith(expect.objectContaining({ version: 2 }));
  });

  it('uploads photos before the inspection that references them', async () => {
    const e = engine();
    const order: string[] = [];
    adapter.pushPhoto = vi.fn(async () => (order.push('photo'), { url: 'x' }));
    adapter.pushInspection.mockImplementation(async (i) => (order.push('inspection'), { serverVersion: i.version }));
    await db.inspections.add(makeInspection('a'));
    await db.photos.add({ id: 'p1', inspectionId: 'a', blob: new Blob(['x']), width: 1, height: 1, originalBytes: 1, bytes: 1, createdAt: 0, uploaded: false });
    await e.enqueue('inspection', 'a');
    clock += 1;
    await e.enqueue('photo', 'p1');
    await e.runOnce();
    expect(order).toEqual(['photo', 'inspection']);
  });

  describe('pull (two-way sync & sharing)', () => {
    const remote = (id: string, version: number, extra: Partial<RemoteInspection> = {}): RemoteInspection => {
      const { syncState: _s, ...data } = makeInspection(id);
      void _s;
      return { id, version, data: { ...data, version, comments: `v${version}` }, isOwner: false, ownerEmail: 'owner@x.com', canDownload: false, canEdit: false, updatedAt: new Date(clock).toISOString(), ...extra };
    };

    it('brings in a report shared with me, with its permissions', async () => {
      adapter.pullInspections = vi.fn(async () => [remote('s1', 3, { canDownload: true })]);
      await engine().syncNow();
      const got = await db.inspections.get('s1');
      expect(got?.access).toEqual({ role: 'shared', ownerEmail: 'owner@x.com', canDownload: true, canEdit: false });
      expect(got?.syncState).toBe('synced');
    });

    it('takes a newer server version (edited by a colleague)', async () => {
      await db.inspections.add({ ...makeInspection('a'), syncState: 'synced', version: 2 });
      adapter.pullInspections = vi.fn(async () => [remote('a', 4, { isOwner: true })]);
      await engine().syncNow();
      expect((await db.inspections.get('a'))?.comments).toBe('v4');
    });

    it('never overwrites unsynced local edits', async () => {
      await db.inspections.add({ ...makeInspection('a'), syncState: 'local', version: 2, comments: 'mine' });
      adapter.pullInspections = vi.fn(async () => [remote('a', 9, { canEdit: true })]);
      await engine().syncNow();
      const got = await db.inspections.get('a');
      expect(got?.comments).toBe('mine');
      expect(got?.access?.canEdit).toBe(true); // permissions still refreshed
    });

    it('removes a shared report when access is revoked', async () => {
      adapter.pullInspections = vi.fn(async () => [remote('s1', 1)]);
      const e = engine();
      await e.syncNow();
      expect(await db.inspections.get('s1')).toBeDefined();
      adapter.pullInspections = vi.fn(async () => []);
      await e.syncNow();
      expect(await db.inspections.get('s1')).toBeUndefined();
    });

    it('downloads shared photos for offline viewing', async () => {
      const r = remote('s1', 1);
      r.data.defects = [{ id: 'd1', code: 'FAB-02', severity: 'major', qty: 1, photoIds: ['p9'], at: 0 }];
      adapter.pullInspections = vi.fn(async () => [r]);
      adapter.downloadFile = vi.fn(async () => new Blob(['jpg']));
      await engine().syncNow();
      expect(adapter.downloadFile).toHaveBeenCalledWith('s1/photos/p9.jpg');
      expect((await db.photos.get('p9'))?.uploaded).toBe(true);
    });
  });

  it('does not retry forever when edit permission was revoked', async () => {
    const e = engine();
    adapter.pushInspection.mockRejectedValueOnce(new PermissionError('no edit'));
    await db.inspections.add(makeInspection('a'));
    await e.enqueue('inspection', 'a');
    await e.runOnce();
    expect(await db.outbox.count()).toBe(0);
    expect((await db.inspections.get('a'))?.syncState).toBe('error');
  });

  it('never sends device-local fields to the server', async () => {
    const e = engine();
    await db.inspections.add({ ...makeInspection('a'), access: { role: 'owner', canDownload: true, canEdit: true } });
    await e.enqueue('inspection', 'a');
    await e.runOnce();
    const sent = adapter.pushInspection.mock.calls[0][0];
    expect(sent).not.toHaveProperty('access');
    expect(sent).not.toHaveProperty('syncState');
  });

  it('runs Google export jobs after files and the inspection record', async () => {
    const order: string[] = [];
    adapter.pushPhoto = vi.fn(async () => (order.push('photo'), { url: 'x' }));
    adapter.pushInspection.mockImplementation(async (i) => (order.push('inspection'), { serverVersion: i.version }));
    const e = createSyncEngine({ db, adapter, isOnline: () => online, now: () => clock, handlers: { export: async () => void order.push('export') } });
    await db.inspections.add(makeInspection('a'));
    await db.photos.add({ id: 'p1', inspectionId: 'a', blob: new Blob(['x']), width: 1, height: 1, originalBytes: 1, bytes: 1, createdAt: 0, uploaded: false });
    await e.enqueue('export', 'a');
    clock += 1;
    await e.enqueue('inspection', 'a');
    clock += 1;
    await e.enqueue('photo', 'p1');
    await e.runOnce();
    expect(order).toEqual(['photo', 'inspection', 'export']);
  });

  it('retries a failed Google export with backoff', async () => {
    const exportFn = vi.fn().mockRejectedValueOnce(new Error('Google 503')).mockResolvedValueOnce(undefined);
    const e = createSyncEngine({ db, adapter, isOnline: () => online, now: () => clock, handlers: { export: exportFn } });
    await e.enqueue('export', 'a');
    await e.runOnce();
    expect((await db.outbox.toArray())[0].lastError).toBe('Google 503');
    clock += 60_000;
    await e.runOnce();
    expect(await db.outbox.count()).toBe(0);
  });
});
