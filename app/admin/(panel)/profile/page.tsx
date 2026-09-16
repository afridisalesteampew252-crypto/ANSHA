'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { Camera, CheckCircle2, KeyRound, Loader2, Save, ShieldCheck, UserRound } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import type { AdminProfile } from '@/lib/types';
import { compressCatalogImage } from '@/lib/catalog-image';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function AdminProfilePage() {
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [fullName, setFullName] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [message, setMessage] = useState('');

  const loadProfile = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data, error } = await supabase.from('admin_profiles').select('*').eq('id', session.user.id).maybeSingle();
    if (error || !data) {
      setMessage(error?.message || 'Profile not found.');
      return;
    }
    const nextProfile = data as AdminProfile;
    setProfile(nextProfile);
    setFullName(nextProfile.full_name || '');
    if (nextProfile.avatar_url) {
      const { data: signed } = await supabase.storage.from('profile-images').createSignedUrl(nextProfile.avatar_url, 3600);
      setAvatarUrl(signed?.signedUrl || '');
    } else setAvatarUrl('');
  }, []);

  useEffect(() => { void loadProfile(); }, [loadProfile]);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    if (!profile || !fullName.trim()) return;
    setSavingProfile(true);
    setMessage('');
    try {
      let avatarPath = profile.avatar_url;
      if (avatarFile) {
        const optimized = await compressCatalogImage(avatarFile, `${fullName}-profile`, { maxEdge: 512, quality: 0.82 });
        avatarPath = `self/${profile.id}/avatar.webp`;
        const { error: uploadError } = await supabase.storage.from('profile-images').upload(avatarPath, optimized.file, {
          cacheControl: '3600',
          contentType: 'image/webp',
          upsert: true,
        });
        if (uploadError) throw uploadError;
      }
      const { error } = await supabase.from('admin_profiles').update({ full_name: fullName.trim(), avatar_url: avatarPath }).eq('id', profile.id);
      if (error) throw error;
      setAvatarFile(null);
      setMessage('Profile updated successfully.');
      await loadProfile();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update profile.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword.length < 8) {
      setMessage('Password must contain at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage('Password confirmation does not match.');
      return;
    }
    setSavingPassword(true);
    setMessage('');
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) setMessage(error.message);
    else {
      setNewPassword('');
      setConfirmPassword('');
      setMessage('Password changed successfully.');
    }
    setSavingPassword(false);
  }

  if (!profile) return <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;

  const displayName = profile.full_name || 'ANSHA staff';
  const access = profile.role === 'admin'
    ? 'Full access to users, customers, catalog, imports, content, communications, and system operations.'
    : 'Operational access to the internal workspace, communications, and assigned catalog workflows.';

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">My profile</h1><p className="text-sm text-muted-foreground">Manage your identity, profile photo, and account password.</p></div>
      {message ? <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm"><CheckCircle2 className="h-4 w-4 text-primary" />{message}</div> : null}
      <Card className="overflow-hidden">
        <div className="h-24 bg-gradient-to-r from-primary via-red-700 to-slate-950" />
        <CardContent className="relative space-y-6 px-6 pb-6 pt-0 sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4"><div className="-mt-10 flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border-4 border-card bg-secondary shadow-md">{avatarUrl ? <Image src={avatarUrl} alt={`${displayName} profile picture`} width={96} height={96} className="h-full w-full object-cover" unoptimized /> : <UserRound className="h-10 w-10 text-muted-foreground" />}</div><div className="pb-1"><h2 className="text-xl font-bold">{displayName}</h2><p className="text-sm text-muted-foreground">{profile.email || 'Internal account'}</p></div></div>
            <Badge className="w-fit capitalize">{profile.role}</Badge>
          </div>
          <div className="grid gap-4 sm:grid-cols-2"><div className="rounded-xl border bg-secondary/30 p-4"><p className="mb-2 flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-primary" />Role and access</p><p className="text-sm leading-relaxed text-muted-foreground">{access}</p></div><div className="rounded-xl border bg-secondary/30 p-4"><p className="mb-2 flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4 text-primary" />Account security</p><p className="text-sm leading-relaxed text-muted-foreground">Your picture is private and your password is managed securely by Supabase Auth.</p></div></div>
        </CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader><CardTitle className="text-lg">Profile details</CardTitle></CardHeader><CardContent><form onSubmit={saveProfile} className="space-y-4"><div className="space-y-1.5"><Label htmlFor="profile-name">Full name</Label><Input id="profile-name" value={fullName} onChange={(event) => setFullName(event.target.value)} required maxLength={120} /></div><div className="space-y-2"><Label>Profile picture</Label><Label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed p-4 text-sm hover:bg-accent"><Camera className="h-5 w-5 text-primary" /><span>{avatarFile?.name || 'Choose JPG, PNG, or WebP image'}</span><Input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => setAvatarFile(event.target.files?.[0] || null)} /></Label><p className="text-xs text-muted-foreground">Images are automatically resized to 512px and converted to WebP before upload.</p></div><Button disabled={savingProfile || !fullName.trim()}>{savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save profile</Button></form></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-lg">Change password</CardTitle></CardHeader><CardContent><form onSubmit={changePassword} className="space-y-4"><div className="space-y-1.5"><Label htmlFor="new-password">New password</Label><Input id="new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} autoComplete="new-password" required /></div><div className="space-y-1.5"><Label htmlFor="confirm-password">Confirm new password</Label><Input id="confirm-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} autoComplete="new-password" required /></div><Button disabled={savingPassword || !newPassword || !confirmPassword}>{savingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}Update password</Button></form></CardContent></Card>
      </div>
    </div>
  );
}
