'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { Loader2, Pencil, ShieldAlert, Upload, UserPlus, UserX, X } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import type { AdminProfile, AdminRole } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type UserForm = {
  email: string;
  password: string;
  full_name: string;
  role: AdminRole;
  avatar_url: string;
  is_active: boolean;
};

const emptyForm: UserForm = {
  email: '',
  password: '',
  full_name: '',
  role: 'staff',
  avatar_url: '',
  is_active: true,
};

const roleLabel: Record<AdminRole, string> = {
  admin: 'Admin',
  staff: 'Staff',
  sales: 'Sales agent',
};

export default function UsersPage() {
  const [users, setUsers] = useState<AdminProfile[]>([]);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [selfId, setSelfId] = useState('');

  const load = useCallback(async () => {
    const [{ data }, { data: { user } }] = await Promise.all([
      supabase.from('admin_profiles').select('*').order('created_at', { ascending: false }),
      supabase.auth.getUser(),
    ]);
    const records = (data || []) as AdminProfile[];
    setUsers(records);
    setSelfId(user?.id || '');
    setCanManage(records.find((profile) => profile.id === user?.id)?.role === 'admin');
    const withAvatars = records.filter((profile) => profile.avatar_url);
    if (withAvatars.length) {
      const { data: signed } = await supabase.storage.from('profile-images').createSignedUrls(withAvatars.map((profile) => profile.avatar_url!), 3600);
      setAvatarUrls(Object.fromEntries(withAvatars.map((profile, index) => [profile.id, signed?.[index]?.signedUrl || ''])));
    } else setAvatarUrls({});
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reset = () => {
    setForm(emptyForm);
    setEditingId(null);
    setAvatarFile(null);
    setMessage('');
    setIsError(false);
  };

  const edit = (user: AdminProfile) => {
    setEditingId(user.id);
    setAvatarFile(null);
    setMessage('');
    setForm({
      email: user.email || '',
      password: '',
      full_name: user.full_name || '',
      role: user.role,
      avatar_url: user.avatar_url || '',
      is_active: user.is_active !== false,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const uploadAvatar = async (file: File, id: string) => {
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `users/${id}-${Date.now()}.${extension}`;
    const { error } = await supabase.storage.from('profile-images').upload(path, file, { upsert: true });
    if (error) throw error;
    return path;
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManage) return;
    setBusy(true);
    setIsError(false);
    setMessage(editingId ? 'Updating user…' : 'Creating account…');
    try {
      let avatarUrl = form.avatar_url || null;
      if (editingId && avatarFile) avatarUrl = await uploadAvatar(avatarFile, editingId);
      const endpoint = editingId ? 'admin-update-user' : 'admin-create-user';
      const { data, error } = await supabase.functions.invoke(endpoint, {
        body: {
          ...form,
          id: editingId,
          email: form.email.trim().toLowerCase(),
          full_name: form.full_name.trim(),
          avatar_url: avatarUrl,
          is_active: form.is_active,
        },
      });
      if (error) {
        let detail = error.message;
        if ('context' in error && error.context instanceof Response) {
          const payload = await error.context.clone().json().catch(() => null) as { error?: string } | null;
          detail = payload?.error || detail;
        }
        throw new Error(detail || 'Unable to save user.');
      }
      if (!editingId && avatarFile && data?.id) {
        const uploaded = await uploadAvatar(avatarFile, data.id);
        const { error: avatarError } = await supabase.from('admin_profiles').update({ avatar_url: uploaded }).eq('id', data.id);
        if (avatarError) throw new Error(`The account was created, but the avatar could not be saved: ${avatarError.message}`);
      }
      const wasEditing = Boolean(editingId);
      reset();
      setMessage(wasEditing ? 'User updated successfully.' : 'User created. They can sign in immediately.');
      await load();
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : 'Unable to save user.');
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (user: AdminProfile) => {
    if (!canManage || user.id === selfId) return;
    setBusy(true);
    setIsError(false);
    setMessage(user.is_active === false ? 'Reactivating user…' : 'Deactivating user…');
    try {
      const { data, error } = await supabase.functions.invoke('admin-update-user', {
        body: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          avatar_url: user.avatar_url,
          is_active: user.is_active === false,
          password: '',
        },
      });
      if (error || data?.error) {
        let detail = data?.error || error?.message || 'Unable to update user status.';
        if (error && 'context' in error && error.context instanceof Response) {
          const payload = await error.context.clone().json().catch(() => null) as { error?: string } | null;
          detail = payload?.error || detail;
        }
        throw new Error(detail);
      }
      setMessage(user.is_active === false ? 'User reactivated.' : 'User deactivated and blocked from signing in.');
      await load();
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : 'Unable to update user status.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin users</h1>
        <p className="text-sm text-muted-foreground">
          Create staff or sales-agent accounts, deactivate access, and manage passwords.
        </p>
      </div>

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{editingId ? 'Edit user' : 'Add user'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={(event) => void save(event)} className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-wrap items-center gap-4 md:col-span-2">
                {editingId && avatarUrls[editingId] ? (
                  <Image src={avatarUrls[editingId]} alt="User profile" width={64} height={64} className="h-16 w-16 rounded-full object-cover" />
                ) : null}
                <Label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <Upload className="h-4 w-4" />
                  {avatarFile?.name || 'Choose profile picture'}
                  <Input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={busy} onChange={(event) => setAvatarFile(event.target.files?.[0] || null)} />
                </Label>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="user-email">Email</Label>
                <Input id="user-email" type="email" autoComplete="off" required disabled={busy} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="user-password">{editingId ? 'New password (optional)' : 'Temporary password'}</Label>
                <Input id="user-password" type="password" autoComplete="new-password" minLength={8} required={!editingId} disabled={busy} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
                <p className="text-xs text-muted-foreground">Minimum 8 characters.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="user-name">Full name</Label>
                <Input id="user-name" required disabled={busy} value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="user-role">Role</Label>
                <select
                  id="user-role"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  disabled={busy}
                  value={form.role}
                  onChange={(event) => setForm({ ...form, role: event.target.value as AdminRole })}
                >
                  <option value="sales">Sales agent — stock + own customers</option>
                  <option value="staff">Staff — full operations</option>
                  <option value="admin">Admin — full access</option>
                </select>
              </div>
              {editingId ? (
                <label className="flex items-center gap-2 text-sm md:col-span-2">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    disabled={busy || editingId === selfId}
                    onChange={(event) => setForm({ ...form, is_active: event.target.checked })}
                  />
                  Account active (uncheck to deactivate sign-in)
                </label>
              ) : null}
              <div className="flex flex-col gap-3 md:col-span-2 sm:flex-row sm:items-center">
                <Button disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : editingId ? <Pencil className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                  {busy ? 'Saving…' : editingId ? 'Save changes' : 'Create user'}
                </Button>
                {editingId ? (
                  <Button type="button" variant="outline" disabled={busy} onClick={reset}>
                    <X className="h-4 w-4" />
                    Cancel
                  </Button>
                ) : null}
                {message ? <p role="status" className={isError ? 'text-sm text-destructive' : 'text-sm text-emerald-600'}>{message}</p> : null}
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <CardContent className="flex gap-3 p-5">
            <ShieldAlert className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
            <div>
              <p className="font-semibold">Administrator access required</p>
              <p className="text-sm text-muted-foreground">Only an administrator can create, edit, or deactivate accounts.</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">User directory</CardTitle>
        </CardHeader>
        <CardContent className="divide-y p-0">
          {users.map((user) => (
            <div key={user.id} className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 items-center gap-3">
                {avatarUrls[user.id] ? (
                  <Image src={avatarUrls[user.id]} alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-full object-cover" />
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary font-semibold">
                    {(user.full_name || user.email || 'U').charAt(0)}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate font-medium">{user.full_name || 'Unnamed user'}</p>
                  <p className="truncate text-xs text-muted-foreground">{user.email || user.id}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
                <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium">{roleLabel[user.role] || user.role}</span>
                {user.is_active === false ? (
                  <Badge variant="outline" className="border-destructive/40 text-destructive">Inactive</Badge>
                ) : (
                  <Badge variant="outline" className="border-emerald-600/30 text-emerald-700">Active</Badge>
                )}
                {canManage ? (
                  <>
                    <Button variant="ghost" size="icon" onClick={() => edit(user)} aria-label={`Edit ${user.full_name || user.email || 'user'}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {user.id !== selfId ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => void toggleActive(user)}
                      >
                        <UserX className="h-4 w-4" />
                        {user.is_active === false ? 'Activate' : 'Deactivate'}
                      </Button>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
