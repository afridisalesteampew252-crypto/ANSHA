import { tool } from 'ai';
import { z } from 'zod';
import { buildPeerStats, median, peerKey, priceSanityWarning } from '@/lib/price-sanity';
import {
  type AssistantToolContext,
  clip,
  loadStaff,
  partLabel,
  staffName,
  toIlikePattern,
  todayIsoDate,
  vehicleLabel,
} from './shared';

const limitSchema = z.number().int().min(1).max(25).optional().describe('Max rows (default 10, max 25).');

const VEHICLE_COLUMNS =
  'id, title, slug, make, model, variant, year, stock_number, chassis_number, stock_status, stock_pool, lifecycle_stage, is_published, show_price, currency, price, price_fob, price_cf, price_cif, updated_at';
const PART_COLUMNS =
  'id, name, slug, part_code, brand, part_number, oem_number, stock_status, quantity, is_published, show_price, currency, price, price_fob, price_cf, price_cif, updated_at';

/** Statuses of customer documents that can still be owed. */
const OPEN_INVOICE_STATUSES = ['sent', 'partially_paid', 'overdue'];
const RECEIVABLE_DOCUMENT_TYPES = ['tax_invoice', 'commercial_invoice', 'proforma_invoice'];
const OPEN_REQUEST_STATUSES = ['open', 'in_progress', 'waiting'];

function listingPrice(row: { price_fob?: number | null; price?: number | null }): number | null {
  const fob = Number(row.price_fob);
  if (Number.isFinite(fob) && fob > 0) return fob;
  const list = Number(row.price);
  return Number.isFinite(list) && list > 0 ? list : null;
}

function sumByCurrency(rows: { currency: string | null; amount: number }[]) {
  const totals: Record<string, { total: number; count: number }> = {};
  for (const row of rows) {
    const code = (row.currency || 'UNKNOWN').toUpperCase();
    totals[code] ??= { total: 0, count: 0 };
    totals[code].total = Math.round((totals[code].total + row.amount) * 100) / 100;
    totals[code].count += 1;
  }
  return totals;
}

function daysBetween(fromIsoDate: string, toIsoDate: string): number {
  return Math.floor((Date.parse(toIsoDate) - Date.parse(fromIsoDate)) / 86_400_000);
}

