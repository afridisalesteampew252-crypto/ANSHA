# All currencies financial dashboard

Open **Reports → Financial statements** (`/admin/reports/financial`). The
default **All currencies dashboard** tab shows every configured currency and
historical ledger currency directly.

Choose **From date** and **To date**, then **Refresh dashboard**. Each currency
has its own revenue, expenses and net profit, plus an expense-account pie and
visible account amounts. Date edits hide the previous figures until refreshed.

The pie shows positive net expense-account balances. Negative account balances
are listed as expense credits and are included in expense/profit totals. Amounts
remain in their recorded currency, with no combined currency total or FX
conversion. An empty pie means no positive expense balances for that period.

The figures use the same ledger source and existing active admin/staff access as
financial statements. The other tabs retain Profit & loss, Balance sheet and
Trial balance, including their currency-specific Excel exports.

Forward migration `20261007203500_gl_reports_include_reversed_entries.sql`
corrects original/reversal reporting in all six GL statement functions. Apply it
before considering the reversal totals activated in production. It changes
report selection only; signatures, permissions and financial records stay
intact. Its actual-reversal regression failed before the fix and all ten SQL
behavior suites passed afterward in the disposable database.
