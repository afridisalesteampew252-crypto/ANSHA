'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { OperationalReportView } from '@/components/admin/reports/operational-report-view';
import { getReportBySlug, type ReportSlug } from '@/lib/reports/catalog';
import { Button } from '@/components/ui/button';

const OPERATIONAL_SLUGS = new Set<ReportSlug>([
  'customer-balance-payments',
  'customer-sales-value-stats',
  'customer-registrations',
  'office-sales-stats',
  'purchase-statistics',
  'resource-sales-stats',
  'resource-sales-value-stats',
]);

export default function ReportSlugPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug || '';
  const report = getReportBySlug(slug);

  if (!report || !OPERATIONAL_SLUGS.has(report.slug)) {
    return (
      <div className="space-y-3 rounded-lg border bg-card p-6">
        <p className="text-sm text-muted-foreground">That report was not found.</p>
        <Button asChild variant="outline">
          <Link href="/admin/reports">Back to reports</Link>
        </Button>
      </div>
    );
  }

  return <OperationalReportView report={report} />;
}
