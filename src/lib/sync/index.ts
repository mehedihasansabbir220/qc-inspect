import { useSyncExternalStore } from 'react';
import { db } from '../db';
import { createSyncEngine } from './engine';
import { mockServer } from './mockServer';
import { network } from './network';

export const syncEngine = createSyncEngine({ db, adapter: mockServer, isOnline: network.isOnline });

export function useSyncStatus() {
  return useSyncExternalStore(syncEngine.subscribe, syncEngine.getStatus);
}

export function useNetwork() {
  const online = useSyncExternalStore(network.subscribe, network.isOnline);
  const mode = useSyncExternalStore(network.subscribe, network.getMode);
  return { online, mode };
}

export { network };
