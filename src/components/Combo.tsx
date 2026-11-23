import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Plus, X } from 'lucide-react';

interface Props {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  hint?: ReactNode;
}

/**
 * Pick-or-type field: a real dropdown with ALL default options (tap the field or the arrow),
 * filtered as you type, plus "Use '…'" to keep your own value. ✕ clears the field.
 */
export function Combo({ id, label, value, onChange, options, placeholder, hint }: Props) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(false); // filter only after the user starts typing
  const [active, setActive] = useState(-1);
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  const q = value.trim().toLowerCase();
  const shown = typed && q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
  const exact = options.some((o) => o.toLowerCase() === q);
  const items = [...shown, ...(typed && q && !exact ? [`__new__${value.trim()}`] : [])];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('pointerdown', onDoc);
    return () => document.removeEventListener('pointerdown', onDoc);
  }, [open]);

  function choose(v: string) {
    onChange(v.startsWith('__new__') ? v.slice(7) : v);
    setOpen(false);
    setTyped(false);
    setActive(-1);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter' && open && active >= 0) {
      e.preventDefault();
      choose(items[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={wrap} className="relative">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <input
          ref={input}
          id={id}
          className="field !pr-20"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder={placeholder}
          value={value}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(e) => {
            onChange(e.target.value);
            setTyped(true);
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={onKey}
        />
        <div className="absolute inset-y-0 right-1.5 flex items-center gap-0.5">
          {value && (
            <button
              type="button"
              className="grid size-8 place-items-center rounded-full text-ink-400 hover:bg-ink-100 hover:text-ink-700"
              onClick={() => {
                onChange('');
                setTyped(true);
                setOpen(true);
                input.current?.focus();
              }}
              aria-label={`Clear ${label}`}
            >
              <X className="size-4" />
            </button>
          )}
          <button
            type="button"
            tabIndex={-1}
            className="grid size-8 place-items-center rounded-full text-ink-500 hover:bg-ink-100"
            onClick={() => {
              setTyped(false); // arrow always shows the full list
              setOpen((o) => !o);
              input.current?.focus();
            }}
            aria-label={`Show all ${label} options`}
          >
            <ChevronDown className={`size-5 transition ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {open && items.length > 0 && (
        <ul id={listId} role="listbox" className="animate-fade absolute inset-x-0 z-40 mt-1 max-h-64 overflow-y-auto rounded-xl bg-white py-1 shadow-xl ring-1 ring-ink-200">
          {items.map((o, i) => {
            const isNew = o.startsWith('__new__');
            const text = isNew ? o.slice(7) : o;
            const selected = !isNew && o.toLowerCase() === q;
            return (
              <li
                key={o}
                role="option"
                aria-selected={selected}
                onPointerDown={(e) => e.preventDefault()} // keep focus in the input
                onClick={() => choose(o)}
                onPointerEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center gap-2 px-3.5 py-2.5 text-sm ${i === active ? 'bg-ink-100' : ''} ${isNew ? 'border-t border-ink-100 font-semibold text-brand-600' : ''}`}
              >
                {isNew ? <Plus className="size-4 shrink-0" /> : <Check className={`size-4 shrink-0 ${selected ? 'text-brand-600' : 'invisible'}`} />}
                <span className="truncate">{isNew ? `Use “${text}”` : text}</span>
              </li>
            );
          })}
        </ul>
      )}
      {hint}
    </div>
  );
}
