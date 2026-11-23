import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { samplingPlan } from '../aql';
import { QcDatabase, uid, type Inspection } from '../db';
import type { SyncAdapter } from './adapter';
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
});
