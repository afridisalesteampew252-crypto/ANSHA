import type { SupabaseClient } from '@supabase/supabase-js';
import { isFieldAgentRole } from '@/lib/admin-rbac';
import { fetchChatUnreadCounts } from '@/lib/chat-unread';
import { readAllRows } from '@/lib/read-all-rows';
import { normalizeOpsAnalyticsSummary } from '@/lib/dashboard-analytics';
import { listCurrencies } from '@/lib/money';

type Invoice = { id: string; issue_date: string; currency: string; document_type: string; total_amount: number; amount_paid: number; balance_due: number; status: string };
type Remittance = { id: string; received_date: string; currency: string; amount: number; status: string };
type InventoryRow = { id: string; stock_status: string | null; stock_origin: string | null };
type RecentInquiry = { id: string; customer_name: string; message: string; status: string };

async function exactCount(request: PromiseLike<{ count: number | null; error: { message: string } | null }>, label: string) {
  const { count, error } = await request;
  if (error || count === null || !Number.isSafeInteger(count) || count < 0) throw new Error(`${label} could not be counted. Please retry.`);
  return count;
}

/** Commit a complete snapshot to the UI only after every required read succeeds. */
export async function fetchDashboardData(client: SupabaseClient, from: string, to: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) throw new Error('Your session could not be verified. Please sign in again.');
  const { data: profile, error: profileError } = await client.from('admin_profiles').select('role,is_active')
    .eq('id', user.id).abortSignal(signal).maybeSingle();
  if (profileError || !profile || profile.is_active === false) throw new Error('Your dashboard access could not be verified. Please retry or sign in again.');
  const role = String(profile.role);
  const base = {
    role, counts: { parts: 0, vehicles: 0, customers: 0, inquiries: 0, unreadChats: 0, portalUsers: 0, pushSubscribers: 0, draftProformas: 0, reservations: 0 },
    invoices: [] as Invoice[], remittances: [] as Remittance[], inventory: [] as InventoryRow[], recentInquiries: [] as RecentInquiry[],
    analytics: null as ReturnType<typeof normalizeOpsAnalyticsSummary>, currencies: [] as string[], warning: '',
  };
  const [parts, vehicles, customers, unread] = await Promise.all([
    exactCount(client.from('parts').select('id', { count: 'exact', head: true }).abortSignal(signal), 'Parts'),
    exactCount(client.from('vehicles').select('id', { count: 'exact', head: true }).abortSignal(signal), 'Vehicles'),
    exactCount(client.from('customers').select('id', { count: 'exact', head: true }).abortSignal(signal), 'Customers'),
    fetchChatUnreadCounts(client, user.id, signal),
  ]);
  base.counts = { ...base.counts, parts, vehicles, customers, unreadChats: unread.total };
  if (isFieldAgentRole(role)) {
    const [draftProformas, reservations] = await Promise.all([
      exactCount(client.from('invoices').select('id', { count: 'exact', head: true }).eq('document_type', 'proforma_invoice').eq('status', 'draft').eq('created_by', user.id).abortSignal(signal), 'Draft proformas'),
      exactCount(client.from('vehicles').select('id', { count: 'exact', head: true }).eq('stock_status', 'reserved').abortSignal(signal), 'Reservations'),
    ]);
    return { ...base, counts: { ...base.counts, draftProformas, reservations } };
  }

  const stock = (table: 'parts' | 'vehicles') => readAllRows<InventoryRow>((offset, end) => client.from(table)
    .select('id,stock_status,stock_origin', { count: 'exact' }).order('id').range(offset, end).abortSignal(signal).returns<InventoryRow[]>(), table);
  const [inquiries, portalUsers, pushSubscribers, invoices, remittances, partStock, vehicleStock, recent, settings, analyticsResult] = await Promise.all([
    exactCount(client.from('inquiries').select('id', { count: 'exact', head: true }).eq('status', 'new').abortSignal(signal), 'New inquiries'),
    exactCount(client.from('customer_profiles').select('id', { count: 'exact', head: true }).abortSignal(signal), 'Portal accounts'),
    exactCount(client.from('push_subscriptions').select('id', { count: 'exact', head: true }).abortSignal(signal), 'Push subscriptions'),
    // Include older balances too; the presentation filters sales/months separately.
    readAllRows<Invoice>((offset, end) => client.from('invoices')
      .select('id,issue_date,currency,document_type,total_amount,amount_paid,balance_due,status', { count: 'exact' })
      .lte('issue_date', to).order('id').range(offset, end).abortSignal(signal).returns<Invoice[]>(), 'Invoices'),
    readAllRows<Remittance>((offset, end) => client.from('remittances')
      .select('id,received_date,currency,amount,status', { count: 'exact' }).gte('received_date', from).lte('received_date', to)
      .order('id').range(offset, end).abortSignal(signal).returns<Remittance[]>(), 'Remittances'),
    stock('parts'), stock('vehicles'),
    client.from('inquiries').select('id,customer_name,message,status').order('created_at', { ascending: false }).order('id').limit(5).abortSignal(signal),
    client.from('system_finance_settings').select('default_currency,enabled_currencies').eq('id', 1).abortSignal(signal).maybeSingle(),
    // This RPC supplies extra drilldowns; verified direct reads cover the fallback.
    Promise.resolve(client.rpc('get_ops_analytics_summary', { p_from: from, p_to: to }).abortSignal(signal))
      .catch(() => ({ data: null, error: { message: 'Analytics unavailable' } })),
  ]);
  signal.throwIfAborted();
  if (recent.error || !Array.isArray(recent.data)) throw new Error('Recent inquiries could not be loaded. Please retry.');
  if (settings.error) throw new Error('Finance settings could not be loaded. Please retry.');
  const configured = settings.data?.enabled_currencies ?? [];
  if (!Array.isArray(configured) || configured.some((code: unknown) => typeof code !== 'string' || !/^[A-Z]{3}$/.test(code))) {
    throw new Error('The configured currencies are invalid. Please review Finance settings.');
  }
  const analytics = analyticsResult.error ? null : normalizeOpsAnalyticsSummary(analyticsResult.data);
  return {
    ...base, counts: { ...base.counts, inquiries, portalUsers, pushSubscribers }, invoices, remittances,
    inventory: [...partStock, ...vehicleStock], recentInquiries: recent.data as RecentInquiry[], analytics,
    currencies: listCurrencies([...configured, String(settings.data?.default_currency || 'AED')]),
    warning: analytics ? '' : 'Detailed analytics are unavailable. Showing totals from the accessible records. Retry to refresh all figures.',
  };
}
