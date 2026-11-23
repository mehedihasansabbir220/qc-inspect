import { useSyncExternalStore } from 'react';
import { db } from '../db';
import { auth, cloudEnabled, supabase } from '../supabase';
import { createSyncEngine } from './engine';
import { mockServer } from './mockServer';
import { network } from './network';
import { createSupabaseAdapter } from './supabaseAdapter';

const adapter = supabase ? createSupabaseAdapter(supabase) : mockServer;

/** With a real backend we can only sync once signed in; offline work continues regardless. */
const canSync = () => network.isOnline() && (!cloudEnabled || auth.getSession() !== null);

export const syncEngine = createSyncEngine({ db, adapter, isOnline: canSync });

/**
 * Runs when a user signs in on this device.
 *  - Different user than last time → clear the previous user's local copy (it lives in the cloud),
 *    so their reports are never uploaded under the new account.
 *  - First sign-in for this user on this device → queue everything already on the device
 *    (inspections, photos, attachments) for upload, including work done before signing in.
 */
async function onSignedIn(userId: string) {
  const previous = (await db.settings.get('deviceUser'))?.value as string | undefined;
  if (previous && previous !== userId) {
    await db.transaction('rw', [db.inspections, db.photos, db.attachments, db.outbox, db.settings], async () => {
      await Promise.all([db.inspections.clear(), db.photos.clear(), db.attachments.clear(), db.outbox.clear()]);
      await db.settings.bulkDelete(['lastPullAt']);
    });
  }
  await db.settings.put({ key: 'deviceUser', value: userId });

  const flag = `cloudBackfill:${userId}`;
  if (await db.settings.get(flag)) return;
  const owned = await db.inspections.filter((i) => (i.access?.role ?? 'owner') === 'owner').toArray();
  for (const i of owned) {
    const photoIds = (await db.photos.where('inspectionId').equals(i.id).primaryKeys()) as string[];
    const attIds = (await db.attachments.where('inspectionId').equals(i.id).primaryKeys()) as string[];
    await db.photos.where('inspectionId').equals(i.id).modify({ uploaded: false });
    await db.attachments.where('inspectionId').equals(i.id).modify({ uploaded: false });
    for (const id of photoIds) await syncEngine.enqueue('photo', id);
    for (const id of attIds) await syncEngine.enqueue('attachment', id);
    if (i.status === 'completed') {
      await db.inspections.update(i.id, { syncState: 'pending', access: { role: 'owner', canDownload: true, canEdit: true } });
      await syncEngine.enqueue('inspection', i.id);
    }
  }
  await db.settings.put({ key: flag, value: Date.now() });
}

let lastUser: string | undefined;
auth.subscribe(() => {
  const user = auth.getSession()?.user.id;
  if (user && user !== lastUser) {
    lastUser = user;
    void onSignedIn(user).then(() => syncEngine.syncNow());
  } else {
    lastUser = user;
    // Token refresh etc. — just make sure queued work goes out.
    void syncEngine.syncNow();
  }
});

export function useSyncStatus() {
  return useSyncExternalStore(syncEngine.subscribe, syncEngine.getStatus);
}

export function useNetwork() {
  const online = useSyncExternalStore(network.subscribe, network.isOnline);
  const mode = useSyncExternalStore(network.subscribe, network.getMode);
  return { online, mode };
}

export { network };
