'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Wrench, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { supabase } from '@/lib/supabase/client';
import { toast } from 'sonner';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setLoading(false);
      toast.error('Invalid email or password.');
      return;
    }

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
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-accent via-orange-500 to-amber-400 shadow-lg shadow-accent/25">
            <Wrench className="h-6 w-6 text-white" />
          </div>
          <CardTitle className="text-2xl font-black tracking-tight">ANSHA<span className="text-accent">TRADING</span></CardTitle>
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
                placeholder="staff@anshatrading.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-password">Password</Label>
              <Input
                id="admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Your password"
              />
            </div>
            <Button type="submit" variant="accent" className="w-full shadow-md shadow-accent/20" size="lg" disabled={loading}>
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
