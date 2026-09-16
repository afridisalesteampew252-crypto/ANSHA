'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Search, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import type { Customer } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const emptyForm = { customer_code: '', full_name: '', company_name: '', email: '', phone: '', whatsapp: '', country: '', address: '', notes: '' };

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.from('customers').select('*').order('created_at', { ascending: false });
    setCustomers((data || []) as Customer[]);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage('');
    if (!form.customer_code.trim() || !form.full_name.trim()) return setMessage('Customer code and name are required.');
    const payload = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim() || null]));
    const { error } = await supabase.from('customers').insert(payload);
    if (error) return setMessage(error.message);
    setForm(emptyForm);
    setMessage('Customer added.');
    await load();
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this customer?')) return;
    await supabase.from('customers').delete().eq('id', id);
    await load();
  };

  const visible = customers.filter((item) => `${item.customer_code} ${item.full_name} ${item.company_name || ''} ${item.phone || ''}`.toLowerCase().includes(query.toLowerCase()));

  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold">Customers</h1><p className="text-sm text-muted-foreground">Add and manage customer contact records.</p></div>
    <Card><CardHeader><CardTitle className="text-lg">Add customer</CardTitle></CardHeader><CardContent>
      <form onSubmit={save} className="grid gap-4 md:grid-cols-3">
        {Object.keys(emptyForm).map((key) => <div key={key} className="space-y-1.5"><Label htmlFor={key}>{key.replaceAll('_', ' ')}</Label><Input id={key} value={form[key as keyof typeof form]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></div>)}
        <div className="md:col-span-3 flex items-center gap-3"><Button type="submit"><Plus className="h-4 w-4" />Add customer</Button>{message && <p className="text-sm text-muted-foreground">{message}</p>}</div>
      </form>
    </CardContent></Card>
    <div className="relative max-w-md"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search customers" className="pl-9"/></div>
    <Card><CardContent className="p-0"><div className="divide-y">{visible.map((item)=><div key={item.id} className="flex items-center justify-between gap-4 p-4"><div><p className="font-medium">{item.full_name} <span className="text-xs text-muted-foreground">{item.customer_code}</span></p><p className="text-sm text-muted-foreground">{[item.company_name,item.phone,item.country].filter(Boolean).join(' · ')}</p></div><Button variant="ghost" size="icon" onClick={()=>remove(item.id)} aria-label="Delete customer"><Trash2 className="h-4 w-4"/></Button></div>)}{visible.length===0&&<p className="p-8 text-center text-sm text-muted-foreground">No customers found.</p>}</div></CardContent></Card>
  </div>;
}
