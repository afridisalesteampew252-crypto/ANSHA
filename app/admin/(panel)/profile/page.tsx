'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { KeyRound, Loader2, Pencil, ShieldCheck, UserRound } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import type { AdminProfile } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function AdminProfilePage() {
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [avatarUrl, setAvatarUrl] = useState('');

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase.from('admin_profiles').select('*').eq('id', session.user.id).maybeSingle();
      if (!active || !data) return;
      const nextProfile = data as AdminProfile;
      setProfile(nextProfile);
      if (nextProfile.avatar_url) {
        const { data: signed } = await supabase.storage.from('profile-images').createSignedUrl(nextProfile.avatar_url, 3600);
        if (active) setAvatarUrl(signed?.signedUrl || '');
      }
    }

    void loadProfile();
    return () => { active = false; };
  }, []);

  if (!profile) {
    return <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;
  }

  const displayName = profile.full_name || 'ANSHA staff';
  const access = profile.role === 'admin'
    ? 'Full access to users, customers, catalog, imports, content, and system operations.'
    : 'Operational access to the internal workspace and assigned catalog workflows.';

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My profile</h1>
        <p className="text-sm text-muted-foreground">Your signed-in identity, role, and system access.</p>
      </div>
      <Card className="overflow-hidden">
        <div className="h-24 bg-gradient-to-r from-primary via-red-700 to-slate-950" />
        <CardContent className="relative space-y-6 px-6 pb-6 pt-0 sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4">
              <div className="-mt-10 flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border-4 border-card bg-secondary shadow-md">
                {avatarUrl ? <Image src={avatarUrl} alt={`${displayName} profile picture`} width={96} height={96} className="h-full w-full object-cover" /> : <UserRound className="h-10 w-10 text-muted-foreground" />}
              </div>
              <div className="pb-1">
                <h2 className="text-xl font-bold">{displayName}</h2>
                <p className="text-sm text-muted-foreground">{profile.email || 'Internal account'}</p>
              </div>
            </div>
            {profile.role === 'admin' ? (
              <Button asChild variant="outline"><Link href="/admin/users"><Pencil className="h-4 w-4" />Edit user profiles</Link></Button>
            ) : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border bg-secondary/30 p-4">
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-primary" />Role and access</p>
              <Badge className="mb-3 capitalize">{profile.role}</Badge>
              <p className="text-sm leading-relaxed text-muted-foreground">{access}</p>
            </div>
            <div className="rounded-xl border bg-secondary/30 p-4">
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4 text-primary" />Account security</p>
              <p className="text-sm leading-relaxed text-muted-foreground">Profile pictures are stored privately. Account changes are limited to authorized administrators.</p>
            </div>
          </div>
        </CardContent>
      </Card>
      {profile.role !== 'admin' ? (
        <Card><CardHeader><CardTitle className="text-base">Need to update your profile?</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Ask an administrator to change your name, email, password, or profile picture.</CardContent></Card>
      ) : null}
    </div>
  );
}
