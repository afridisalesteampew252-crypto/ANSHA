import type { SupabaseClient } from '@supabase/supabase-js';
import { readAllRows } from '@/lib/read-all-rows';
import { mapStockLinkedInvoices, type StockListLinkedInvoice } from '@/lib/stock-linked-invoice';
import type { PartWithRelations, VehicleWithPhotos } from '@/lib/types';
import type { StockPool } from '@/lib/stock';

type Agent = { id: string; full_name: string | null; email: string | null; role: string };
type Shipment = { status: string; created_at: string };
type Link = { id: string; part_id?: string; vehicle_id?: string; export_shipments: Shipment | Shipment[] | null };
type Item = { id: string; part_id?: string; vehicle_id?: string; invoices: StockListLinkedInvoice | StockListLinkedInvoice[] | null };

async function relatedRows<T extends { id: string }>(client: SupabaseClient, table: string, select: string, column: string, ids: string[], signal: AbortSignal): Promise<T[]> {
  const rows: T[] = [];
  for (let index = 0; index < ids.length; index += 100) {
    const batch = ids.slice(index, index + 100);
    rows.push(...await readAllRows<T>((from, to) => client.from(table).select(select, { count: 'exact' })
      .in(column, batch).order('id').range(from, to).abortSignal(signal).returns<T[]>(), 'Inventory details'));
  }
  return rows;
}

export async function fetchAdminInventory<T extends PartWithRelations | VehicleWithPhotos>(
  client: SupabaseClient, kind: 'parts' | 'vehicles', signal: AbortSignal, stockPool?: StockPool,
) {
  const list = await readAllRows<T>((from, to) => {
    let request = client.from(kind).select(kind === 'parts' ? '*, categories(*), part_photos(*), part_compatibility(*)' : '*, vehicle_photos(*)', { count: 'exact' });
    if (kind === 'vehicles' && stockPool) request = request.eq('stock_pool', stockPool);
    return request.order('created_at', { ascending: false }).order('id').range(from, to).abortSignal(signal).returns<T[]>();
  }, kind === 'parts' ? 'Parts inventory' : 'Vehicle inventory');
  const column = kind === 'parts' ? 'part_id' : 'vehicle_id';
  const ids = list.map((row) => row.id);
  const [agents, links, items] = await Promise.all([
    readAllRows<Agent>((from, to) => client.from('admin_profiles').select('id,full_name,email,role', { count: 'exact' })
      .in('role', ['sales', 'freelancer', 'manager', 'admin', 'staff']).eq('is_active', true)
      .order('full_name').order('id').range(from, to).abortSignal(signal).returns<Agent[]>(), 'Agent names'),
    relatedRows<Link>(client, `export_shipment_${kind}`, `id,${column},export_shipments(status,created_at)`, column, ids, signal),
    relatedRows<Item>(client, 'invoice_items', `id,${column},invoices(id,invoice_number,status,created_at,document_type)`, column, ids, signal),
  ]);
  const agentNames: Record<string, string> = {};
  for (const agent of agents) agentNames[agent.id] = agent.full_name || agent.email || agent.id.slice(0, 8);
  const agentOptions = agents.filter((agent) => agent.role === 'sales' || agent.role === 'freelancer').map((agent) => ({ id: agent.id, label: agentNames[agent.id] }));
  for (const row of list) if (row.reserved_by && !agentNames[row.reserved_by]) agentNames[row.reserved_by] = row.reserved_by.slice(0, 8);
  const latest: Record<string, Shipment> = {};
  for (const row of links) {
    const id = row[column];
    const shipment = Array.isArray(row.export_shipments) ? row.export_shipments[0] : row.export_shipments;
    if (id && shipment?.status && (!latest[id] || shipment.created_at > latest[id].created_at)) latest[id] = shipment;
  }
  return {
    list, agentNames, agentOptions,
    shipments: Object.fromEntries(Object.entries(latest).map(([id, ship]) => [id, ship.status])),
    invoices: mapStockLinkedInvoices(items, (row) => row[column]),
  };
}
