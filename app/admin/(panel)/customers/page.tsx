'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ChevronDown,
  KeyRound,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  UserRoundCheck,
  Users,
  WalletCards,
} from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const emptyForm = {
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
type CustomerAssignee = { id: string; full_name: string; role: 'manager' | 'sales' | 'freelancer' };

const FORM_FIELDS: { key: keyof Omit<CustomerForm, 'avatar_url'>; label: string; required?: boolean }[] = [
  { key: 'full_name', label: 'Full name', required: true },
  { key: 'company_name', label: 'Company name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'country', label: 'Country' },
  { key: 'address', label: 'Address' },
  { key: 'notes', label: 'Notes' },
];

const isFieldAgentRole = (role: string) => role === 'sales' || role === 'freelancer';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [portalByCustomer, setPortalByCustomer] = useState<PortalMap>({});
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [assignees, setAssignees] = useState<CustomerAssignee[]>([]);
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const [selfId, setSelfId] = useState('');
  const [selfRole, setSelfRole] = useState<string>('staff');

  const load = useCallback(async () => {
    const [{ data }, { data: portals }, { data: auth }, { data: ownerRows }] = await Promise.all([
      supabase.from('customers').select('*').order('created_at', { ascending: false }),
      supabase.from('customer_profiles').select('customer_id,email,is_active'),
      supabase.auth.getUser(),
      supabase.rpc('list_customer_assignees'),
    ]);
    setAssignees((ownerRows || []) as CustomerAssignee[]);
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
    setEditingCode(null);
    setAvatarFile(null);
    setFormError('');
  };

  const openAdd = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (customer: Customer) => {
    setEditingId(customer.id);
    setEditingCode(customer.customer_code);
    setAvatarFile(null);
    setFormError('');
    setForm({
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
    if (!form.full_name.trim()) {
      setFormError('Full name is required.');
      return;
    }
    setSaving(true);
    try {
      const wasEditing = Boolean(editingId);
      const customerId = editingId || crypto.randomUUID();
      const avatarUrl = avatarFile ? await uploadAvatar(avatarFile, customerId) : form.avatar_url || null;
      const trimmed = Object.fromEntries(
        Object.entries(form).map(([key, value]) => [key, value.trim() || null])
      ) as Record<string, string | null>;
      const payload = {
        ...trimmed,
        avatar_url: avatarUrl,
        ...(editingId || !selfId || !isFieldAgentRole(selfRole) ? {} : { owner_id: selfId }),
      };
      // Omit customer_code on create — DB default / trigger assigns next Customer ID.
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

  const assignCustomer = async (customerId: string, ownerId: string) => {
    setAssigningId(customerId);
    const { error } = await supabase.rpc('assign_customer_owner', {
      p_customer_id: customerId,
      p_owner_id: ownerId || null,
    });
    setAssigningId(null);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage(ownerId ? 'Account owner assigned.' : 'Customer moved to the unassigned queue.');
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
      item.consignee_name,
      item.consignee_company,
      portal?.email,
      assignees.find((owner) => owner.id === item.owner_id)?.full_name,
      assignees.find((owner) => owner.id === item.owner_id)?.role,
    ]);
  });

  const existingAvatarSrc = editingId ? avatarUrls[editingId] : null;
  const fieldAgentScoped = isFieldAgentRole(selfRole);
  const canAssign = selfRole === 'admin' || selfRole === 'manager';
  const unassignedCount = customers.filter((customer) => !customer.owner_id).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
          <p className="text-sm text-muted-foreground">
            Manage CRM profiles{fieldAgentScoped ? ' assigned to you' : ''}. Enable customer portal login from each
            customer&apos;s account page. Account ownership controls the sales and freelancer workflow scope.
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

      {canAssign && unassignedCount > 0 ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-foreground">{unassignedCount} customer{unassignedCount === 1 ? '' : 's'} need an account owner</p>
            <p className="text-muted-foreground">Assign a manager, sales agent or freelancer so their customer workflow is scoped correctly.</p>
          </div>
          <Badge variant="outline" className="w-fit border-amber-500/40 bg-background/60 text-amber-700 dark:text-amber-300">Unassigned queue</Badge>
        </div>
      ) : null}

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
            placeholder="Search ID, name, email, phone, address, notes…"
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
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-sm">
                <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="p-4">Customer ID / Full name</th>
                    <th className="p-4">Country</th>
                    <th className="p-4">Primary contact / Email</th>
                    <th className="p-4">Account owner</th>
                    <th className="p-4">Portal</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((item) => {
                    const portal = portalByCustomer[item.id];
                    return (
                      <tr key={item.id} className="border-t">
                        <td className="p-4">
                          <div className="flex min-w-0 items-center gap-3">
                            {avatarUrls[item.id] ? (
                              <Image
                                src={avatarUrls[item.id]}
                                alt=""
                                width={40}
                                height={40}
                                className="h-10 w-10 rounded-full object-cover"
                              />
                            ) : (
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary font-semibold">
                                {item.full_name.charAt(0)}
                              </div>
                            )}
                            <div className="min-w-0">
                              <Link
                                href={`/admin/customers/${item.id}`}
                                className="font-semibold text-primary hover:underline"
                              >
                                {item.customer_code}
                              </Link>
                              <p className="truncate">
                                <Link
                                  href={`/admin/customers/${item.id}`}
                                  className="text-foreground hover:underline"
                                >
                                  {item.full_name}
                                </Link>
                              </p>
                              {item.company_name ? (
                                <p className="truncate text-xs text-muted-foreground">{item.company_name}</p>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="p-4 uppercase text-muted-foreground">{item.country || '—'}</td>
                        <td className="p-4">
                          <p className="truncate">{item.phone || '—'}</p>
                          <p className="truncate text-xs text-muted-foreground">{item.email || portal?.email || '—'}</p>
                        </td>
                        <td className="p-4">
                          {(() => {
                            const owner = assignees.find((person) => person.id === item.owner_id);
                            if (canAssign) {
                              return (
                                <label className="block min-w-[12rem]">
                                  <span className="sr-only">Account owner for {item.full_name}</span>
                                  <select
                                    value={owner?.id || ''}
                                    disabled={assigningId === item.id}
                                    onChange={(event) => void assignCustomer(item.id, event.target.value)}
                                    className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm font-medium outline-none transition focus:ring-2 focus:ring-ring disabled:opacity-60"
                                  >
                                    <option value="">Unassigned</option>
                                    {assignees.map((person) => (
                                      <option key={person.id} value={person.id}>
                                        {person.full_name} · {person.role}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              );
                            }
                            return owner ? (
                              <div className="flex items-center gap-2">
                                <UserRoundCheck className="h-4 w-4 text-accent" />
                                <div>
                                  <p className="font-medium">{owner.full_name}</p>
                                  <p className="text-xs capitalize text-muted-foreground">{owner.role}</p>
                                </div>
                              </div>
                            ) : (
                              <Badge variant="outline" className="border-amber-500/30 text-amber-700 dark:text-amber-300">Unassigned</Badge>
                            );
                          })()}
                        </td>
                        <td className="p-4">
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
                        </td>
                        <td className="p-4">
                          <div className="flex justify-end">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="gap-1">
                                  Actions
                                  <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuItem asChild>
                                  <Link href={`/admin/customers/${item.id}`}>View Customer</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                  <Link href={`/admin/customers/${item.id}#soa`}>
                                    <WalletCards className="h-3.5 w-3.5" />
                                    Statement of Account
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                  <Link href={`/admin/customers/${item.id}#profile`}>Edit Profile</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                  <Link href={`/admin/customers/${item.id}#company`}>Edit Company Info</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                  <Link href={`/admin/customers/${item.id}#contact`}>Edit Contact Info</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                  <Link href={`/admin/customers/${item.id}#details`}>Edit Customer Details</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                  <Link href={`/admin/customers/${item.id}#consignee`}>
                                    Add/Edit Consignee Details
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onSelect={() => openEdit(item)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                  Quick edit
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                  <Link href={`/admin/customers/${item.id}#portal`}>
                                    <KeyRound className="h-3.5 w-3.5" />
                                    {portal ? 'Portal' : 'Enable portal'}
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onSelect={() => void remove(item.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
                : 'Create a CRM profile. Customer ID is assigned automatically on save.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={(event) => void save(event)} className="space-y-5">
            <div className="flex flex-wrap items-center gap-4">
              {avatarPreview ? (
                <Image
                  src={avatarPreview}
                  alt="Customer"
                  width={64}
                  height={64}
                  unoptimized
                  className="h-16 w-16 rounded-full object-cover"
                />
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

            <div className="space-y-1.5">
              <Label htmlFor="customer_id_preview">Customer ID</Label>
              <Input
                id="customer_id_preview"
                value={editingId ? editingCode || '' : ''}
                placeholder="Assigned on save"
                readOnly
                disabled
                className="bg-secondary/40"
              />
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

