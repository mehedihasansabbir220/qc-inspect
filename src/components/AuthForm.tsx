import { useState, type FormEvent } from 'react';
import { LogIn, UserPlus } from 'lucide-react';
import { signIn, signUp } from '../lib/supabase';
import { Segmented, Spinner } from './ui';

export function AuthForm({ intro }: { intro?: string }) {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'err' | 'ok'; text: string }>();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(undefined);
    try {
      if (mode === 'in') await signIn(email.trim(), password);
      else if ((await signUp(email.trim(), password)) === 'confirm-email') setMsg({ tone: 'ok', text: 'Check your inbox to confirm your email, then sign in.' });
    } catch (err) {
      setMsg({ tone: 'err', text: err instanceof Error ? err.message : 'Something went wrong' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {intro && <p className="text-sm text-ink-600">{intro}</p>}
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'in', label: 'Sign in' },
          { value: 'up', label: 'Create account' },
        ]}
      />
      <input className="field" type="email" autoComplete="email" required placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input
        className="field"
        type="password"
        autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
        required
        minLength={6}
        placeholder="Password (min. 6 characters)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {msg && <p className={`text-sm ${msg.tone === 'err' ? 'text-crit' : 'text-brand-600'}`}>{msg.text}</p>}
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? <Spinner /> : mode === 'in' ? <LogIn className="size-4" /> : <UserPlus className="size-4" />}
        {mode === 'in' ? 'Sign in' : 'Create account'}
      </button>
    </form>
  );
}
