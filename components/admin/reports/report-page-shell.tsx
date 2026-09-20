'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ReportDefinition, ReportFilterKey } from '@/lib/reports/catalog';
import { STOCK_ORIGINS } from '@/lib/stock';
import type { RemittanceOffice } from '@/lib/types';

export type ReportFilterState = {
  from: string;
  to: string;
  officeId: string;
  customerQ: string;
  stockOrigin: string;
  status: string;
  documentType: string;
};

type ReportPageShellProps = {
  report: ReportDefinition;
  filters: ReportFilterState;
  onFiltersChange: (next: Partial<ReportFilterState>) => void;
  offices?: RemittanceOffice[];
  busy: boolean;
  onRun: () => void;
  onDownload: () => void;
  canDownload: boolean;
  rowCount: number;
  children: ReactNode;
};

function hasFilter(report: ReportDefinition, key: ReportFilterKey) {
  return report.filters.includes(key);
}

export function ReportPageShell({
  report,
  filters,
  onFiltersChange,
  offices = [],
  busy,
  onRun,
  onDownload,
  canDownload,
  rowCount,
  children,
}: ReportPageShellProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <Button asChild variant="ghost" className="-ml-3 mb-1">
            <Link href="/admin/reports">
              <ArrowLeft className="h-4 w-4" />
              All reports
            </Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">{report.title}</h1>
          <p className="text-sm text-muted-foreground">{report.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={onRun}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Run
          </Button>
          <Button disabled={busy || !canDownload} onClick={onDownload}>
            <Download className="h-4 w-4" />
            Download Excel
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>{report.caveat}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          {hasFilter(report, 'dateRange') && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="report-from">From</Label>
                <Input
                  id="report-from"
                  type="date"
                  value={filters.from}
                  onChange={(e) => onFiltersChange({ from: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="report-to">To</Label>
                <Input
                  id="report-to"
                  type="date"
                  value={filters.to}
                  onChange={(e) => onFiltersChange({ to: e.target.value })}
                />
              </div>
            </>
          )}

          {hasFilter(report, 'office') && (
            <div className="space-y-1.5">
              <Label htmlFor="report-office">Office</Label>
              <select
                id="report-office"
                className="h-10 min-w-[10rem] rounded-md border bg-background px-3 text-sm"
                value={filters.officeId}
                onChange={(e) => onFiltersChange({ officeId: e.target.value })}
              >
                <option value="">All offices</option>
                <option value="__none__">Unassigned</option>
                {offices.map((office) => (
                  <option key={office.id} value={office.id}>
                    {office.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {hasFilter(report, 'customer') && (
            <div className="space-y-1.5">
              <Label htmlFor="report-customer">Customer</Label>
              <Input
                id="report-customer"
                placeholder="Name or code"
                value={filters.customerQ}
                onChange={(e) => onFiltersChange({ customerQ: e.target.value })}
                className="min-w-[12rem]"
              />
            </div>
          )}

          {hasFilter(report, 'stockOrigin') && (
            <div className="space-y-1.5">
              <Label htmlFor="report-origin">Stock origin</Label>
              <select
                id="report-origin"
                className="h-10 min-w-[10rem] rounded-md border bg-background px-3 text-sm"
                value={filters.stockOrigin}
                onChange={(e) => onFiltersChange({ stockOrigin: e.target.value })}
              >
                <option value="">All origins</option>
                {STOCK_ORIGINS.map((origin) => (
                  <option key={origin.value} value={origin.value}>
                    {origin.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {hasFilter(report, 'status') && (
            <div className="space-y-1.5">
              <Label htmlFor="report-status">Status</Label>
              <select
                id="report-status"
                className="h-10 min-w-[10rem] rounded-md border bg-background px-3 text-sm"
                value={filters.status}
                onChange={(e) => onFiltersChange({ status: e.target.value })}
              >
                <option value="">All statuses</option>
                <option value="confirmed">Confirmed</option>
                <option value="pending">Pending</option>
                <option value="unknown">Unknown</option>
                <option value="rejected">Rejected</option>
                <option value="reversed">Reversed</option>
              </select>
            </div>
          )}

          {hasFilter(report, 'documentType') && (
            <div className="space-y-1.5">
              <Label htmlFor="report-doc-type">Document type</Label>
              <select
                id="report-doc-type"
                className="h-10 min-w-[10rem] rounded-md border bg-background px-3 text-sm"
                value={filters.documentType}
                onChange={(e) => onFiltersChange({ documentType: e.target.value })}
              >
                <option value="">Tax + commercial</option>
                <option value="tax_invoice">Tax invoice</option>
                <option value="commercial_invoice">Commercial invoice</option>
              </select>
            </div>
          )}

          <Button disabled={busy} onClick={onRun}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Apply
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Results</CardTitle>
          <CardDescription>
            {rowCount === 0 ? 'Run the report to load rows.' : `${rowCount} row${rowCount === 1 ? '' : 's'}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">{children}</CardContent>
      </Card>
    </div>
  );
}

export function ReportEmptyRow({ colSpan, message }: { colSpan: number; message?: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="p-4 text-muted-foreground">
        {message || 'No rows for this filter set.'}
      </td>
    </tr>
  );
}
