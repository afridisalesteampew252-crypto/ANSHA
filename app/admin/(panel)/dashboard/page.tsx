'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Package, Tag, Inbox, Plus, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/client';
import { inquiryStatusLabels } from '@/lib/site-config';

export default function AdminDashboardPage() {
  const [stats, setStats] = useState({ parts: 0, published: 0, categories: 0, inquiries: 0, newInquiries: 0 });
  const [recentInquiries, setRecentInquiries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [partsRes, pubRes, catRes, inqRes, newInqRes, recentInqRes] = await Promise.all([
        supabase.from('parts').select('id', { count: 'exact', head: true }),
        supabase.from('parts').select('id', { count: 'exact', head: true }).eq('is_published', true),
        supabase.from('categories').select('id', { count: 'exact', head: true }),
        supabase.from('inquiries').select('id', { count: 'exact', head: true }),
        supabase.from('inquiries').select('id', { count: 'exact', head: true }).eq('status', 'new'),
        supabase.from('inquiries').select('*').order('created_at', { ascending: false }).limit(5),
      ]);

      setStats({
        parts: partsRes.count || 0,
        published: pubRes.count || 0,
        categories: catRes.count || 0,
        inquiries: inqRes.count || 0,
        newInquiries: newInqRes.count || 0,
      });
      setRecentInquiries((recentInqRes.data || []) as any[]);
      setLoading(false);
    })();
  }, []);

  const statCards = [
    { label: 'Total Parts', value: stats.parts, sub: `${stats.published} published`, icon: Package, href: '/admin/parts' },
    { label: 'Categories', value: stats.categories, sub: 'Active categories', icon: Tag, href: '/admin/categories' },
    { label: 'Total Inquiries', value: stats.inquiries, sub: `${stats.newInquiries} new`, icon: Inbox, href: '/admin/inquiries' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Overview of your parts catalog</p>
        </div>
        <Link href="/admin/parts/new">
          <Button>
            <Plus className="h-4 w-4" />
            Add Part
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        {statCards.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <Card className="hover:shadow-sm transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className="text-3xl font-bold mt-1">{loading ? '—' : stat.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{stat.sub}</p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    <stat.icon className="h-6 w-6 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Recent inquiries */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Recent Inquiries</CardTitle>
              <CardDescription>Latest customer messages</CardDescription>
            </div>
            <Link href="/admin/inquiries">
              <Button variant="ghost" size="sm">
                View All
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>
          ) : recentInquiries.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No inquiries yet.</p>
          ) : (
            <div className="space-y-3">
              {recentInquiries.map((inq) => (
                <div key={inq.id} className="flex items-center justify-between border-b border-border/50 pb-3 last:border-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{inq.customer_name}</p>
                    <p className="text-sm text-muted-foreground truncate">{inq.message}</p>
                  </div>
                  <div className="ml-4 shrink-0 text-right">
                    <span className="text-xs text-muted-foreground">
                      {inquiryStatusLabels[inq.status] || inq.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
