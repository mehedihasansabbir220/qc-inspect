import { supabase } from './supabase';

export interface ShareLink {
  id: string;
  token: string;
  inspectionId: string;
  canDownload: boolean;
  canEdit: boolean;
  revoked: boolean;
  createdAt: string;
  members: { email: string | null; joinedAt: string }[];
}

function client() {
  if (!supabase) throw new Error('Sharing needs the cloud backend (see README → Supabase setup).');
  return supabase;
}

export const shareUrl = (token: string) => `${location.origin}/s/${token}`;

/** Owner only — RLS returns nothing for anyone else. */
export async function listShares(inspectionId: string): Promise<ShareLink[]> {
  const { data, error } = await client()
    .from('shares')
    .select('id, token, inspection_id, can_download, can_edit, revoked, created_at, share_members(email, joined_at)')
    .eq('inspection_id', inspectionId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    token: r.token,
    inspectionId: r.inspection_id,
    canDownload: r.can_download,
    canEdit: r.can_edit,
    revoked: r.revoked,
    createdAt: r.created_at,
    members: (r.share_members ?? []).map((m: { email: string | null; joined_at: string }) => ({ email: m.email, joinedAt: m.joined_at })),
  }));
}

export async function createShare(inspectionId: string, perms: { canDownload: boolean; canEdit: boolean }): Promise<string> {
  const { data, error } = await client()
    .from('shares')
    .insert({ inspection_id: inspectionId, can_download: perms.canDownload, can_edit: perms.canEdit })
    .select('token')
    .single();
  if (error) throw error;
  return data.token as string;
}

export async function updateShare(id: string, patch: Partial<{ canDownload: boolean; canEdit: boolean; revoked: boolean }>) {
  const row: Record<string, boolean> = {};
  if (patch.canDownload !== undefined) row.can_download = patch.canDownload;
  if (patch.canEdit !== undefined) row.can_edit = patch.canEdit;
  if (patch.revoked !== undefined) row.revoked = patch.revoked;
  const { error } = await client().from('shares').update(row).eq('id', id);
  if (error) throw error;
}

/** Recipient opens a link: join the share. Returns the inspection id. */
export async function redeemShare(token: string): Promise<string> {
  const { data, error } = await client().rpc('redeem_share', { t: token });
  if (error) throw error;
  return data as string;
}
