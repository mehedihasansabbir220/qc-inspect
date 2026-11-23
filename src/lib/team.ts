import { supabase } from './supabase';

export type Role = 'inspector' | 'manager';

export interface TeamMember {
  id: string;
  email: string;
  role: Role;
  inspections: number;
  lastActivity: string | null;
}

/** All checks happen in the database (see schema.sql) — these calls only mirror them in the UI. */
export async function myRole(): Promise<Role> {
  if (!supabase) return 'inspector';
  const { data, error } = await supabase.rpc('my_role');
  if (error) throw error;
  return data as Role;
}

export async function listTeam(): Promise<TeamMember[]> {
  const { data, error } = await supabase!.rpc('list_team');
  if (error) throw error;
  return (data as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    email: r.email as string,
    role: r.role as Role,
    inspections: Number(r.inspections),
    lastActivity: (r.last_activity as string) ?? null,
  }));
}

export async function setUserRole(userId: string, role: Role) {
  const { error } = await supabase!.rpc('set_user_role', { target: userId, new_role: role });
  if (error) throw error;
}
