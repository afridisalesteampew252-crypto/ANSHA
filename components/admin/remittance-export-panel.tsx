'use client';

import { ChevronDown, Download, Eraser, FileSpreadsheet, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect, type SearchableSelectOption } from '@/components/admin/searchable-select';
import {
  REMITTANCE_EXPORT_COLUMNS,
  type RemittanceExportColumnKey,
} from '@/lib/remittance-export';

export type RemittanceExportFormat = 'xlsx' | 'csv';

export type RemittanceListFilters = {
  receivedFrom: string;
  receivedTo: string;
  remitFrom: string;
  remitTo: string;
  createdFrom: string;
  createdTo: string;
  customerId: string;
  currency: string;
  officeId: string;
  agentId: string;
  status: string;
  customerCountry: string;
  minAmount: string;
  maxAmount: string;
  sort: string;
};

export const emptyRemittanceListFilters = (): RemittanceListFilters => ({
  receivedFrom: '',
  receivedTo: '',
  remitFrom: '',
  remitTo: '',
  createdFrom: '',
  createdTo: '',
  customerId: '',
  currency: '',
  officeId: '',
  agentId: '',
  status: '',
  customerCountry: '',
  minAmount: '',
  maxAmount: '',
  sort: 'received_desc',
});

type Props = {
  draft: RemittanceListFilters;
  onDraftChange: (next: RemittanceListFilters) => void;
  onSearch: () => void;
  onClear: () => void;
  onExport: (format: RemittanceExportFormat) => void;
  exporting: boolean;
  columnSelection: Record<RemittanceExportColumnKey, boolean>;
  onColumnToggle: (key: RemittanceExportColumnKey, checked: boolean) => void;
  onSelectAllColumns: () => void;
  onUnselectAllColumns: () => void;
  customerOptions: SearchableSelectOption[];
  currencyOptions: string[];
  officeOptions: SearchableSelectOption[];
  agentOptions: SearchableSelectOption[];
  countryOptions: string[];
  matchCount: number;
};

function ExportRecordsMenu({
  exporting,
  onExport,
}: {
  exporting: boolean;
  onExport: (format: RemittanceExportFormat) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" disabled={exporting} className="gap-1">
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Export Records
          <ChevronDown className="h-3.5 w-3.5 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuItem disabled={exporting} onSelect={() => onExport('xlsx')}>
          <FileSpreadsheet className="h-3.5 w-3.5" />
          Export Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem disabled={exporting} onSelect={() => onExport('csv')}>
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function RemittanceExportPanel({
  draft,
  onDraftChange,
  onSearch,
  onClear,
  onExport,
  exporting,
  columnSelection,
  onColumnToggle,
  onSelectAllColumns,
  onUnselectAllColumns,
  customerOptions,
  currencyOptions,
  officeOptions,
  agentOptions,
  countryOptions,
  matchCount,
}: Props) {
  const set = <K extends keyof RemittanceListFilters>(key: K, value: RemittanceListFilters[K]) =>
    onDraftChange({ ...draft, [key]: value });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Remittance — List filters &amp; export</CardTitle>
        <p className="text-sm text-muted-foreground">
          Filter the list, choose columns, then export as Excel or CSV ({matchCount} matching
          record{matchCount === 1 ? '' : 's'}).
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="space-y-1.5">
            <Label>Received date from</Label>
            <Input
              type="date"
              value={draft.receivedFrom}
              onChange={(e) => set('receivedFrom', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Received date to</Label>
            <Input
              type="date"
              value={draft.receivedTo}
              onChange={(e) => set('receivedTo', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Remit date from</Label>
            <Input
              type="date"
              value={draft.remitFrom}
              onChange={(e) => set('remitFrom', e.target.value)}
              title="No remit_date column yet — filter unused until that field exists"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Remit date to</Label>
            <Input
              type="date"
              value={draft.remitTo}
              onChange={(e) => set('remitTo', e.target.value)}
              title="No remit_date column yet — filter unused until that field exists"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Created date from</Label>
            <Input
              type="date"
              value={draft.createdFrom}
              onChange={(e) => set('createdFrom', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Created date to</Label>
            <Input
              type="date"
              value={draft.createdTo}
              onChange={(e) => set('createdTo', e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="space-y-1.5">
            <Label>Customer</Label>
            <SearchableSelect
              value={draft.customerId}
              onValueChange={(v) => set('customerId', v)}
              options={customerOptions}
              placeholder="All customers"
              searchPlaceholder="Search customer…"
              clearLabel="All customers"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Currency</Label>
            <select
              value={draft.currency}
              onChange={(e) => set('currency', e.target.value)}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="">All</option>
              {currencyOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Office</Label>
            <SearchableSelect
              value={draft.officeId}
              onValueChange={(v) => set('officeId', v)}
              options={officeOptions}
              placeholder="All offices"
              searchPlaceholder="Search office…"
              clearLabel="All offices"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Agent</Label>
            <SearchableSelect
              value={draft.agentId}
              onValueChange={(v) => set('agentId', v)}
              options={agentOptions}
              placeholder="All agents"
              searchPlaceholder="Search agent…"
              clearLabel="All agents"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <select
              value={draft.status}
              onChange={(e) => set('status', e.target.value)}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="">All</option>
              <option value="confirmed">Confirmed</option>
              <option value="pending">Pending</option>
              <option value="unknown">Unconfirmed</option>
              <option value="rejected">Rejected</option>
              <option value="reversed">Reversed</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Customer country</Label>
            <select
              value={draft.customerCountry}
              onChange={(e) => set('customerCountry', e.target.value)}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="">All</option>
              {countryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Min TT amount</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={draft.minAmount}
              onChange={(e) => set('minAmount', e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Max TT amount</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={draft.maxAmount}
              onChange={(e) => set('maxAmount', e.target.value)}
              placeholder="—"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Sort</Label>
            <select
              value={draft.sort}
              onChange={(e) => set('sort', e.target.value)}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="received_desc">Received date (newest)</option>
              <option value="received_asc">Received date (oldest)</option>
              <option value="created_desc">Created date (newest)</option>
              <option value="created_asc">Created date (oldest)</option>
              <option value="amount_desc">Amount (high → low)</option>
              <option value="amount_asc">Amount (low → high)</option>
              <option value="number_asc">Remittance ID (A → Z)</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={onSearch}>
            <Search className="h-4 w-4" />
            Search
          </Button>
          <Button type="button" variant="secondary" onClick={onClear}>
            <Eraser className="h-4 w-4" />
            Clear
          </Button>
          <ExportRecordsMenu exporting={exporting} onExport={onExport} />
        </div>

        <div className="space-y-3 border-t pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Export columns
          </p>
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {REMITTANCE_EXPORT_COLUMNS.map((col) => (
              <label
                key={col.key}
                className="flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-sm hover:bg-secondary/40"
              >
                <Checkbox
                  checked={columnSelection[col.key]}
                  onCheckedChange={(state) => onColumnToggle(col.key, state === true)}
                />
                <span className="leading-tight">{col.label}</span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <ExportRecordsMenu exporting={exporting} onExport={onExport} />
            <Button type="button" variant="outline" onClick={onSelectAllColumns}>
              Select All
            </Button>
            <Button type="button" variant="outline" onClick={onUnselectAllColumns}>
              Unselect All
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
