import { useEffect, useRef, useState } from 'react';
import { Eraser, PenLine } from 'lucide-react';
import { useI18n } from '../lib/i18n';

interface Props {
  label: string;
  value?: string;
  onChange: (dataUrl: string | undefined) => void;
  disabled?: boolean;
}

/** Finger / stylus / mouse signature capture (Pointer Events), exported as a compact PNG. */
export function SignaturePad({ label, value, onChange, disabled }: Props) {
  const { t } = useI18n();
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const [editing, setEditing] = useState(!value);

  // Keep the canvas open while signing (several strokes); only reset when cleared.
  useEffect(() => {
    if (!value) setEditing(true);
  }, [value]);

  useEffect(() => {
    if (!editing) return;
    const c = canvas.current!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = c.clientWidth * dpr;
    c.height = c.clientHeight * dpr;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
    dirty.current = false;
  }, [editing]);

  const pos = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };

  function down(e: React.PointerEvent) {
    if (disabled) return;
    canvas.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = canvas.current!.getContext('2d')!;
    ctx.beginPath();
    ctx.moveTo(...pos(e));
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current) return;
    const ctx = canvas.current!.getContext('2d')!;
    ctx.lineTo(...pos(e));
    ctx.stroke();
    dirty.current = true;
  }
  function up() {
    if (!drawing.current) return;
    drawing.current = false;
    if (dirty.current) onChange(canvas.current!.toDataURL('image/png'));
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="label !mb-0">{label}</span>
        {!disabled && (value || editing) && (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs font-semibold text-ink-500 hover:text-crit"
            onClick={() => {
              onChange(undefined);
              setEditing(true);
            }}
          >
            <Eraser className="size-3.5" /> {t('clear')}
          </button>
        )}
      </div>
      {editing ? (
        <div className="relative">
          <canvas
            ref={canvas}
            className="h-32 w-full touch-none rounded-xl border-2 border-dashed border-ink-200 bg-white"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            aria-label={label}
          />
          <span className="pointer-events-none absolute bottom-2 left-3 flex items-center gap-1 text-xs text-ink-300">
            <PenLine className="size-3.5" /> {t('signHere')}
          </span>
        </div>
      ) : (
        <div className="grid h-32 place-items-center rounded-xl border border-ink-200 bg-white">
          <img src={value} alt={label} className="max-h-28" />
        </div>
      )}
    </div>
  );
}
