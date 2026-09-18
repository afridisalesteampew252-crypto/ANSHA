'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Search, Inbox, Mail, Phone, Package, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/lib/supabase/client';
import { inquiryStatusLabels } from '@/lib/site-config';
import type { Inquiry, InquiryStatus } from '@/lib/types';

const statusColors: Record<string, string> = {
  new: 'bg-blue-50 text-blue-700 border-blue-200',
  read: 'bg-stone-50 text-stone-700 border-stone-200',
  responded: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  closed: 'bg-muted text-muted-foreground border-border',
};

export default function AdminInquiriesPage() {
  const [inquiries, setInquiries] = useState<(Inquiry & { parts?: { name: string; part_code: string } | null })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedInquiry, setSelectedInquiry] = useState<(Inquiry & { parts?: { name: string; part_code: string } | null }) | null>(null);
  const [ticketByInquiry, setTicketByInquiry] = useState<Record<string, string>>({});

  const fetchInquiries = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('inquiries')
      .select('*, parts(name, part_code)')
      .order('created_at', { ascending: false });

    if (statusFilter !== 'all') {
      q = q.eq('status', statusFilter);
    }

    if (search.trim()) {
      q = q.or(`customer_name.ilike.%${search.trim()}%,customer_email.ilike.%${search.trim()}%,message.ilike.%${search.trim()}%`);
    }

    const { data } = await q;
    setInquiries((data || []) as unknown as (Inquiry & { parts?: { name: string; part_code: string } | null })[]);
    const { data: tickets } = await supabase.from('workspace_requests').select('id, inquiry_id').not('inquiry_id', 'is', null);
    const map: Record<string, string> = {};
    for (const ticket of tickets || []) {
      if (ticket.inquiry_id) map[ticket.inquiry_id as string] = ticket.id as string;
    }
    setTicketByInquiry(map);
    setLoading(false);
  }, [search, statusFilter]);

  useEffect(() => {
    const timeout = setTimeout(() => fetchInquiries(), 300);
    return () => clearTimeout(timeout);
  }, [search, statusFilter, fetchInquiries]);

  const updateStatus = async (inqId: string, status: InquiryStatus) => {
    const { error } = await supabase.from('inquiries').update({ status }).eq('id', inqId);
    if (error) {
      return;
    }
    setInquiries((prev) => prev.map((i) => i.id === inqId ? { ...i, status } : i));
    if (selectedInquiry?.id === inqId) {
      setSelectedInquiry((prev) => prev ? { ...prev, status } : null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Inquiries</h1>
        <p className="text-sm text-muted-foreground">Customer messages. Assignment, due dates, and part-sourcing tickets live under Requests.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by name, email, or message..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="read">Read</SelectItem>
            <SelectItem value="responded">Responded</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Inquiries list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : inquiries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <Inbox className="h-12 w-12 text-muted-foreground/30" />
            <h3 className="mt-4 text-lg font-semibold">No inquiries found</h3>
            <p className="mt-1 text-muted-foreground">Customer inquiries will appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {inquiries.map((inq) => (
            <Card key={inq.id} className="hover:shadow-sm transition-shadow cursor-pointer" onClick={() => {
              setSelectedInquiry(inq);
              if (inq.status === 'new') updateStatus(inq.id, 'read');
            }}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-sm">{inq.customer_name}</h3>
                      <Badge variant="outline" className={statusColors[inq.status] || ''}>
                        {inquiryStatusLabels[inq.status]}
                      </Badge>
                    </div>
                    {inq.parts && (
                      <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                        <Package className="h-3 w-3" />
                        {inq.parts.name} ({inq.parts.part_code})
                      </p>
                    )}
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{inq.message}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      {inq.customer_email && (
                        <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{inq.customer_email}</span>
                      )}
                      {inq.customer_phone && (
                        <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{inq.customer_phone}</span>
                      )}
                      <span>{new Date(inq.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Detail dialog */}
      {selectedInquiry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSelectedInquiry(null)}>
          <Card className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Inquiry Details</h2>
                <Button variant="ghost" size="icon" onClick={() => setSelectedInquiry(null)}>
                  <Loader2 className="h-4 w-4 opacity-0" />
                  <span className="sr-only">Close</span>
                </Button>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground">Customer</p>
                  <p className="font-medium">{selectedInquiry.customer_name}</p>
                </div>
                {selectedInquiry.customer_email && (
                  <div><p className="text-xs text-muted-foreground">Email</p><p className="text-sm">{selectedInquiry.customer_email}</p></div>
                )}
                {selectedInquiry.customer_phone && (
                  <div><p className="text-xs text-muted-foreground">Phone</p><p className="text-sm">{selectedInquiry.customer_phone}</p></div>
                )}
                {selectedInquiry.parts && (
                  <div>
                    <p className="text-xs text-muted-foreground">Part</p>
                    <p className="text-sm">{selectedInquiry.parts.name} ({selectedInquiry.parts.part_code})</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground">Message</p>
                  <p className="text-sm whitespace-pre-line rounded-md bg-secondary/50 p-3">{selectedInquiry.message}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Date</p>
                  <p className="text-sm">{new Date(selectedInquiry.created_at).toLocaleString()}</p>
                </div>
                {ticketByInquiry[selectedInquiry.id] ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/admin/requests/${ticketByInquiry[selectedInquiry.id]}`}>Open request ticket</Link>
                  </Button>
                ) : null}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Status:</span>
                  <Select value={selectedInquiry.status} onValueChange={(v) => updateStatus(selectedInquiry.id, v as InquiryStatus)}>
                    <SelectTrigger className="w-[160px] h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="read">Read</SelectItem>
                      <SelectItem value="responded">Responded</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
