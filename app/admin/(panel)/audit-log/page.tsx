'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { History, Loader2, Search } from 'lucide-react';
import { matchesQuery } from '@/lib/matches-query';
import { supabase } from '@/lib/supabase/client';
import type { AuditLog } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type ActorOption = { id: string; full_name: string | null; email: string | null };

type AuditRow = AuditLog & {
  actor?: ActorOption | null;
};

const ENTITY_OPTIONS = [
  { value: 'all', label: 'All entity types' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'part', label: 'Part' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'remittance_allocation', label: 'Remittance allocation' },
] as const;

function metaPreview(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata || Object.keys(metadata).length === 0) return '—';
  try {
    const text = JSON.stringify(metadata);
    return text.length > 120 ? `${text.slice(0, 117)}…` : text;
  } catch {
    return '—';
  }
}

export default function AuditLogPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [actors, setActors] = useState<ActorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [entityType, setEntityType] = useState('all');
  const [actorId, setActorId] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setMessage('');
    const [logRes, actorRes] = await Promise.all([
      supabase
        .from('audit_logs')
        .select('id,actor_id,action,entity_type,entity_id,metadata,created_at')
        .order('created_at', { ascending: false })
        .limit(400),
      supabase
        .from('admin_profiles')
        .select('id,full_name,email')
        .eq('is_active', true)
        .order('full_name'),
    ]);
    setLoading(false);
    if (logRes.error) {
      setMessage(logRes.error.message);
      return;
    }
    if (actorRes.error) {
      setMessage(actorRes.error.message);
      return;
    }
    const profileMap = new Map((actorRes.data || []).map((p) => [p.id, p as ActorOption]));
    setActors((actorRes.data || []) as ActorOption[]);
    setRows(
      ((logRes.data || []) as AuditLog[]).map((row) => ({
        ...row,
        actor: row.actor_id ? profileMap.get(row.actor_id) || null : null,
      }))
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (entityType !== 'all' && row.entity_type !== entityType) return false;
      if (actorId !== 'all' && row.actor_id !== actorId) return false;
      if (dateFrom) {
        const fromMs = new Date(`${dateFrom}T00:00:00`).getTime();
        if (new Date(row.created_at).getTime() < fromMs) return false;
      }
      if (dateTo) {
        const toMs = new Date(`${dateTo}T23:59:59.999`).getTime();
        if (new Date(row.created_at).getTime() > toMs) return false;
      }
      const actorLabel = row.actor?.full_name || row.actor?.email || row.actor_id || '';
      return matchesQuery(query, [
        row.action,
        row.entity_type,
        row.entity_id,
        actorLabel,
        metaPreview(row.metadata),
      ]);
    });
  }, [actorId, dateFrom, dateTo, entityType, query, rows]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Account-admin only. Catalog create/update/delete and stock status, invoice status, and remittance allocations.
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search action, entity, actor, metadata…"
                className="pl-10"
              />
            </div>
            <select
              value={entityType}
              onChange={(event) => setEntityType(event.target.value)}
              className="h-10 rounded-md border bg-background px-3 text-sm"
            >
              {ENTITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={actorId}
              onChange={(event) => setActorId(event.target.value)}
              className="h-10 min-w-[10rem] rounded-md border bg-background px-3 text-sm"
            >
              <option value="all">All actors</option>
              {actors.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.full_name || actor.email || actor.id.slice(0, 8)}
                </option>
              ))}
            </select>
            <Input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              aria-label="From date"
              className="h-10 w-auto"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              aria-label="To date"
              className="h-10 w-auto"
            />
          </div>
        </CardContent>
      </Card>

      {message && (
        <div role="status" className="rounded-lg border bg-secondary/30 p-3 text-sm">
          {message}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <History className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-semibold">No audit events</p>
              <p className="text-sm text-muted-foreground">
                Change filters, or wait for invoice / stock / remittance activity.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 md:hidden">
            {filtered.map((row) => (
              <Card key={row.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{row.action.replaceAll('_', ' ')}</p>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        {row.entity_type.replaceAll('_', ' ')}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(row.created_at), 'dd MMM yyyy HH:mm')}
                    </p>
                  </div>
                  <p className="text-sm">
                    {row.actor?.full_name || row.actor?.email || row.actor_id || 'System'}
                  </p>
                  <p className="break-all font-mono text-xs text-muted-foreground">
                    {row.entity_id || '—'}
                  </p>
                  <p className="break-all font-mono text-[11px] text-muted-foreground">
                    {metaPreview(row.metadata)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="p-4">When</th>
                    <th className="p-4">Actor</th>
                    <th className="p-4">Action</th>
                    <th className="p-4">Entity</th>
                    <th className="p-4">Entity id</th>
                    <th className="p-4">Metadata</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.id} className="border-t hover:bg-secondary/20">
                      <td className="whitespace-nowrap p-4 text-muted-foreground">
                        {format(new Date(row.created_at), 'dd MMM yyyy HH:mm')}
                      </td>
                      <td className="p-4">
                        <p className="font-medium">
                          {row.actor?.full_name || row.actor?.email || 'System'}
                        </p>
                        {row.actor?.full_name && row.actor?.email && (
                          <p className="text-xs text-muted-foreground">{row.actor.email}</p>
                        )}
                      </td>
                      <td className="p-4 capitalize">{row.action.replaceAll('_', ' ')}</td>
                      <td className="p-4 capitalize">{row.entity_type.replaceAll('_', ' ')}</td>
                      <td className="p-4 font-mono text-xs">{row.entity_id || '—'}</td>
                      <td className="max-w-xs break-all p-4 font-mono text-[11px] text-muted-foreground">
                        {metaPreview(row.metadata)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
