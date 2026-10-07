import type { SupabaseClient } from '@supabase/supabase-js';
import type { GlProfitAndLossRow } from '@/lib/types';

export type FinancialCurrencySummary = {
  currency: string;
  revenue: number;
  expenses: number;
  profit: number;
  expenseBreakdown: Array<{ name: string; value: number }>;
  /** Positive magnitude of expense account credits; excluded from the positive-only pie. */
  expenseCredits: number;
};

const PAGE_SIZE = 500;
const CURRENCY_CONCURRENCY = 3;

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

type PageResult<T> = { data: T[] | null; count: number | null; error: { message: string } | null };

async function readAllPages<T>(
  loadPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  rowId: (row: T) => string,
  label: string,
): Promise<T[]> {
  const rows: T[] = [];
  const ids = new Set<string>();
  let expectedCount: number | null = null;
  do {
    const result = await loadPage(rows.length, rows.length + PAGE_SIZE - 1);
    if (result.error) throw new Error(`Could not load ${label}: ${result.error.message}`);
    if (!Array.isArray(result.data) || result.count === null || !Number.isSafeInteger(result.count) || result.count < 0) {
      throw new Error(`Could not verify complete ${label} data. Please retry.`);
    }
    if (expectedCount !== null && expectedCount !== result.count) {
      throw new Error(`${label} changed while the dashboard was loading. Please retry.`);
    }
    expectedCount = result.count;
    if (result.data.length === 0 && rows.length < expectedCount) throw new Error(`The ${label} data is incomplete. Please retry.`);
    for (const row of result.data) {
      const id = rowId(row);
      if (!id || ids.has(id)) throw new Error(`${label} changed while the dashboard was loading. Please retry.`);
      ids.add(id);
      rows.push(row);
    }
    if (rows.length > expectedCount) throw new Error(`${label} changed while the dashboard was loading. Please retry.`);
  } while (rows.length < expectedCount);
  return rows;
}

function summaryForCurrency(currency: string, rows: GlProfitAndLossRow[]): FinancialCurrencySummary {
  let revenueCents = 0;
  let expenseCents = 0;
  let creditCents = 0;
  const expenseBreakdown: FinancialCurrencySummary['expenseBreakdown'] = [];
  for (const row of rows) {
    const rawAmount: unknown = row.amount;
    if ((typeof rawAmount !== 'number' && typeof rawAmount !== 'string') || String(rawAmount).trim() === '') {
      throw new Error(`The ${currency} financial statement contains an invalid amount. Please retry.`);
    }
    const amount = Number(rawAmount);
    // Existing P&L RPC returns numeric(14,2). Add cents to avoid decimal accumulation errors.
    const cents = Math.round(amount * 100);
    if (!Number.isFinite(amount) || !Number.isSafeInteger(cents)) {
      throw new Error(`The ${currency} financial statement contains an invalid amount. Please retry.`);
    }
    if (row.account_type === 'revenue') revenueCents += cents;
    else if (row.account_type === 'expense') {
      expenseCents += cents;
      if (cents > 0) expenseBreakdown.push({ name: `${row.account_code} — ${row.account_name}`, value: cents / 100 });
      else if (cents < 0) creditCents -= cents;
    } else throw new Error(`The ${currency} financial statement contains an unsupported account type. Please retry.`);
    if (![revenueCents, expenseCents, creditCents, revenueCents - expenseCents].every(Number.isSafeInteger)) {
      throw new Error(`The ${currency} financial totals exceed the supported precision. Narrow the reporting period.`);
    }
  }
  expenseBreakdown.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  return {
    currency,
    revenue: revenueCents / 100,
    expenses: expenseCents / 100,
    profit: (revenueCents - expenseCents) / 100,
    expenseBreakdown,
    expenseCredits: creditCents / 100,
  };
}

/** All currencies in posted journal history, including retained originals of reversals. */
export async function discoverFinancialCurrencies(client: SupabaseClient): Promise<string[]> {
  const journals = await readAllPages<{ id: string; currency: string }>((offset, end) => client.from('gl_journals')
    .select('id,currency', { count: 'exact' }).in('status', ['posted', 'reversed'])
    .order('id', { ascending: true }).range(offset, end).returns<Array<{ id: string; currency: string }>>(),
  (journal) => journal.id, 'posted journal currencies');
  const currencies = new Set<string>();
  for (const journal of journals) {
    // The existing currency RPC requires uppercase codes and matches stored values exactly.
    if (!/^[A-Z]{3}$/.test(journal.currency)) throw new Error('A posted journal has an invalid currency code. Correct it before loading the dashboard.');
    currencies.add(journal.currency);
  }
  return Array.from(currencies).sort();
}

/** Separate posted-GL summaries, using the caller's authenticated client and existing permissions. */
export async function fetchFinancialDashboard(
  client: SupabaseClient,
  configuredCurrencies: string[],
  from: string,
  to: string,
): Promise<FinancialCurrencySummary[]> {
  if (!validDate(from) || !validDate(to)) throw new Error('Enter valid financial dashboard From and To dates (YYYY-MM-DD).');
  if (from > to) throw new Error('The financial dashboard From date must be on or before the To date.');

  // Discovery includes old and disabled currencies, even when they have no activity in this period.
  const historicalCurrencies = await discoverFinancialCurrencies(client);
  const currencies = new Set([
    ...historicalCurrencies,
    ...configuredCurrencies.map((code) => code.trim().toUpperCase()).filter((code) => /^[A-Z]{3}$/.test(code)),
  ]);
  const codes = Array.from(currencies).sort();
  const results: FinancialCurrencySummary[] = new Array(codes.length);
  let nextIndex = 0;
  let failure: Error | null = null;

  await Promise.all(Array.from({ length: Math.min(CURRENCY_CONCURRENCY, codes.length) }, async () => {
    while (nextIndex < codes.length && failure === null) {
      const index = nextIndex++;
      const currency = codes[index];
      try {
        const rows = await readAllPages<GlProfitAndLossRow>(async (offset, end) => {
          if (failure) throw failure;
          const response = await client.rpc('gl_profit_and_loss_currency', {
            p_from: from, p_to: to, p_currency: currency,
          }, { count: 'exact' }).order('account_id', { ascending: true }).order('account_code', { ascending: true })
            .range(offset, end);
          // Untyped SDK RPCs can be declared as single objects; verify the actual table response here.
          const data: unknown = response.data;
          return {
            data: Array.isArray(data) ? data as GlProfitAndLossRow[] : null,
            count: response.count,
            error: response.error,
          };
        }, (row) => row.account_id, `${currency} profit and loss`);
        results[index] = summaryForCurrency(currency, rows);
      } catch (error) {
        failure ??= error instanceof Error ? error : new Error('Could not load the financial dashboard. Please retry.');
      }
    }
  }));
  if (failure) throw failure;
  return results;
}
