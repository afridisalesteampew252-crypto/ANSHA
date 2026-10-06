'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { supabase } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { useLoginLockout } from '@/components/auth/use-login-lockout';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const loginLockout = useLoginLockout('admin', email);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: profile } = await supabase
          .from('admin_profiles')
          .select('id')
          .eq('id', session.user.id)
          .maybeSingle();
        if (profile) {
          router.replace('/admin/dashboard');
          return;
        }
      }
      setChecking(false);
    })();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loginLockout.refresh().lockedUntil > Date.now()) return;
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      const attempt = loginLockout.recordFailure();
      setLoading(false);
      toast.error(attempt.lockedUntil > Date.now()
        ? 'Too many failed attempts. Sign-in is locked for 5 minutes.'
        : `Invalid email or password. ${3 - attempt.attempts} attempts remain before a temporary sign-in lock.`);
      return;
    }

    loginLockout.clearFailures();

    const { data: profile } = await supabase
      .from('admin_profiles')
      .select('id, role, is_active')
      .eq('id', data.user.id)
      .maybeSingle();

    if (!profile || profile.is_active === false) {
      await supabase.auth.signOut();
      setLoading(false);
      toast.error(profile?.is_active === false
        ? 'This account has been deactivated. Contact an administrator.'
        : 'You do not have admin access. Contact an administrator.');
      return;
    }

    toast.success('Welcome back!');
    router.push('/admin/dashboard');
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-secondary/30">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="admin-login-shell flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="admin-login-card w-full max-w-md rounded-2xl">
        <CardHeader className="text-center">
          <Image
            src="/images/ansha-logo-transparent.webp"
            alt="Ansha Trading Co. LLC-FZ"
            width={337}
            height={135}
            priority
            className="mx-auto mb-3 h-auto w-full max-w-[250px] object-contain"
          />
          <CardDescription>Staff sign in to manage ANSHA operations</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-email">Email</Label>
              <Input
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="staff@anshatradingco.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-password">Password</Label>
              <div className="relative">
                <Input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Your password"
                  className="pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                </button>
              </div>
            </div>
            {loginLockout.secondsRemaining > 0 ? (
              <p role="alert" className="text-sm text-destructive">
                Too many failed attempts. Try again in {Math.floor(loginLockout.secondsRemaining / 60)}:{String(loginLockout.secondsRemaining % 60).padStart(2, '0')}.
              </p>
            ) : null}
            <Button type="submit" variant="accent" className="w-full shadow-md shadow-accent/20" size="lg" disabled={loading || loginLockout.secondsRemaining > 0}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
