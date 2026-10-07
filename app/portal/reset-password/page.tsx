'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/auth/password-input';

export default function PortalResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    void (async () => {
      // Admin-triggered recovery is created on the server without the customer's
      // PKCE verifier. Import its recovery tokens explicitly into the SSR client.
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = hash.get('access_token');
      const refreshToken = hash.get('refresh_token');
      if (accessToken && refreshToken && hash.get('type') === 'recovery') {
        const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        if (error) throw error;
      } else if (hash.has('error')) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        throw new Error('This recovery link has expired. Request a new password reset email.');
      }
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) throw new Error('Open the newest password reset link from your email to continue.');
      const { data: profile } = await supabase.from('customer_profiles').select('id').eq('id', user.id).eq('is_active', true).maybeSingle();
      if (!profile) throw new Error('This account does not have active customer portal access.');
      if (active) setReady(true);
    })().catch((error: unknown) => {
      if (active) setMessage(error instanceof Error ? error.message : 'Password recovery could not be verified.');
    });
    return () => { active = false; };
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    if (password.length < 8) {
      setMessage('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmation) {
      setMessage('Passwords do not match.');
      return;
    }
    setBusy(true);
    setMessage('');
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage('Password changed successfully. Redirecting to your portal…');
    window.setTimeout(() => router.replace('/portal'), 700);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-accent" />
            Set your portal password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={(event) => void submit(event)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-password">New password</Label>
                <PasswordInput
                  id="new-password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  disabled={!ready}
                />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <PasswordInput id="confirm-password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={!ready} />
            </div>
            <Button type="submit" className="w-full" disabled={busy || !ready}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Change password
            </Button>
            {message ? <p className="text-sm text-muted-foreground" role="status">{message}</p> : null}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
