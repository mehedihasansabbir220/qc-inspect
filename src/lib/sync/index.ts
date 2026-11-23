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

// Signing in should immediately push queued work and pull shared reports.
auth.subscribe(() => void syncEngine.syncNow());

export function useSyncStatus() {
  return useSyncExternalStore(syncEngine.subscribe, syncEngine.getStatus);
}

export function useNetwork() {
  const online = useSyncExternalStore(network.subscribe, network.isOnline);
  const mode = useSyncExternalStore(network.subscribe, network.getMode);
  return { online, mode };
}

export { network };
