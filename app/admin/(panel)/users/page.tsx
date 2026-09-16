'use client';

import { useCallback, useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import type { AdminProfile } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function UsersPage() {
  const [users, setUsers] = useState<AdminProfile[]>([]);
  const [form, setForm] = useState({ email: '', password: '', full_name: '', role: 'staff' });
  const [message, setMessage] = useState('');
  const load = useCallback(async()=>{ const {data}=await supabase.from('admin_profiles').select('*').order('created_at',{ascending:false}); setUsers((data||[]) as AdminProfile[]); },[]);
  useEffect(()=>{void load();},[load]);
  const create = async(event:React.FormEvent)=>{
    event.preventDefault(); setMessage('Creating user…');
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/admin-create-user`, { method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${session?.access_token}`}, body:JSON.stringify(form) });
    const result = await response.json();
    if(!response.ok){setMessage(result.error||'Unable to create user.');return;}
    setForm({email:'',password:'',full_name:'',role:'staff'}); setMessage('User created.'); await load();
  };
  return <div className="space-y-6"><div><h1 className="text-2xl font-bold">Admin users</h1><p className="text-sm text-muted-foreground">Create approved staff accounts with Supabase passwords.</p></div>
    <Card><CardHeader><CardTitle className="text-lg">Add user</CardTitle></CardHeader><CardContent><form onSubmit={create} className="grid gap-4 md:grid-cols-2">
      <div className="space-y-1.5"><Label>Email</Label><Input type="email" required value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></div>
      <div className="space-y-1.5"><Label>Temporary password</Label><Input type="password" minLength={8} required value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></div>
      <div className="space-y-1.5"><Label>Full name</Label><Input required value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})}/></div>
      <div className="space-y-1.5"><Label>Role</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><option value="staff">Staff</option><option value="admin">Admin</option></select></div>
      <div className="md:col-span-2 flex items-center gap-3"><Button><UserPlus className="h-4 w-4"/>Create user</Button><p className="text-sm text-muted-foreground">{message}</p></div>
    </form></CardContent></Card>
    <Card><CardContent className="divide-y p-0">{users.map(user=><div key={user.id} className="flex items-center justify-between p-4"><div><p className="font-medium">{user.full_name||'Unnamed user'}</p><p className="text-xs text-muted-foreground">{user.id}</p></div><span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium capitalize">{user.role}</span></div>)}</CardContent></Card>
  </div>;
}
