# Expense Excel report

In the admin sidebar, open **Finance → Expenses** (`/admin/expenses`).

1. In **Expense report**, choose the date range, currency, category and status.
   Blank dates include every date; **All currencies**, **All categories** and
   **All statuses** include every matching value. For bookkeeping, choose
   **Posted** to exclude draft and cancelled expenses.
2. Use **Search expenses** to match an expense number, payee, category, status,
   payment method, currency, date, bank reference, notes or receipt filename.
3. Click **Export Excel**. The `.xlsx` file contains all matching expenses,
   including records older than the recent list shown on the page.

The **Expenses** sheet contains expense number, date, status, category, payee,
amount, currency, payment method, bank account, bank reference, notes, attachment
filenames and posting time. Amounts are numeric Excel cells. The header stays
visible while scrolling, and each column has an Excel filter.

Each row keeps its recorded currency. Filter the report or the spreadsheet by
currency before adding amounts; no currency conversion or combined total is
created. Inactive categories and bank accounts retain their historical labels.
Attachment columns contain filenames, not downloaded receipts.

If no expenses match, the page reports that result without downloading an empty
file. If a read fails or the report changes during pagination, it reports the
problem and allows another attempt without downloading a partial report.

The export uses the signed-in user's existing finance access. Active admin,
staff and accounts roles retain their current permissions.
