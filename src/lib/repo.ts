import { samplingPlan, type AqlValue, type InspectionLevel } from './aql';
import { CHECKLIST, DEFAULT_POMS } from './defects';
import { OWNER_ACCESS, db, uid, type Access, type DefectEntry, type Inspection, type InspectionType } from './db';
import { savePhoto } from './photos';
import { syncEngine } from './sync';
import { computeVerdict, tally } from './verdict';

export interface NewInspectionInput {
  buyer?: string;
  factoryId: string;
  poNumber: string;
  style: string;
  productCategory: string;
  type: InspectionType;
  lotSize: number;
  level: InspectionLevel;
  aqlMajor: AqlValue;
  aqlMinor: AqlValue;
  inspector: string;
}

export async function createInspection(input: NewInspectionInput): Promise<string> {
  const now = Date.now();
  const id = uid();
  const factory = await db.factories.get(input.factoryId);
  await db.inspections.add({
    factoryName: factory?.name,
    factoryLocation: factory?.location,
    attachments: [],
    access: OWNER_ACCESS,
    id,
    createdAt: now,
    updatedAt: now,
    version: 1,
    status: 'draft',
    syncState: 'local',
    ...input,
    plan: samplingPlan(input.lotSize, input.level, input.aqlMajor, input.aqlMinor),
    inspected: 0,
    defects: [],
    measurements: DEFAULT_POMS.map((p) => ({ ...p, values: [null, null, null, null, null] })),
    checklist: Object.fromEntries(CHECKLIST.map((c) => [c.id, undefined])),
    comments: '',
    verdict: 'in-progress',
  });
  return id;
}

/**
 * Every edit is written straight to IndexedDB (autosave) — if the phone dies or the
 * app is killed mid-inspection, nothing is lost. Verdict is always recomputed from data.
 */
export async function updateInspection(id: string, patch: Partial<Inspection> | ((i: Inspection) => Partial<Inspection>)) {
  let completed = false;
  await db.transaction('rw', db.inspections, async () => {
    const current = await db.inspections.get(id);
    if (!current) throw new Error('Inspection not found');
    const changes = typeof patch === 'function' ? patch(current) : patch;
    const next = { ...current, ...changes };
    next.verdict = computeVerdict(next.plan, tally(next.defects), next.inspected).verdict;
    next.updatedAt = Date.now();
    next.version = current.version + 1;
    completed = next.status === 'completed';
    if (completed) next.syncState = 'pending';
    await db.inspections.put(next);
  });
  // Completed inspections re-sync on every edit; drafts stay on-device until completed.
  if (completed) await syncEngine.enqueue('inspection', id);
}

export async function addDefect(id: string, entry: Omit<DefectEntry, 'id' | 'at' | 'photoIds'>, files: File[]) {
  const photos = [];
  for (const f of files) photos.push(await savePhoto(id, f));
  const defect: DefectEntry = { ...entry, id: uid(), at: Date.now(), photoIds: photos.map((p) => p.id) };
  await updateInspection(id, (i) => ({ defects: [defect, ...i.defects] }));
  // Photos start uploading in the background immediately, spreading load over the inspection.
  for (const p of photos) await syncEngine.enqueue('photo', p.id);
}

export async function removeDefect(id: string, defectId: string) {
  const insp = await db.inspections.get(id);
  const d = insp?.defects.find((x) => x.id === defectId);
  if (d?.photoIds.length) await db.photos.bulkDelete(d.photoIds);
  await updateInspection(id, (i) => ({ defects: i.defects.filter((x) => x.id !== defectId) }));
}

export async function completeInspection(id: string) {
  await updateInspection(id, { status: 'completed', completedAt: Date.now() });
  void syncEngine.runOnce();
}

export async function deleteInspection(id: string) {
  await db.transaction('rw', [db.inspections, db.photos, db.outbox, db.attachments], async () => {
    const photoIds = await db.photos.where('inspectionId').equals(id).primaryKeys();
    await db.photos.bulkDelete(photoIds);
    const refs = new Set<string>([id, ...photoIds]);
    await db.outbox.filter((o) => refs.has(o.refId)).delete();
    await db.attachments.where('inspectionId').equals(id).delete();
    await db.inspections.delete(id);
  });
}

export const accessOf = (i: Pick<Inspection, 'access'>): Access => i.access ?? OWNER_ACCESS;

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

/** Attach an existing report (PDF). Stored on-device first, uploaded via the outbox. */
export async function addAttachment(inspectionId: string, file: File) {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) throw new Error('Only PDF files are supported');
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error('PDF is larger than 20 MB');
  const id = uid();
  const now = Date.now();
  await db.attachments.add({ id, inspectionId, name: file.name, blob: file, bytes: file.size, createdAt: now, uploaded: false });
  await updateInspection(inspectionId, (i) => ({ attachments: [...(i.attachments ?? []), { id, name: file.name, bytes: file.size, addedAt: now }] }));
  await syncEngine.enqueue('attachment', id);
  // Drafts don't sync on edit; make sure the record carrying the attachment list is queued too.
  const insp = await db.inspections.get(inspectionId);
  if (insp?.status === 'draft') await syncEngine.enqueue('inspection', inspectionId);
  void syncEngine.runOnce();
}

export async function removeAttachment(inspectionId: string, attachmentId: string) {
  await db.attachments.delete(attachmentId);
  await updateInspection(inspectionId, (i) => ({ attachments: (i.attachments ?? []).filter((a) => a.id !== attachmentId) }));
}
