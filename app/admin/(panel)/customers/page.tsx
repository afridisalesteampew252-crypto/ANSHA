'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { KeyRound, Pencil, Plus, Search, Trash2, Upload, Users } from 'lucide-react';
import { matchesQuery } from '@/lib/matches-query';
import { supabase } from '@/lib/supabase/client';
import type { Customer } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const emptyForm = {
  customer_code: '',
  full_name: '',
  company_name: '',
  email: '',
  phone: '',
  whatsapp: '',
  country: '',
  address: '',
  notes: '',
  avatar_url: '',
};
type CustomerForm = typeof emptyForm;
type PortalMap = Record<string, { email: string; is_active: boolean }>;

const FORM_FIELDS: { key: keyof Omit<CustomerForm, 'avatar_url'>; label: string; required?: boolean }[] = [
  { key: 'customer_code', label: 'Customer code', required: true },
  { key: 'full_name', label: 'Full name', required: true },
  { key: 'company_name', label: 'Company name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'country', label: 'Country' },
  { key: 'address', label: 'Address' },
  { key: 'notes', label: 'Notes' },
];

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [portalByCustomer, setPortalByCustomer] = useState<PortalMap>({});
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [selfId, setSelfId] = useState('');
  const [selfRole, setSelfRole] = useState<string>('staff');

  const load = useCallback(async () => {
    const [{ data }, { data: portals }, { data: auth }] = await Promise.all([
      supabase.from('customers').select('*').order('created_at', { ascending: false }),
      supabase.from('customer_profiles').select('customer_id,email,is_active'),
      supabase.auth.getUser(),
    ]);
    const userId = auth.user?.id || '';
    setSelfId(userId);
    if (userId) {
      const { data: profile } = await supabase.from('admin_profiles').select('role').eq('id', userId).maybeSingle();
      setSelfRole(profile?.role || 'staff');
    }
    const records = (data || []) as Customer[];
    setCustomers(records);
    const map: PortalMap = {};
    for (const row of portals || []) {
      if (row.customer_id) map[row.customer_id] = { email: row.email, is_active: row.is_active };
    }
    setPortalByCustomer(map);
    const withAvatars = records.filter((item) => item.avatar_url);
    if (withAvatars.length) {
      const { data: signed } = await supabase.storage
        .from('profile-images')
        .createSignedUrls(
          withAvatars.map((item) => item.avatar_url!),
          3600
        );
      setAvatarUrls(Object.fromEntries(withAvatars.map((item, index) => [item.id, signed?.[index]?.signedUrl || ''])));
    } else {
      setAvatarUrls({});
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview(null);
      return;
    }
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setAvatarFile(null);
    setFormError('');
  };

  const openAdd = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (customer: Customer) => {
    setEditingId(customer.id);
    setAvatarFile(null);
    setFormError('');
    setForm({
      customer_code: customer.customer_code,
      full_name: customer.full_name,
      company_name: customer.company_name || '',
      email: customer.email || '',
      phone: customer.phone || '',
      whatsapp: customer.whatsapp || '',
      country: customer.country || '',
      address: customer.address || '',
      notes: customer.notes || '',
      avatar_url: customer.avatar_url || '',
    });
    setDialogOpen(true);
  };

  const handleDialogChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) resetForm();
  };

  const uploadAvatar = async (file: File, ownerId: string) => {
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `customers/${ownerId}-${Date.now()}.${extension}`;
    const { error } = await supabase.storage.from('profile-images').upload(path, file, { upsert: true });
    if (error) throw error;
    return path;
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    if (!form.customer_code.trim() || !form.full_name.trim()) {
      setFormError('Customer code and name are required.');
      return;
    }
    setSaving(true);
    try {
      const wasEditing = Boolean(editingId);
      const customerId = editingId || crypto.randomUUID();
      const avatarUrl = avatarFile ? await uploadAvatar(avatarFile, customerId) : form.avatar_url || null;
      const payload = {
        ...Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim() || null])),
        avatar_url: avatarUrl,
        ...(editingId || !selfId ? {} : { owner_id: selfId }),
      };
      const operation = editingId
        ? supabase.from('customers').update(payload).eq('id', editingId)
        : supabase.from('customers').insert({ id: customerId, ...payload });
      const { error } = await operation;
      if (error) throw error;
      setDialogOpen(false);
      resetForm();
      setMessage(wasEditing ? 'Customer updated.' : 'Customer added. Open their account to enable portal login.');
      await load();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to save customer.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this customer permanently?')) return;
    const { error } = await supabase.from('customers').delete().eq('id', id);
    if (error) {
      setMessage(error.message);
      return;
    }
    if (editingId === id) {
      setDialogOpen(false);
      resetForm();
    }
    setMessage('Customer deleted.');
    await load();
  };

  const visible = customers.filter((item) => {
    const portal = portalByCustomer[item.id];
    return matchesQuery(query, [
      item.customer_code,
      item.full_name,
      item.company_name,
      item.email,
      item.phone,
      item.whatsapp,
      item.country,
      item.address,
      item.notes,
      item.tax_registration_number,
      portal?.email,
    ]);
  });

  const existingAvatarSrc = editingId ? avatarUrls[editingId] : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
          <p className="text-sm text-muted-foreground">
            Manage CRM profiles{selfRole === 'sales' ? ' assigned to you' : ''}. Enable customer portal login from each
            customer&apos;s account page.
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-3 sm:items-end">
          <Button onClick={openAdd} className="w-full sm:w-auto">
            <Plus className="h-4 w-4" />
            Add customer
          </Button>
          <div className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-3 text-sm text-muted-foreground sm:max-w-xs">
            <strong className="text-foreground">Portal tip:</strong> open a customer →{' '}
            <span className="font-semibold text-accent">Account &amp; portal</span> → Enable portal.
          </div>
        </div>
      </div>

      {message ? (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-secondary/40 px-4 py-3 text-sm">
          <p className="text-muted-foreground">{message}</p>
          <Button type="button" variant="ghost" size="sm" className="h-auto shrink-0 px-2 py-0.5" onClick={() => setMessage('')}>
            Dismiss
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search code, name, email, phone, address, notes…"
            className="pl-9"
            aria-label="Search customers"
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {visible.length === customers.length
            ? `${customers.length} customer${customers.length === 1 ? '' : 's'}`
            : `${visible.length} of ${customers.length}`}
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          {visible.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
                <Users className="h-5 w-5 text-muted-foreground" />
              </div>
              {customers.length === 0 ? (
                <>
                  <div className="space-y-1">
                    <p className="font-medium">No customers yet</p>
                    <p className="text-sm text-muted-foreground">Add a CRM profile to start statements and portal access.</p>
                  </div>
                  <Button onClick={openAdd}>
                    <Plus className="h-4 w-4" />
                    Add customer
                  </Button>
                </>
              ) : (
                <div className="space-y-1">
                  <p className="font-medium">No matches</p>
                  <p className="text-sm text-muted-foreground">Try a different search term.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="divide-y">
              {visible.map((item) => {
                const portal = portalByCustomer[item.id];
                return (
                  <div
                    key={item.id}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {avatarUrls[item.id] ? (
                        <Image
                          src={avatarUrls[item.id]}
                          alt=""
                          width={44}
                          height={44}
                          className="h-11 w-11 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary font-semibold">
                          {item.full_name.charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-medium">
                          {item.full_name}
                          <span className="text-xs text-muted-foreground">{item.customer_code}</span>
                          {portal ? (
                            <Badge
                              variant="outline"
                              className="border-emerald-600/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                            >
                              Portal on
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              No portal
                            </Badge>
                          )}
                        </p>
                        <p className="truncate text-sm text-muted-foreground">
                          {[item.company_name, item.phone, item.country, portal?.email].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild variant="accent" size="sm">
                        <Link href={`/admin/customers/${item.id}`}>Statement (SOA)</Link>
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/admin/customers/${item.id}`}>
                          <KeyRound className="h-4 w-4" />
                          {portal ? 'Portal' : 'Enable portal'}
                        </Link>
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openEdit(item)}>
                        <Pencil className="h-4 w-4" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => void remove(item.id)}
                        aria-label="Delete customer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={handleDialogChange}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit customer' : 'Add customer'}</DialogTitle>
            <DialogDescription>
              {editingId
                ? 'Update CRM profile details. Portal login is managed from the customer account page.'
                : 'Create a CRM profile. Customer code and name are required.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={(event) => void save(event)} className="space-y-5">
            <div className="flex flex-wrap items-center gap-4">
              {avatarPreview ? (
                <img src={avatarPreview} alt="Customer" className="h-16 w-16 rounded-full object-cover" />
              ) : existingAvatarSrc ? (
                <Image
                  src={existingAvatarSrc}
                  alt="Customer"
                  width={64}
                  height={64}
                  className="h-16 w-16 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-lg font-semibold text-muted-foreground">
                  {(form.full_name || '?').charAt(0).toUpperCase()}
                </div>
              )}
              <Label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-secondary/60">
                <Upload className="h-4 w-4" />
                {avatarFile?.name || 'Choose profile picture'}
                <Input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => setAvatarFile(e.target.files?.[0] || null)}
                />
              </Label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {FORM_FIELDS.map(({ key, label, required }) => (
                <div key={key} className={`space-y-1.5 ${key === 'address' || key === 'notes' ? 'sm:col-span-2' : ''}`}>
                  <Label htmlFor={key}>
                    {label}
                    {required ? <span className="text-accent"> *</span> : null}
                  </Label>
                  <Input
                    id={key}
                    value={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    required={required}
                    autoComplete="off"
                  />
                </div>
              ))}
            </div>

            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => handleDialogChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {editingId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add customer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
