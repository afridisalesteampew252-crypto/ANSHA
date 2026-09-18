# Banking Integrations

Honest readiness for bank feeds — **not** live Open Banking / PSD2 account aggregation.

ANSHA does **not** connect to customer or company bank accounts via OAuth, screen scraping, or a fake “Connect bank” flow. Full Open Banking requires a licensed Account Information Service Provider (AISP) or an equivalent regulated aggregator. Until a provider is contracted, ops use the Phase 34 ledger with **manual entry** and **CSV import**.

## What exists today

| Capability | Where | Notes |
|---|---|---|
| Bank account master + ledger | `/admin/bank-accounts` | `bank_accounts` / `bank_transactions` (BNK- / BTXN-) |
| Manual in/out | Same page | `create_bank_transaction` |
| Reconcile flags | Same page | `set_bank_transaction_reconciled` |
| CSV import | Same page → Import CSV | Calls `import_bank_transactions_stub` |
| Feed placeholders | Same page → Bank feeds (coming) | `bank_feed_connections` status `manual` \| `pending_provider` |
| Public remittance details | `/banking` | Static `lib/banking-details.ts` — not a feed |

Public `/banking` is customer-facing payment instructions only. It is unrelated to the ops ledger.

## CSV import format

Header row required:

```text
date,amount,description,reference
```

- `date` — `YYYY-MM-DD` or `DD/MM/YYYY`
- `amount` — non-zero number; **positive = in (credit)**, **negative = out (debit)**
- `description`, `reference` — optional
- Optional fifth column `direction` (`in`\|`out`) with a positive amount still works

Imported rows are unreconciled manual ledger lines. There is no automatic matching to invoices or remittances in this phase.

RPC: `import_bank_transactions_stub(p_bank_account_id uuid, p_rows jsonb) → integer`

## `bank_feed_connections`

Placeholder rows for future licensed providers:

- `status = manual` — ops intend CSV / manual posting for this account
- `status = pending_provider` — waiting on a contracted aggregator; **no live sync**

Columns: optional `bank_account_id`, `label`, nullable `provider`, `notes`. Ops RLS only. No secrets, tokens, or webhook endpoints are stored here.

## Future provider path (when licensed)

1. Contract a regulated aggregator (region-dependent: e.g. TrueLayer / Yapily / Plaid Open Banking where licensed, or a UAE/local banking API partner).
2. Store provider credentials in **server secrets / Edge Functions**, never in the browser or in `bank_feed_connections` plaintext.
3. Extend `bank_feed_connections` with provider account ids, consent expiry, and sync cursors — behind a real OAuth/consent flow owned by the provider.
4. Map inbound transactions into `bank_transactions` (or a staging table) with idempotent external ids; keep reconcile as a human step until matching rules are approved.
5. Do **not** build DIY bank login capture or “password vault” integrations.

Until then, keep using CSV + reconcile.

## Explicit non-goals

- Fake “Connect to bank” OAuth UI
- Scraping online banking portals
- Claiming PSD2 / Open Banking compliance without a licensed partner
- Auto-posting bank lines into GL without an approved Phase 38 mapping

## Related

- Phase 34 migration: `supabase/migrations/20260918230000_phase_34_bank_accounts.sql`
- Phase 50 stub: `supabase/migrations/20260918380000_phase_50_bank_feeds_stub.sql`
- Parser helper: `lib/bank-csv.ts`
- Roadmap Phase 34 / Phase 50 notes in `docs/Roadmap.md`
