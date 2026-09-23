-- SOA date-range filter + PDF/Excel export (app layer)
-- ---------------------------------------------------------------------------
-- No schema change required. Customer SOA continues to use:
--   - Admin: direct selects on invoices / remittances (RLS)
--   - Portal: public.get_my_customer_soa() (unchanged; date filter is client-side)
--
-- Role matrix (enforced in UI; RLS still owns data access):
--   admin, manager  → SOA PDF + Excel
--   sales, freelancer → SOA PDF only (own-book customers via existing RLS)
--   portal customer → SOA PDF only (own account via get_my_customer_soa)
--
-- Excel formatting: lib/soa/export.ts (ExcelJS typed numbers, frozen header, auto-filter)
-- PDF formatting: printable landscape A4 table (browser Save as PDF)

SELECT 1;
