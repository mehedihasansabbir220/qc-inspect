import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Spinner } from './ui';

/** Two-tap delete: first tap arms it for 4 s, second tap deletes. No browser pop-up needed. */
export function DeleteButton({ label, onDelete }: { label: string; onDelete: () => Promise<void> }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      className={`btn w-full transition ${armed ? 'bg-crit text-white' : 'bg-white text-crit ring-1 ring-red-200 hover:bg-red-50'}`}
      disabled={busy}
      onClick={async () => {
        if (!armed) return setArmed(true);
        setBusy(true);
        await onDelete();
      }}
    >
      {busy ? <Spinner /> : <Trash2 className="size-4" />} {armed ? 'Tap again to delete permanently' : label}
    </button>
  );
}
