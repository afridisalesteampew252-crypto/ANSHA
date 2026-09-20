'use client';

import Link from 'next/link';
import {
  Building2,
  FileBarChart,
  Package,
  ShoppingCart,
  UserPlus,
  Users,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ALL_REPORTS, type ReportSlug } from '@/lib/reports/catalog';

const REPORT_ICONS: Record<ReportSlug, LucideIcon> = {
  'customer-balance-payments': WalletCards,
  'customer-sales-value-stats': Users,
  'customer-registrations': UserPlus,
  'office-sales-stats': Building2,
  'purchase-statistics': ShoppingCart,
  'resource-sales-stats': Package,
  'resource-sales-value-stats': FileBarChart,
  financial: FileBarChart,
};

export default function ReportsHubPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Filterable operational reports with Excel download, plus GL financial statements.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {ALL_REPORTS.map((report) => {
          const Icon = REPORT_ICONS[report.slug];
          return (
            <Link key={report.slug} href={report.href} className="group block">
              <Card className="h-full transition-colors group-hover:border-accent/40 group-hover:bg-accent/[0.03]">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="h-4 w-4 text-accent" />
                    {report.title}
                  </CardTitle>
                  <CardDescription>{report.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">{report.caveat}</p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
