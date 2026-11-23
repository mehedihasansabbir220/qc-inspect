/**
 * Network state with a demo simulator. In "offline" mode the app behaves exactly as if
 * the device had no signal; in "flaky" mode a share of requests fail mid-flight —
 * which is what a factory floor actually looks like.
 */
export type NetworkMode = 'auto' | 'offline' | 'flaky';

type Listener = () => void;
const listeners = new Set<Listener>();

let mode: NetworkMode = (localStorageGet('qc.networkMode') as NetworkMode) || 'auto';

function localStorageGet(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function emit() {
  listeners.forEach((l) => l());
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', emit);
  window.addEventListener('offline', emit);
}

export const network = {
  getMode: () => mode,
  setMode(next: NetworkMode) {
    mode = next;
    try {
      localStorage.setItem('qc.networkMode', next);
    } catch {
      /* private mode — non-critical */
    }
    emit();
  },
  isOnline(): boolean {
    if (mode === 'offline') return false;
    return typeof navigator === 'undefined' ? true : navigator.onLine;
  },
  subscribe(l: Listener) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};
