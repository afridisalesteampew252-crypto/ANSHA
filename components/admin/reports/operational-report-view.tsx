'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  ReportEmptyRow,
  ReportPageShell,
  type ReportFilterState,
} from '@/components/admin/reports/report-page-shell';
import { canManageReceivables } from '@/lib/admin-rbac';
import type { ReportDefinition } from '@/lib/reports/catalog';
import { downloadRowsAsXlsx, type ExcelColumn } from '@/lib/export-excel';
import { defaultReportFrom, defaultReportTo } from '@/lib/reports/format';
import { supabase } from '@/lib/supabase/client';
import type { AdminRole, RemittanceOffice } from '@/lib/types';

import { readAllRows } from '@/lib/read-all-rows';
import { loadReportRows, type Row } from '@/lib/reports/operational-data';

export function OperationalReportView({ report }: { report: ReportDefinition }) {
  const [role, setRole] = useState<AdminRole | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [offices, setOffices] = useState<RemittanceOffice[]>([]);
  const [storedRows, setRows] = useState<Row[]>([]);
  const [storedColumns, setColumns] = useState<ExcelColumn[]>([]);
  const [filters, setFilters] = useState<ReportFilterState>({
    from: defaultReportFrom(),
    to: defaultReportTo(),
    officeId: '',
    customerQ: '',
    stockOrigin: '',
    status: '',
    documentType: '',
  });

  const [reportError, setReportError] = useState('');
  const [loadedScope, setLoadedScope] = useState('');
  const scope = JSON.stringify([report.slug, filters]);
  const rows = loadedScope === scope ? storedRows : [];
  const columns = loadedScope === scope ? storedColumns : [];
  const requestGeneration = useRef(0);
  useEffect(() => {
    requestGeneration.current += 1;
    setBusy(false);
    return () => { requestGeneration.current += 1; };
  }, [scope]);

  const finance = canManageReceivables(role);

  useEffect(() => {
    void (async () => {
      try {
        const {
          data: { session }, error: sessionError,
        } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!session) {
          setAuthChecked(true);
          return;
        }
        const { data: prof, error: profileError } = await supabase
          .from('admin_profiles')
          .select('role')
          .eq('id', session.user.id)
          .maybeSingle();
        if (profileError) throw profileError;
        setRole((prof?.role as AdminRole) || null);
      } catch { setReportError('Report access could not be checked. Reload the page to retry.'); }
      finally { setAuthChecked(true); }
    })();
  }, []);

  const loadOffices = useCallback(async () => {
    const data = await readAllRows<RemittanceOffice>((from, to) => supabase.from('remittance_offices').select('*', { count: 'exact' }).order('sort_order').order('name').order('id').range(from, to).returns<RemittanceOffice[]>(), 'Offices');
    setOffices(data);
  }, []);

  const run = useCallback(async () => {
    if (!finance) return;
    if (filters.to < filters.from) {
      toast.error('To date must be on or after from date');
      return;
    }
    const generation = ++requestGeneration.current;
    setBusy(true);
    setReportError('');
    setLoadedScope('');
    try {
      if (report.filters.includes('office') && offices.length === 0) {
        await loadOffices();
      }
      const result = await loadReportRows(report.slug, filters);
      if (generation !== requestGeneration.current) return;
      setLoadedScope(scope);
      setColumns(result.columns);
      setRows(result.rows);
      if (result.warning) toast.message(result.warning);
    } catch (err) {
      if (generation !== requestGeneration.current) return;
      const message = err instanceof Error ? err.message : 'Failed to load report';
      setReportError(message);
      toast.error(message);
      setRows([]);
      setColumns([]);
    } finally {
      if (generation === requestGeneration.current) setBusy(false);
    }
  }, [scope, finance, filters, loadOffices, offices.length, report.filters, report.slug]);

  useEffect(() => {
    if (!authChecked || !finance) return;
    void loadOffices().catch(() => setReportError('Office filters could not be loaded. Run the report to retry.'));
  }, [authChecked, finance, loadOffices]);

  const onDownload = useCallback(async () => {
    if (!rows.length || !columns.length) return;
    try {
      await downloadRowsAsXlsx({
        filename: report.slug,
        sheetName: report.shortTitle,
        columns,
        rows,
      });
      toast.success('Excel downloaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Excel export failed');
    }
  }, [columns, report.shortTitle, report.slug, rows]);

  const tableHeaders = useMemo(() => columns.map((c) => c.header), [columns]);

  if (!authChecked) {
    return <p className="text-sm text-muted-foreground">Checking access…</p>;
  }

  if (!finance) {
    return (
      <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        {reportError || 'Reports are available to accounts and operations roles only.'}
      </div>
    );
  }

  return (
    <ReportPageShell
      report={report}
      filters={filters}
      onFiltersChange={(next) => setFilters((prev) => ({ ...prev, ...next }))}
      offices={offices}
      busy={busy}
      onRun={() => void run()}
      onDownload={() => void onDownload()}
      canDownload={rows.length > 0}
      rowCount={rows.length}
    >
      {reportError ? <p role="alert" className="p-4 text-sm text-destructive">{reportError}</p> : null}
      <table className="w-full text-sm">
        <thead className="bg-secondary/50 text-left text-xs uppercase text-muted-foreground">
          <tr>
            {tableHeaders.length === 0 ? (
              <th className="p-3">Column</th>
            ) : (
              tableHeaders.map((header) => (
                <th key={header} className="p-3">
                  {header}
                </th>
              ))
            )}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <ReportEmptyRow colSpan={Math.max(tableHeaders.length, 1)} />
          ) : (
            rows.map((row, index) => (
              <tr key={String(row._key || index)} className="border-t">
                {columns.map((col) => (
                  <td key={col.key} className="p-3 whitespace-nowrap">
                    {formatCell(row[col.key])}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </ReportPageShell>
  );
}

function formatCell(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}
