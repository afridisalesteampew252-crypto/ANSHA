# Customer SOA — date range + PDF/Excel export

## Status on this branch

| File | Status |
|------|--------|
| `lib/soa/export.ts` | **Merged on branch** |
| `supabase/migrations/20260923200000_soa_export_date_range_notes.sql` | **Merged on branch** |
| `app/portal/(panel)/account/page.tsx` | **Merged on branch** |
| `app/admin/(panel)/customers/[id]/page.tsx` | Apply from deliverable if not yet committed (large file) |

## Behaviour

- **From / To** date filters (To defaults to today)
- Ledger filtered client-side (no RPC change; `get_my_customer_soa()` unchanged)
- **PDF**: printable landscape A4 table (browser Save as PDF)
- **Excel**: ExcelJS with typed numbers, frozen header, auto-filter

## Roles

| Role | PDF | Excel |
|------|-----|-------|
| Admin / Manager | Yes | Yes |
| Sales / Freelancer | Yes | No |
| Portal customer | Yes | No |

## Safety

- No schema changes (migration is `SELECT 1` marker)
- Existing allocate / reverse / multi-currency KPIs preserved
