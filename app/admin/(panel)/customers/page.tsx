'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { BarChart3, Pencil, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import type { Customer } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const emptyForm = { customer_code: '', full_name: '', company_name: '', email: '', phone: '', whatsapp: '', country: '', address: '', notes: '', avatar_url: '' };
type CustomerForm = typeof emptyForm;

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const load = useCallback(async () => { const { data } = await supabase.from('customers').select('*').order('created_at', { ascending: false }); const records=(data || []) as Customer[]; setCustomers(records); const withAvatars=records.filter((item)=>item.avatar_url); if(withAvatars.length){const {data:signed}=await supabase.storage.from('profile-images').createSignedUrls(withAvatars.map((item)=>item.avatar_url!),3600);setAvatarUrls(Object.fromEntries(withAvatars.map((item,index)=>[item.id,signed?.[index]?.signedUrl||''])));}else setAvatarUrls({}); }, []);
  useEffect(() => { void load(); }, [load]);
  const reset = () => { setForm(emptyForm); setEditingId(null); setAvatarFile(null); setMessage(''); };
  const uploadAvatar = async (file: File, ownerId: string) => { const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'; const path = `customers/${ownerId}-${Date.now()}.${extension}`; const { error } = await supabase.storage.from('profile-images').upload(path, file, { upsert: true }); if (error) throw error; return path; };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setMessage('Saving…');
    if (!form.customer_code.trim() || !form.full_name.trim()) return setMessage('Customer code and name are required.');
    try {
      const wasEditing = Boolean(editingId); const ownerId = editingId || crypto.randomUUID();
      const avatarUrl = avatarFile ? await uploadAvatar(avatarFile, ownerId) : form.avatar_url || null;
      const payload = { ...Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim() || null])), avatar_url: avatarUrl };
      const operation = editingId ? supabase.from('customers').update(payload).eq('id', editingId) : supabase.from('customers').insert({ id: ownerId, ...payload });
      const { error } = await operation; if (error) throw error;
      reset(); setMessage(wasEditing ? 'Customer updated.' : 'Customer added.'); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to save customer.'); }
  };
  const edit = (customer: Customer) => { setEditingId(customer.id); setAvatarFile(null); setForm({ customer_code: customer.customer_code, full_name: customer.full_name, company_name: customer.company_name || '', email: customer.email || '', phone: customer.phone || '', whatsapp: customer.whatsapp || '', country: customer.country || '', address: customer.address || '', notes: customer.notes || '', avatar_url: customer.avatar_url || '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const remove = async (id: string) => { if (!window.confirm('Delete this customer permanently?')) return; const { error } = await supabase.from('customers').delete().eq('id', id); if (error) return setMessage(error.message); if (editingId === id) reset(); await load(); };
  const visible = customers.filter((item) => `${item.customer_code} ${item.full_name} ${item.company_name || ''} ${item.phone || ''}`.toLowerCase().includes(query.toLowerCase()));

  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold">Customers</h1><p className="text-sm text-muted-foreground">Create, edit, and manage customer profiles.</p></div>
    <Card><CardHeader><CardTitle className="text-lg">{editingId ? 'Edit customer' : 'Add customer'}</CardTitle></CardHeader><CardContent><form onSubmit={save} className="grid gap-4 md:grid-cols-3">
      <div className="md:col-span-3 flex items-center gap-4">{editingId && avatarUrls[editingId] && <Image src={avatarUrls[editingId]} alt="Customer" width={64} height={64} className="h-16 w-16 rounded-full object-cover" />}<Label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm"><Upload className="h-4 w-4" />{avatarFile?.name || 'Choose profile picture'}<Input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e)=>setAvatarFile(e.target.files?.[0] || null)} /></Label></div>
      {Object.keys(emptyForm).filter((key)=>key !== 'avatar_url').map((key) => <div key={key} className="space-y-1.5"><Label htmlFor={key}>{key.replaceAll('_', ' ')}</Label><Input id={key} value={form[key as keyof CustomerForm]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></div>)}
      <div className="md:col-span-3 flex items-center gap-3"><Button type="submit">{editingId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{editingId ? 'Save changes' : 'Add customer'}</Button>{editingId && <Button type="button" variant="outline" onClick={reset}><X className="h-4 w-4" />Cancel</Button>} {message && <p className="text-sm text-muted-foreground">{message}</p>}</div>
    </form></CardContent></Card>
    <div className="relative max-w-md"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search customers" className="pl-9"/></div>
    <Card><CardContent className="p-0"><div className="divide-y">{visible.map((item)=><div key={item.id} className="flex items-center justify-between gap-4 p-4"><div className="flex min-w-0 items-center gap-3">{avatarUrls[item.id] ? <Image src={avatarUrls[item.id]} alt="" width={44} height={44} className="h-11 w-11 rounded-full object-cover" /> : <div className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary font-semibold">{item.full_name.charAt(0)}</div>}<div><p className="font-medium">{item.full_name} <span className="text-xs text-muted-foreground">{item.customer_code}</span></p><p className="text-sm text-muted-foreground">{[item.company_name,item.phone,item.country].filter(Boolean).join(' · ')}</p></div></div><div className="flex gap-1"><Button asChild variant="ghost" size="icon" aria-label={`Open ${item.full_name} statement of account`}><Link href={`/admin/customers/${item.id}`}><BarChart3 className="h-4 w-4" /></Link></Button><Button variant="ghost" size="icon" onClick={()=>edit(item)} aria-label="Edit customer"><Pencil className="h-4 w-4"/></Button><Button variant="ghost" size="icon" onClick={()=>remove(item.id)} aria-label="Delete customer"><Trash2 className="h-4 w-4"/></Button></div></div>)}{visible.length===0&&<p className="p-8 text-center text-sm text-muted-foreground">No customers found.</p>}</div></CardContent></Card>
  </div>;
}
