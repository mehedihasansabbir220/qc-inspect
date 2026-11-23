import { useEffect, useRef, useState } from 'react';
import { Camera, Minus, Plus, X } from 'lucide-react';
import type { DefectType, Severity } from '../lib/defects';
import { useI18n } from '../lib/i18n';
import { formatBytes } from '../lib/photos';
import { SEVERITY_STYLE, Spinner, useObjectUrl } from './ui';

interface Props {
  defect: DefectType;
  onClose: () => void;
  onSave: (v: { severity: Severity; qty: number; note: string; files: File[] }) => Promise<void>;
}

function Preview({ file, onRemove }: { file: File; onRemove: () => void }) {
  const url = useObjectUrl(file);
  return (
    <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-ink-100 ring-1 ring-ink-200">
      {url && <img src={url} alt="" className="size-full object-cover" />}
      <button type="button" onClick={onRemove} className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-ink-900/70 text-white" aria-label="Remove photo">
        <X className="size-3.5" />
      </button>
      <span className="absolute inset-x-0 bottom-0 bg-ink-900/60 py-0.5 text-center text-[10px] text-white">{formatBytes(file.size)}</span>
    </div>
  );
}

export function DefectSheet({ defect, onClose, onSave }: Props) {
  const { t, pick, lang } = useI18n();
  const [severity, setSeverity] = useState<Severity>(defect.severity);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function save() {
    setSaving(true);
    try {
      await onSave({ severity, qty, note: note.trim(), files });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={defect.en}>
      <div className="animate-fade absolute inset-0 bg-ink-950/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="animate-sheet pb-safe relative w-full max-w-2xl rounded-t-3xl bg-white px-5 pt-3 shadow-2xl">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-ink-200" />
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-ink-400">{defect.code}</div>
            <h2 className="text-xl font-bold">{pick(defect)}</h2>
            <div className="text-sm text-ink-500">{lang === 'bn' ? defect.en : defect.bn}</div>
          </div>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-full bg-ink-100" aria-label={t('cancel')}>
            <X className="size-5" />
          </button>
        </div>

        <div className="mt-5">
          <span className="label">{t('severity')}</span>
          <div className="grid grid-cols-3 gap-2">
            {(['critical', 'major', 'minor'] as const).map((s) => {
              const st = SEVERITY_STYLE[s];
              const on = severity === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSeverity(s)}
                  aria-pressed={on}
                  className={`rounded-xl py-3 text-sm font-bold ring-2 transition ${on ? `${st.bg} ${st.text} ring-current` : 'bg-ink-50 text-ink-500 ring-transparent'}`}
                >
                  {t(s)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <span className="label !mb-0">{t('quantity')}</span>
          <div className="flex items-center gap-1 rounded-xl bg-ink-100 p-1">
            <button type="button" className="grid size-10 place-items-center rounded-lg bg-white shadow-sm" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease">
              <Minus className="size-4" />
            </button>
            <span className="w-10 text-center text-lg font-bold tabular-nums">{qty}</span>
            <button type="button" className="grid size-10 place-items-center rounded-lg bg-white shadow-sm" onClick={() => setQty((q) => q + 1)} aria-label="Increase">
              <Plus className="size-4" />
            </button>
          </div>
        </div>

        <div className="mt-5">
          <span className="label">Photos</span>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {files.map((f, i) => (
              <Preview key={i} file={f} onRemove={() => setFiles((fs) => fs.filter((_, j) => j !== i))} />
            ))}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="grid size-20 shrink-0 place-items-center rounded-xl border-2 border-dashed border-ink-200 text-ink-500 transition hover:border-brand-500 hover:text-brand-600"
            >
              <span className="flex flex-col items-center gap-1 text-[11px] font-semibold">
                <Camera className="size-6" />
                {t('addPhoto')}
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              hidden
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []);
                setFiles((fs) => [...fs, ...picked]);
                e.target.value = '';
              }}
            />
          </div>
        </div>

        <div className="mt-4">
          <textarea className="field min-h-20 resize-none" placeholder={t('note')} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        <button type="button" onClick={save} disabled={saving} className="btn-primary mt-4 mb-3 w-full text-base">
          {saving ? <Spinner /> : <Plus className="size-5" />} {t('logDefect')}
          {qty > 1 && ` ×${qty}`}
        </button>
      </div>
    </div>
  );
}
