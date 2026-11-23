import { createClient, type Session } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Null when no backend is configured — the app then runs against the on-device mock server. */
export const supabase = url && anonKey ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } }) : null;
export const cloudEnabled = supabase !== null;

// Session store. The session is persisted in localStorage by supabase-js, so a signed-in
// inspector stays signed in while offline; tokens refresh automatically once back online.
let session: Session | null = null;
const listeners = new Set<() => void>();

if (supabase) {
  void supabase.auth.getSession().then(({ data }) => {
    session = data.session;
    listeners.forEach((l) => l());
  });
  supabase.auth.onAuthStateChange((_event, s) => {
    session = s;
    listeners.forEach((l) => l());
  });
}

export const auth = {
  getSession: () => session,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useSession() {
  return useSyncExternalStore(auth.subscribe, auth.getSession);
}

export async function signIn(email: string, password: string) {
  if (!supabase) throw new Error('Cloud not configured');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUp(email: string, password: string) {
  if (!supabase) throw new Error('Cloud not configured');
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  if (!data.session) return 'confirm-email' as const;
  return 'ok' as const;
}

export async function signOut() {
  await supabase?.auth.signOut();
}
