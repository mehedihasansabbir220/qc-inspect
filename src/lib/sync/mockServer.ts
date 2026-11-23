import Dexie, { type EntityTable } from 'dexie';
import type { Inspection } from '../db';
import { ConflictError, NetworkError, type SyncAdapter } from './adapter';
import { network } from './network';

interface ServerInspection {
  id: string;
  version: number;
  receivedAt: number;
  data: Omit<Inspection, 'syncState'>;
}
interface ServerPhoto {
  id: string;
  inspectionId: string;
  bytes: number;
  receivedAt: number;
}

/** A stand-in "cloud" living in a separate IndexedDB so the demo works anywhere, with no keys. */
class MockServerDb extends Dexie {
  inspections!: EntityTable<ServerInspection, 'id'>;
  photos!: EntityTable<ServerPhoto, 'id'>;
  constructor() {
    super('qc-mock-server');
    this.version(1).stores({ inspections: 'id', photos: 'id, inspectionId' });
  }
}

export const serverDb = new MockServerDb();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function simulateTransport(bytes = 2_000) {
  // ~1 Mbps effective uplink + latency — roughly a congested factory 4G connection
  await sleep(250 + Math.random() * 400 + bytes / 125);
  if (!network.isOnline()) throw new NetworkError('Connection lost');
  if (network.getMode() === 'flaky' && Math.random() < 0.4) throw new NetworkError('Request timed out');
}

export const mockServer: SyncAdapter = {
  async pushInspection(inspection) {
    await simulateTransport(JSON.stringify(inspection).length);
    const existing = await serverDb.inspections.get(inspection.id);
    if (existing && existing.version > inspection.version) throw new ConflictError(existing.version);
    await serverDb.inspections.put({ id: inspection.id, version: inspection.version, receivedAt: Date.now(), data: inspection });
    return { serverVersion: inspection.version };
  },
  async pushPhoto(photo) {
    await simulateTransport(photo.bytes);
    await serverDb.photos.put({ id: photo.id, inspectionId: photo.inspectionId, bytes: photo.bytes, receivedAt: Date.now() });
    return { url: `https://storage.example.com/qc/${photo.inspectionId}/${photo.id}.jpg` };
  },
  async deleteInspection(id) {
    await simulateTransport();
    await serverDb.inspections.delete(id);
    await serverDb.photos.where('inspectionId').equals(id).delete();
  },
  async pushAttachment(a) {
    await simulateTransport(a.bytes);
    await serverDb.photos.put({ id: a.id, inspectionId: a.inspectionId, bytes: a.bytes, receivedAt: Date.now() });
  },
};
