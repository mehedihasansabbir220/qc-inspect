import { useEffect, useRef, useState } from 'react';
import { Download, Lock, X } from 'lucide-react';
import { downloadBlob } from '../lib/files';
import { formatBytes } from '../lib/photos';
import { Spinner } from './ui';

interface Props {
  blob: Blob;
  name: string;
  canDownload: boolean;
  onClose: () => void;
}

/**
 * In-app PDF preview rendered to <canvas> with pdf.js — works identically on Android, iOS and
 * desktop (mobile browsers can't display PDFs inline), and lets us hide the download path for
 * view-only recipients. pdf.js is lazy-loaded so it never weighs on app start-up.
 */
export function PdfViewer({ blob, name, canDownload, onClose }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState(0);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        const pdf = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
        if (cancelled) return;
        setPages(pdf.numPages);
        const el = host.current!;
        el.innerHTML = '';
        const width = Math.min(el.clientWidth, 900);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        for (let n = 1; n <= pdf.numPages; n++) {
          const page = await pdf.getPage(n);
          if (cancelled) return;
          const vp = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (width / vp.width) * dpr });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = `${width}px`;
          canvas.className = 'mx-auto mb-3 rounded-md bg-white shadow-lg';
          canvas.oncontextmenu = (e) => !canDownload && e.preventDefault();
          el.appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not open PDF');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blob, canDownload]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="animate-fade fixed inset-0 z-50 flex flex-col bg-ink-950/95" role="dialog" aria-modal="true" aria-label={name}>
      <div className="flex items-center gap-3 px-4 py-3 text-white" style={{ paddingTop: 'max(env(safe-area-inset-top), 0.75rem)' }}>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{name}</div>
          <div className="text-xs text-ink-400">
            {pages ? `${pages} page${pages > 1 ? 's' : ''} · ` : ''}
            {formatBytes(blob.size)}
          </div>
        </div>
        {canDownload ? (
          <button className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20" onClick={() => downloadBlob(blob, name)}>
            <Download className="size-4" /> Download
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-2 text-xs text-ink-400">
            <Lock className="size-3.5" /> View only
          </span>
        )}
        <button className="grid size-9 place-items-center rounded-full bg-white/10 hover:bg-white/20" onClick={onClose} aria-label="Close preview">
          <X className="size-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-6">
        {error ? (
          <p className="mt-10 text-center text-sm text-red-300">{error}</p>
        ) : (
          <>
            {!pages && (
              <div className="mt-16 flex justify-center text-ink-400">
                <Spinner className="size-6" />
              </div>
            )}
            <div ref={host} className="mx-auto max-w-[900px]" />
          </>
        )}
      </div>
    </div>
  );
}
