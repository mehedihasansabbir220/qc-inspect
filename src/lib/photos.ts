import { db, uid, type Photo } from './db';

const MAX_EDGE = 1600;
const QUALITY = 0.72;

/**
 * Downscale + re-encode on the device before storing. A 4–6 MB phone photo becomes
 * ~200–400 KB: faster sync over weak factory 3G/4G and far less IndexedDB quota.
 */
export async function compressImage(file: Blob): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Encoding failed'))), 'image/jpeg', QUALITY),
  );
  // Never store something larger than the original
  return blob.size < file.size ? { blob, width, height } : { blob: file, width, height };
}

export async function savePhoto(inspectionId: string, file: File): Promise<Photo> {
  const { blob, width, height } = await compressImage(file);
  const photo: Photo = {
    id: uid(),
    inspectionId,
    blob,
    width,
    height,
    originalBytes: file.size,
    bytes: blob.size,
    createdAt: Date.now(),
    uploaded: false,
  };
  await db.photos.add(photo);
  return photo;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
