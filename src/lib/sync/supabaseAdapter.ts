import type { SupabaseClient } from '@supabase/supabase-js';
import { filePath } from '../db';
import { ConflictError, NetworkError, PermissionError, type RemoteInspection, type SyncAdapter } from './adapter';

const BUCKET = 'qc-files';

function mapError(error: { code?: string; message: string; details?: string }): Error {
  if (error.code === '40001') return new ConflictError(Number(error.details) || 0);
  if (error.code === '42501' || error.code === '28000') return new PermissionError(error.message);
  if (/fetch|network|timeout/i.test(error.message)) return new NetworkError(error.message);
  return new Error(error.message);
}

export function createSupabaseAdapter(sb: SupabaseClient): SyncAdapter {
  async function upload(path: string, blob: Blob, contentType: string) {
    const { error } = await sb.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType });
    if (error) throw mapError(error);
  }

  return {
    async pushInspection(inspection) {
      const { data, error } = await sb.rpc('upsert_inspection', { p: inspection });
      if (error) throw mapError(error);
      return { serverVersion: data as number };
    },

    async pushPhoto(photo) {
      const path = filePath.photo(photo.inspectionId, photo.id);
      await upload(path, photo.blob, 'image/jpeg');
      return { url: path };
    },

    async pushAttachment(a) {
      await upload(filePath.attachment(a.inspectionId, a.id), a.blob, 'application/pdf');
    },

    async pullInspections(since) {
      const { data, error } = await sb.rpc('pull_inspections', { since });
      if (error) throw mapError(error);
      return (data as Record<string, unknown>[]).map(
        (r): RemoteInspection => ({
          id: r.id as string,
          version: r.version as number,
          data: r.data as RemoteInspection['data'],
          ownerEmail: (r.owner_email as string) ?? undefined,
          isOwner: r.is_owner as boolean,
          canDownload: r.can_download as boolean,
          canEdit: r.can_edit as boolean,
          updatedAt: r.updated_at as string,
        }),
      );
    },

    async downloadFile(path) {
      const { data, error } = await sb.storage.from(BUCKET).download(path);
      if (error) throw mapError(error);
      return data;
    },
  };
}
