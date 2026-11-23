import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, Users } from 'lucide-react';
import { listTeam, myRole, setUserRole, type Role, type TeamMember } from '../lib/team';
import { useSession } from '../lib/supabase';
import { useNetwork } from '../lib/sync';
import { relativeTime, Spinner } from './ui';

/** Settings card: your role; for QA managers, the team list with role assignment. */
export function TeamCard() {
  const session = useSession();
  const { online } = useNetwork();
  const [role, setRole] = useState<Role>();
  const [team, setTeam] = useState<TeamMember[]>();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState<string>();

  const load = useCallback(async () => {
    try {
      const r = await myRole();
      setRole(r);
      if (r === 'manager') setTeam(await listTeam());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (session && online) void load();
  }, [session, online, load]);

  if (!session) return null;

  async function change(m: TeamMember, r: Role) {
    setSaving(m.id);
    setError(undefined);
    try {
      await setUserRole(m.id, r);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(undefined);
    }
  }

  return (
    <>
      <h2 className="mt-6 mb-2 flex items-center gap-1.5 px-1 text-xs font-bold tracking-wide text-ink-500 uppercase">
        <Users className="size-3.5" /> Team & roles
      </h2>
      <section className="card p-4">
        {!online ? (
          <p className="text-sm text-ink-500">Connect to the internet to see your team.</p>
        ) : !role ? (
          <Spinner />
        ) : role === 'inspector' ? (
          <p className="text-sm text-ink-600">
            Your role: <b>Inspector</b> — you see your own inspections and reports shared with you. A QA manager can see everyone’s reports and change roles.
          </p>
        ) : (
          <>
            <p className="mb-3 flex items-center gap-1.5 text-sm text-ink-600">
              <ShieldCheck className="size-4 text-brand-600" /> Your role: <b>QA manager</b> — you see and download every inspector’s reports (read-only) under the <b>Team</b> filter.
            </p>
            <ul className="divide-y divide-ink-100">
              {team?.map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-2.5">
                  <div className="grid size-9 shrink-0 place-items-center rounded-full bg-ink-100 text-sm font-bold text-ink-600 uppercase">{m.email?.[0]}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">
                      {m.email}
                      {m.id === session.user.id && <span className="font-normal text-ink-400"> (you)</span>}
                    </div>
                    <div className="text-xs text-ink-500">
                      {m.inspections} inspection{m.inspections === 1 ? '' : 's'}
                      {m.lastActivity && ` · active ${relativeTime(Date.parse(m.lastActivity))}`}
                    </div>
                  </div>
                  {saving === m.id ? (
                    <Spinner />
                  ) : (
                    <select
                      className="rounded-lg border border-ink-200 bg-white px-2 py-1.5 text-sm font-semibold disabled:opacity-60"
                      value={m.role}
                      disabled={m.id === session.user.id}
                      onChange={(e) => void change(m, e.target.value as Role)}
                      aria-label={`Role of ${m.email}`}
                    >
                      <option value="inspector">Inspector</option>
                      <option value="manager">QA manager</option>
                    </select>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
        {error && <p className="mt-2 text-sm text-crit">{error}</p>}
      </section>
    </>
  );
}