export function createReadTools(ctx: AssistantToolContext) {
  const { supabase } = ctx;

  return {
    searchVehicles: tool({
      description:
        'Search vehicle inventory (cars, trucks, machinery) by free text (title, make, model, stock number, chassis) and filters. Read-only.',
      inputSchema: z.object({
        query: z.string().max(80).optional().describe('Free text, e.g. "hilux 2018" or a stock/chassis number.'),
        make: z.string().max(60).optional(),
        model: z.string().max(60).optional(),
        year: z.number().int().min(1950).max(2100).optional(),
        stockStatus: z.enum(['available', 'reserved', 'sold']).optional(),
        published: z.boolean().optional(),
        limit: limitSchema,
      }),
      execute: async ({ query, make, model, year, stockStatus, published, limit }) => {
        let q = supabase.from('vehicles').select(VEHICLE_COLUMNS, { count: 'exact' });
        const pattern = toIlikePattern(query);
        if (pattern) {
          q = q.or(
            ['title', 'make', 'model', 'variant', 'stock_number', 'chassis_number']
              .map((c) => `${c}.ilike.${pattern}`)
              .join(',')
          );
        }
        const makePattern = toIlikePattern(make);
        const modelPattern = toIlikePattern(model);
        if (makePattern) q = q.ilike('make', makePattern);
        if (modelPattern) q = q.ilike('model', modelPattern);
        if (year) q = q.eq('year', year);
        if (stockStatus) q = q.eq('stock_status', stockStatus);
        if (typeof published === 'boolean') q = q.eq('is_published', published);
        const { data, count, error } = await q.order('updated_at', { ascending: false }).limit(limit ?? 10);
        if (error) throw new Error(error.message);
        return {
          totalMatches: count ?? data?.length ?? 0,
          vehicles: (data ?? []).map((v) => ({
            ...v,
            label: vehicleLabel(v),
            adminUrl: `/admin/vehicles/${v.id}`,
            publicUrl: v.is_published && v.stock_status === 'available' ? `/vehicles/${v.slug}` : null,
          })),
        };
      },
    }),

    searchParts: tool({
      description: 'Search spare-parts inventory by name, part code, brand, part number or OEM number. Read-only.',
      inputSchema: z.object({
        query: z.string().max(80).optional(),
        brand: z.string().max(60).optional(),
        stockStatus: z.enum(['available', 'reserved', 'sold']).optional(),
        published: z.boolean().optional(),
        limit: limitSchema,
      }),
      execute: async ({ query, brand, stockStatus, published, limit }) => {
        let q = supabase.from('parts').select(PART_COLUMNS, { count: 'exact' });
        const pattern = toIlikePattern(query);
        if (pattern) {
          q = q.or(
            ['name', 'part_code', 'brand', 'part_number', 'oem_number'].map((c) => `${c}.ilike.${pattern}`).join(',')
          );
        }
        const brandPattern = toIlikePattern(brand);
        if (brandPattern) q = q.ilike('brand', brandPattern);
        if (stockStatus) q = q.eq('stock_status', stockStatus);
        if (typeof published === 'boolean') q = q.eq('is_published', published);
        const { data, count, error } = await q.order('updated_at', { ascending: false }).limit(limit ?? 10);
        if (error) throw new Error(error.message);
        return {
          totalMatches: count ?? data?.length ?? 0,
          parts: (data ?? []).map((p) => ({
            ...p,
            label: partLabel(p),
            adminUrl: `/admin/parts/${p.id}`,
            publicUrl: p.is_published && p.stock_status === 'available' ? `/parts/${p.slug}` : null,
          })),
        };
      },
    }),

    searchCustomers: tool({
      description: 'Search CRM customers by name, company, customer code, email, phone or country. Read-only.',
      inputSchema: z.object({
        query: z.string().max(80).describe('Name, company, customer code, email, phone or country.'),
        limit: limitSchema,
      }),
      execute: async ({ query, limit }) => {
        const pattern = toIlikePattern(query);
        if (!pattern) return { totalMatches: 0, customers: [] };
        const { data, count, error } = await supabase
          .from('customers')
          .select('id, customer_code, full_name, company_name, email, phone, whatsapp, country, is_active, owner_id', {
            count: 'exact',
          })
          .or(
            ['full_name', 'company_name', 'customer_code', 'email', 'phone', 'whatsapp', 'country']
              .map((c) => `${c}.ilike.${pattern}`)
              .join(',')
          )
          .order('full_name')
          .limit(limit ?? 10);
        if (error) throw new Error(error.message);
        return {
          totalMatches: count ?? data?.length ?? 0,
          customers: (data ?? []).map((c) => ({ ...c, adminUrl: `/admin/customers/${c.id}` })),
        };
      },
    }),

    searchInquiries: tool({
      description:
        'List or search public website inquiries (status new | read | responded | closed) by customer name, email or message text. Read-only.',
      inputSchema: z.object({
        query: z.string().max(80).optional(),
        status: z.enum(['new', 'read', 'responded', 'closed']).optional(),
        limit: limitSchema,
      }),
      execute: async ({ query, status, limit }) => {
        let q = supabase
          .from('inquiries')
          .select('id, status, customer_name, customer_email, customer_phone, message, vehicle_id, part_id, created_at', {
            count: 'exact',
          });
        const pattern = toIlikePattern(query);
        if (pattern) {
          q = q.or(['customer_name', 'customer_email', 'customer_phone', 'message'].map((c) => `${c}.ilike.${pattern}`).join(','));
        }
        if (status) q = q.eq('status', status);
        const { data, count, error } = await q.order('created_at', { ascending: false }).limit(limit ?? 10);
        if (error) throw new Error(error.message);
        return {
          totalMatches: count ?? data?.length ?? 0,
          inquiries: (data ?? []).map((i) => ({ ...i, message: clip(i.message, 300), adminUrl: '/admin/inquiries' })),
        };
      },
    }),

    searchPartRequests: tool({
      description:
        'List or search public part-sourcing requests (status new | reviewed | fulfilled | closed) by customer, part name/number or vehicle. Read-only.',
      inputSchema: z.object({
        query: z.string().max(80).optional(),
        status: z.enum(['new', 'reviewed', 'fulfilled', 'closed']).optional(),
        limit: limitSchema,
      }),
      execute: async ({ query, status, limit }) => {
        let q = supabase
          .from('part_requests')
          .select('id, status, customer_name, email, phone, vehicle_make, vehicle_model, vehicle_year, part_name, part_number, message, created_at', {
            count: 'exact',
          });
        const pattern = toIlikePattern(query);
        if (pattern) {
          q = q.or(
            ['customer_name', 'email', 'part_name', 'part_number', 'vehicle_make', 'vehicle_model']
              .map((c) => `${c}.ilike.${pattern}`)
              .join(',')
          );
        }
        if (status) q = q.eq('status', status);
        const { data, count, error } = await q.order('created_at', { ascending: false }).limit(limit ?? 10);
        if (error) throw new Error(error.message);
        return {
          totalMatches: count ?? data?.length ?? 0,
          partRequests: (data ?? []).map((r) => ({ ...r, message: clip(r.message, 300), adminUrl: '/admin/inquiries' })),
        };
      },
    }),

    searchWorkspaceRequests: tool({
      description:
        'List or search internal workspace requests (tasks: inquiry, part_request, bl, inspection, shipping, other) with assignee and due date. Read-only.',
      inputSchema: z.object({
        query: z.string().max(80).optional().describe('Text in the title or notes.'),
        status: z.enum(['open', 'in_progress', 'waiting', 'done', 'cancelled', 'active']).optional().describe('"active" = open, in_progress or waiting.'),
        requestType: z.enum(['inquiry', 'part_request', 'bl', 'inspection', 'shipping', 'other']).optional(),
        assignee: z.string().max(60).optional().describe('"me", "unassigned", or a staff user id.'),
        overdueOnly: z.boolean().optional(),
        limit: limitSchema,
      }),
      execute: async ({ query, status, requestType, assignee, overdueOnly, limit }) => {
        let q = supabase
          .from('workspace_requests')
          .select('id, request_type, status, title, notes, assigned_to, due_at, vehicle_id, customer_id, inquiry_id, part_request_id, created_by, created_at, updated_at', {
            count: 'exact',
          });
        const pattern = toIlikePattern(query);
        if (pattern) q = q.or(`title.ilike.${pattern},notes.ilike.${pattern}`);
        if (status === 'active') q = q.in('status', OPEN_REQUEST_STATUSES);
        else if (status) q = q.eq('status', status);
        if (requestType) q = q.eq('request_type', requestType);
        if (assignee === 'me') q = q.eq('assigned_to', ctx.admin.userId);
        else if (assignee === 'unassigned') q = q.is('assigned_to', null);
        else if (assignee && /^[0-9a-f-]{36}$/i.test(assignee)) q = q.eq('assigned_to', assignee);
        if (overdueOnly) q = q.lt('due_at', new Date().toISOString()).in('status', OPEN_REQUEST_STATUSES);
        const [{ data, count, error }, staff] = await Promise.all([
          q.order('due_at', { ascending: true, nullsFirst: false }).limit(limit ?? 10),
          loadStaff(supabase),
        ]);
        if (error) throw new Error(error.message);
        return {
          totalMatches: count ?? data?.length ?? 0,
          requests: (data ?? []).map((r) => ({
            ...r,
            notes: clip(r.notes, 300),
            assignee: staffName(staff, r.assigned_to),
            createdBy: staffName(staff, r.created_by),
            adminUrl: `/admin/requests/${r.id}`,
          })),
        };
      },
    }),

    listStaff: tool({
      description: 'List staff members (id, name, email, role, active) — use to find who to assign a request to. Read-only.',
      inputSchema: z.object({
        query: z.string().max(60).optional().describe('Filter by name or email.'),
        includeInactive: z.boolean().optional(),
      }),
      execute: async ({ query, includeInactive }) => {
        const staff = await loadStaff(supabase);
        const needle = (query ?? '').trim().toLowerCase();
        return {
          staff: staff
            .filter((s) => includeInactive || s.is_active)
            .filter((s) => !needle || `${s.full_name ?? ''} ${s.email ?? ''}`.toLowerCase().includes(needle))
            .slice(0, 50),
        };
      },
    }),

    searchInvoices: tool({
      description:
        'Search customer documents (tax/commercial/proforma invoices, quotations, delivery notes) by number, customer or reference. Amounts are per document currency. Read-only.',
      inputSchema: z.object({
        query: z.string().max(80).optional(),
        status: z.enum(['draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled']).optional(),
        documentType: z
          .enum(['tax_invoice', 'commercial_invoice', 'proforma_invoice', 'quotation', 'delivery_note', 'purchase_invoice'])
          .optional(),
        customerId: z.string().uuid().optional(),
        overdueOnly: z.boolean().optional().describe('Past due date with a balance still owed.'),
        limit: limitSchema,
      }),
      execute: async ({ query, status, documentType, customerId, overdueOnly, limit }) => {
        let q = supabase
          .from('invoices')
          .select('id, invoice_number, document_type, status, customer_id, customer_name, customer_company, issue_date, due_date, currency, total_amount, amount_paid, balance_due, reference', {
            count: 'exact',
          });
        const pattern = toIlikePattern(query);
        if (pattern) {
          q = q.or(['invoice_number', 'customer_name', 'customer_company', 'reference'].map((c) => `${c}.ilike.${pattern}`).join(','));
        }
        if (status) q = q.eq('status', status);
        if (documentType) q = q.eq('document_type', documentType);
        if (customerId) q = q.eq('customer_id', customerId);
        if (overdueOnly) {
          q = q.lt('due_date', todayIsoDate()).gt('balance_due', 0).in('status', OPEN_INVOICE_STATUSES);
        }
        const { data, count, error } = await q.order('issue_date', { ascending: false }).limit(limit ?? 10);
        if (error) throw new Error(error.message);
        return {
          totalMatches: count ?? data?.length ?? 0,
          note: 'Never add amounts across different currencies.',
          invoices: (data ?? []).map((i) => ({ ...i, adminUrl: `/admin/invoices/${i.id}` })),
        };
      },
    }),

    summarizeDues: tool({
      description:
        'Summarize what is owed: open customer invoice balances per currency with ageing buckets and top overdue customers, plus overdue / due-soon workspace requests. Read-only.',
      inputSchema: z.object({
        scope: z.enum(['invoices', 'requests', 'both']).optional().describe('Default both.'),
      }),
      execute: async ({ scope = 'both' }) => {
        const result: Record<string, unknown> = {};
        const today = todayIsoDate();

        if (scope !== 'requests') {
          const { data, error } = await supabase
            .from('invoices')
            .select('id, invoice_number, document_type, status, customer_id, customer_name, due_date, currency, balance_due')
            .in('status', OPEN_INVOICE_STATUSES)
            .in('document_type', RECEIVABLE_DOCUMENT_TYPES)
            .gt('balance_due', 0)
            .limit(2000);
          if (error) throw new Error(error.message);
          const rows = data ?? [];
          const buckets: Record<string, Record<string, number>> = {};
          const byCustomer = new Map<string, { customer: string; currency: string; overdue: number; documents: number }>();
          for (const row of rows) {
            const currency = (row.currency || 'UNKNOWN').toUpperCase();
            const amount = Number(row.balance_due) || 0;
            const age = row.due_date ? daysBetween(row.due_date, today) : -1;
            const bucket = age <= 0 ? 'not_yet_due' : age <= 30 ? '1_30_days' : age <= 60 ? '31_60_days' : age <= 90 ? '61_90_days' : 'over_90_days';
            buckets[currency] ??= {};
            buckets[currency][bucket] = Math.round(((buckets[currency][bucket] ?? 0) + amount) * 100) / 100;
            if (age > 0) {
              const key = `${row.customer_id ?? row.customer_name}|${currency}`;
              const entry = byCustomer.get(key) ?? { customer: row.customer_name || 'Unknown', currency, overdue: 0, documents: 0 };
              entry.overdue = Math.round((entry.overdue + amount) * 100) / 100;
              entry.documents += 1;
              byCustomer.set(key, entry);
            }
          }
          result.invoices = {
            openDocuments: rows.length,
            truncated: rows.length >= 2000,
            outstandingByCurrency: sumByCurrency(rows.map((r) => ({ currency: r.currency, amount: Number(r.balance_due) || 0 }))),
            ageingByCurrency: buckets,
            topOverdueCustomers: Array.from(byCustomer.values()).sort((a, b) => b.overdue - a.overdue).slice(0, 10),
            note: 'Totals are per currency; do not convert or add across currencies. Proforma balances are advance requests, not booked revenue.',
          };
        }

        if (scope !== 'invoices') {
          const nowIso = new Date().toISOString();
          const soonIso = new Date(Date.now() + 24 * 3_600_000).toISOString();
          const [{ data, error }, staff] = await Promise.all([
            supabase
              .from('workspace_requests')
              .select('id, request_type, status, title, assigned_to, due_at')
              .in('status', OPEN_REQUEST_STATUSES)
              .not('due_at', 'is', null)
              .lte('due_at', soonIso)
              .order('due_at')
              .limit(100),
            loadStaff(supabase),
          ]);
          if (error) throw new Error(error.message);
          const rows = (data ?? []).map((r) => ({
            ...r,
            assignee: staffName(staff, r.assigned_to),
            adminUrl: `/admin/requests/${r.id}`,
          }));
          result.requests = {
            overdue: rows.filter((r) => r.due_at && r.due_at < nowIso),
            dueWithin24h: rows.filter((r) => r.due_at && r.due_at >= nowIso),
          };
        }
        return result;
      },
    }),

    todaysWorkQueue: tool({
      description:
        "Today's work queue: new inquiries, new part requests, workspace requests that are overdue / due today / assigned to me, and overdue invoices. Read-only.",
      inputSchema: z.object({}),
      execute: async () => {
        const nowIso = new Date().toISOString();
        const soonIso = new Date(Date.now() + 24 * 3_600_000).toISOString();
        const [inquiries, partRequests, requests, overdueInvoices, staff] = await Promise.all([
          supabase
            .from('inquiries')
            .select('id, customer_name, customer_email, message, vehicle_id, part_id, created_at', { count: 'exact' })
            .eq('status', 'new')
            .order('created_at', { ascending: false })
            .limit(5),
          supabase
            .from('part_requests')
            .select('id, customer_name, part_name, vehicle_make, vehicle_model, created_at', { count: 'exact' })
            .eq('status', 'new')
            .order('created_at', { ascending: false })
            .limit(5),
          supabase
            .from('workspace_requests')
            .select('id, request_type, status, title, assigned_to, due_at')
            .in('status', OPEN_REQUEST_STATUSES)
            .order('due_at', { ascending: true, nullsFirst: false })
            .limit(200),
          supabase
            .from('invoices')
            .select('id, invoice_number, customer_name, due_date, currency, balance_due', { count: 'exact' })
            .in('status', OPEN_INVOICE_STATUSES)
            .gt('balance_due', 0)
            .lt('due_date', todayIsoDate())
            .order('due_date')
            .limit(10),
          loadStaff(supabase),
        ]);
        for (const r of [inquiries, partRequests, requests, overdueInvoices]) {
          if (r.error) throw new Error(r.error.message);
        }
        const active = (requests.data ?? []).map((r) => ({
          ...r,
          assignee: staffName(staff, r.assigned_to),
          adminUrl: `/admin/requests/${r.id}`,
        }));
        return {
          generatedAt: nowIso,
          newInquiries: {
            count: inquiries.count ?? 0,
            latest: (inquiries.data ?? []).map((i) => ({ ...i, message: clip(i.message, 160) })),
          },
          newPartRequests: { count: partRequests.count ?? 0, latest: partRequests.data ?? [] },
          workspaceRequests: {
            activeCount: active.length,
            overdue: active.filter((r) => r.due_at && r.due_at < nowIso).slice(0, 10),
            dueWithin24h: active.filter((r) => r.due_at && r.due_at >= nowIso && r.due_at <= soonIso).slice(0, 10),
            assignedToMe: active.filter((r) => r.assigned_to === ctx.admin.userId).slice(0, 10),
            unassigned: active.filter((r) => !r.assigned_to).length,
          },
          overdueInvoices: {
            count: overdueInvoices.count ?? 0,
            oldest: (overdueInvoices.data ?? []).map((i) => ({ ...i, adminUrl: `/admin/invoices/${i.id}` })),
            note: 'Per currency; do not add across currencies.',
          },
        };
      },
    }),

    checkPriceOutliers: tool({
      description:
        'Price sanity check for vehicles against the median listing price (FOB, else list price) of the same make + model + year + currency (needs 3+ priced peers; flags < 0.5x or > 2x median, and USD prices under 1,000 or over 200,000). Give vehicleId (optionally proposedPrice) to check one vehicle, or omit it to scan inventory. Read-only.',
      inputSchema: z.object({
        vehicleId: z.string().uuid().optional(),
        proposedPrice: z.number().positive().max(100_000_000).optional().describe('Check this amount instead of the current price.'),
        make: z.string().max(60).optional(),
        model: z.string().max(60).optional(),
        includeSold: z.boolean().optional().describe('Include sold vehicles as peers (default false).'),
        limit: limitSchema,
      }),
      execute: async ({ vehicleId, proposedPrice, make, model, includeSold, limit }) => {
        const pick = (r: { make: string | null; model: string | null; year: number | null; currency: string | null; price: number | null; price_fob: number | null }) => ({
          make: r.make,
          model: r.model,
          year: r.year,
          currency: r.currency,
          price: listingPrice(r),
        });

        if (vehicleId) {
          const { data: target, error } = await supabase.from('vehicles').select(VEHICLE_COLUMNS).eq('id', vehicleId).maybeSingle();
          if (error) throw new Error(error.message);
          if (!target) return { error: 'Vehicle not found.' };
          let peersQuery = supabase
            .from('vehicles')
            .select('id, make, model, year, currency, price, price_fob, stock_status')
            .ilike('make', target.make ?? '')
            .ilike('model', target.model ?? '')
            .neq('id', target.id)
            .limit(500);
          peersQuery = target.year == null ? peersQuery.is('year', null) : peersQuery.eq('year', target.year);
          if (!includeSold) peersQuery = peersQuery.neq('stock_status', 'sold');
          const { data: peers, error: peerError } = await peersQuery;
          if (peerError) throw new Error(peerError.message);
          const key = peerKey(target.make, target.model, target.year, target.currency);
          const prices = (peers ?? [])
            .filter((p) => peerKey(p.make, p.model, p.year, p.currency) === key)
            .map((p) => listingPrice(p))
            .filter((p): p is number => p != null);
          const peerMedian = median(prices);
          const checked = proposedPrice ?? listingPrice(target);
          const warning = priceSanityWarning({
            price: checked,
            currency: target.currency,
            peers: peerMedian != null ? { median: peerMedian, count: prices.length } : null,
            peerLabel: `other ${target.year ?? ''} ${target.make} ${target.model}`.replace(/\s+/g, ' '),
          });
          return {
            vehicle: { id: target.id, label: vehicleLabel(target), currency: target.currency, adminUrl: `/admin/vehicles/${target.id}` },
            checkedPrice: checked,
            peerCount: prices.length,
            peerMedian,
            ratioToMedian: peerMedian && checked ? Math.round((checked / peerMedian) * 100) / 100 : null,
            warning,
            verdict: warning ? 'check' : prices.length < 3 ? 'not_enough_peers' : 'ok',
          };
        }

        let q = supabase
          .from('vehicles')
          .select('id, title, make, model, year, stock_number, currency, price, price_fob, stock_status, is_published')
          .limit(5000);
        if (!includeSold) q = q.neq('stock_status', 'sold');
        const makePattern = toIlikePattern(make);
        const modelPattern = toIlikePattern(model);
        if (makePattern) q = q.ilike('make', makePattern);
        if (modelPattern) q = q.ilike('model', modelPattern);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        const rows = data ?? [];
        const stats = buildPeerStats(rows, pick);
        const flagged = rows
          .map((r) => {
            const price = listingPrice(r);
            const peers = stats.get(peerKey(r.make, r.model, r.year, r.currency));
            if (!price || !peers || peers.count < 3) return null;
            const ratio = price / peers.median;
            if (ratio >= 0.5 && ratio <= 2) return null;
            return {
              id: r.id,
              label: vehicleLabel(r),
              currency: r.currency,
              price,
              peerMedian: peers.median,
              peerCount: peers.count,
              ratioToMedian: Math.round(ratio * 100) / 100,
              isPublished: r.is_published,
              adminUrl: `/admin/vehicles/${r.id}`,
            };
          })
          .filter((r): r is NonNullable<typeof r> => r != null)
          .sort((a, b) => Math.abs(Math.log(b.ratioToMedian)) - Math.abs(Math.log(a.ratioToMedian)));
        return {
          scanned: rows.length,
          flaggedCount: flagged.length,
          flagged: flagged.slice(0, limit ?? 15),
          note: 'Peers include the vehicle itself in the scan median. Flags are hints, not errors — confirm before changing prices.',
        };
      },
    }),
  };
}
