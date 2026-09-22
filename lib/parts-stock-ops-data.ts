import { supabase } from '@/lib/supabase/client';
import {
  daysBetween,
  deriveShipmentViewStatus,
  deriveStockPaymentStatus,
  type StockOpsRow,
} from '@/lib/stock-ops';

type RawPart = {
  id: string;
  name: string;
  slug: string;
  part_code: string;
  brand: string | null;
  part_number: string | null;
  oem_number: string | null;
  category_id: string | null;
  location: string | null;
  stock_origin: string | null;
  stock_status: string;
  quantity: number;
  price: number | null;
  price_fob: number | null;
  price_cf: number | null;
  price_cif: number | null;
  currency: string;
  purchase_price: number | null;
  purchase_currency: string | null;
  purchase_date: string | null;
  landed_cost: number | null;
  reserved_by: string | null;
  reserved_customer_id: string | null;
  reservation_requester_name: string | null;
  reservation_requester_role: string | null;
  reservation_etd: string | null;
  reservation_eta: string | null;
  reservation_vat_applicable: boolean | null;
  reservation_price_term: string | null;
  reservation_shipment_term: string | null;
  created_at: string;
  sold_at: string | null;
  categories?: { name: string } | { name: string }[] | null;
  part_photos?: Array<{ storage_path: string; is_cover: boolean; sort_order: number }>;
  part_compatibility?: Array<{ make: string; model: string }>;
};

export type PartsStockOpsRow = StockOpsRow & {
  part_code: string;
  brand: string | null;
  part_number: string | null;
  oem_number: string | null;
  quantity: number;
  category_name: string | null;
  compat_label: string | null;
};

/** Load parts with shipment + invoice enrichment for parts stock ops. */
export async function loadPartsStockOpsRows(
  limit = 200,
  offset = 0
): Promise<{ rows: PartsStockOpsRow[]; error: string | null; hasMore: boolean }> {
  const { data, error } = await supabase
    .from('parts')
    .select(
      'id,name,slug,part_code,brand,part_number,oem_number,category_id,location,stock_origin,stock_status,quantity,price,price_fob,price_cf,price_cif,currency,purchase_price,purchase_currency,purchase_date,landed_cost,reserved_by,reserved_customer_id,reservation_requester_name,reservation_requester_role,reservation_etd,reservation_eta,reservation_vat_applicable,reservation_price_term,reservation_shipment_term,created_at,sold_at,categories(name),part_photos(storage_path,is_cover,sort_order),part_compatibility(make,model)'
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + limit);

  if (error) return { rows: [], error: error.message, hasMore: false };

  const page = (data || []) as unknown as RawPart[];
  const hasMore = page.length > limit;
  const parts = page.slice(0, limit);
  const partIds = parts.map((p) => p.id);
  if (!partIds.length) return { rows: [], error: null, hasMore };

  const reservedByIds = Array.from(new Set(parts.map((p) => p.reserved_by).filter(Boolean))) as string[];
  const customerIds = Array.from(
    new Set(parts.map((p) => p.reserved_customer_id).filter(Boolean))
  ) as string[];

  const [agentRes, custRes, linkRes, itemRes, docRes] = await Promise.all([
    reservedByIds.length
      ? supabase.from('admin_profiles').select('id,full_name,email').in('id', reservedByIds)
      : Promise.resolve({ data: [], error: null }),
    customerIds.length
      ? supabase.from('customers').select('id,full_name,company_name,country').in('id', customerIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('export_shipment_parts')
      .select(
        'part_id, export_shipments(id,shipment_number,status,mode,destination_country,destination_port,loading_port,vessel_name,voyage_no,bl_number,booking_ref,etd,eta,created_at)'
      )
      .in('part_id', partIds),
    supabase
      .from('invoice_items')
      .select('part_id, invoices(id,status,total_amount,balance_due,currency,created_at,document_type)')
      .in('part_id', partIds)
      .not('part_id', 'is', null)
      .limit(2000),
    supabase.from('export_shipment_documents').select('export_shipment_id,doc_type').limit(4000),
  ]);

  const agentMap: Record<string, string> = {};
  for (const row of agentRes.data || []) {
    agentMap[row.id] = row.full_name || row.email || row.id.slice(0, 8);
  }

  const custMap: Record<string, { name: string; country: string | null }> = {};
  for (const row of custRes.data || []) {
    custMap[row.id] = {
      name: row.company_name || row.full_name,
      country: (row as { country?: string | null }).country || null,
    };
  }

  type ShipInfo = {
    id: string;
    shipment_number: string;
    status: string;
    mode: string | null;
    destination_country: string | null;
    destination_port: string | null;
    loading_port: string | null;
    vessel_name: string | null;
    voyage_no: string | null;
    bl_number: string | null;
    booking_ref: string | null;
    etd: string | null;
    eta: string | null;
    created_at: string;
  };
  const shipByPart: Record<string, ShipInfo> = {};
  for (const row of linkRes.data || []) {
    const ship = Array.isArray(row.export_shipments) ? row.export_shipments[0] : row.export_shipments;
    if (!ship?.id) continue;
    const prev = shipByPart[row.part_id];
    if (!prev || String(ship.created_at) > prev.created_at) {
      shipByPart[row.part_id] = ship as ShipInfo;
    }
  }

  type InvInfo = {
    id: string;
    status: string;
    total_amount: number;
    balance_due: number;
    currency: string;
    created_at: string;
  };
  const invByPart: Record<string, InvInfo> = {};
  for (const row of itemRes.data || []) {
    if (!row.part_id) continue;
    const inv = Array.isArray(row.invoices) ? row.invoices[0] : row.invoices;
    if (!inv?.id) continue;
    const prev = invByPart[row.part_id];
    if (!prev || String(inv.created_at) > prev.created_at) {
      invByPart[row.part_id] = inv as InvInfo;
    }
  }

  const docsByShipment: Record<string, Set<string>> = {};
  for (const row of docRes.data || []) {
    if (!docsByShipment[row.export_shipment_id]) docsByShipment[row.export_shipment_id] = new Set();
    docsByShipment[row.export_shipment_id].add(row.doc_type);
  }

  const rows: PartsStockOpsRow[] = parts.map((p) => {
    const ship = shipByPart[p.id];
    const inv = invByPart[p.id];
    const docs = ship ? docsByShipment[ship.id] : undefined;
    const cust = p.reserved_customer_id ? custMap[p.reserved_customer_id] : null;
    const cover =
      (p.part_photos || []).find((ph) => ph.is_cover) ||
      [...(p.part_photos || [])].sort((a, b) => a.sort_order - b.sort_order)[0];
    const category = Array.isArray(p.categories) ? p.categories[0] : p.categories;
    const compat = (p.part_compatibility || []).slice(0, 2);
    const compat_label = compat.length
      ? compat.map((c) => `${c.make} ${c.model}`.trim()).join(', ')
      : null;
    const stock_payment = deriveStockPaymentStatus({
      stockStatus: p.stock_status,
      invoiceStatus: inv?.status,
    });
    const shipment_view = deriveShipmentViewStatus(ship?.status);
    const agingAnchor =
      shipment_view === 'delivered'
        ? ship?.eta || p.sold_at || p.created_at
        : shipment_view === 'shipped'
          ? ship?.etd || ship?.created_at || p.created_at
          : shipment_view === 'booked'
            ? ship?.created_at || p.created_at
            : p.purchase_date || p.created_at;

    return {
      id: p.id,
      title: p.name,
      slug: p.slug,
      make: compat[0]?.make || p.brand || '',
      model: compat[0]?.model || '',
      year: null,
      stock_number: p.part_code,
      chassis_number: p.oem_number,
      chassis_code: p.part_number,
      fuel_type: null,
      transmission: null,
      color: null,
      location: p.location,
      stock_origin: p.stock_origin,
      stock_status: p.stock_status,
      price: p.price,
      price_fob: p.price_fob,
      price_cf: p.price_cf,
      price_cif: p.price_cif,
      currency: p.currency,
      purchase_price: p.purchase_price,
      purchase_currency: p.purchase_currency,
      purchase_date: p.purchase_date,
      landed_cost: p.landed_cost,
      reserved_by: p.reserved_by,
      reserved_customer_id: p.reserved_customer_id,
      reservation_requester_name: p.reservation_requester_name,
      reservation_requester_role: p.reservation_requester_role,
      reservation_etd: p.reservation_etd,
      reservation_eta: p.reservation_eta,
      reservation_vat_applicable: p.reservation_vat_applicable,
      reservation_price_term: p.reservation_price_term,
      reservation_shipment_term: p.reservation_shipment_term,
      created_at: p.created_at,
      sold_at: p.sold_at,
      cover_path: cover?.storage_path || null,
      agent_name: p.reserved_by ? agentMap[p.reserved_by] || null : null,
      customer_name: cust?.name || null,
      customer_country: cust?.country || ship?.destination_country || null,
      invoice_id: inv?.id || null,
      invoice_status: inv?.status || null,
      invoice_total: inv?.total_amount ?? null,
      invoice_balance: inv?.balance_due ?? null,
      invoice_currency: inv?.currency || null,
      shipment_id: ship?.id || null,
      shipment_number: ship?.shipment_number || null,
      shipment_status: ship?.status || null,
      shipment_mode: ship?.mode || p.reservation_shipment_term || null,
      destination_country: ship?.destination_country || null,
      destination_port: ship?.destination_port || null,
      loading_port: ship?.loading_port || null,
      vessel_name: ship?.vessel_name || null,
      voyage_no: ship?.voyage_no || null,
      bl_number: ship?.bl_number || null,
      booking_ref: ship?.booking_ref || null,
      etd: ship?.etd || p.reservation_etd || null,
      eta: ship?.eta || p.reservation_eta || null,
      has_bl: !!docs?.has('bill_of_lading'),
      has_waybill: !!docs?.has('waybill'),
      has_surrendered: !!docs?.has('surrendered_bl'),
      has_export_cert: !!docs?.has('export_certificate'),
      has_inspection: !!docs?.has('inspection_certificate'),
      stock_payment,
      shipment_view,
      aging_days: daysBetween(agingAnchor),
      part_code: p.part_code,
      brand: p.brand,
      part_number: p.part_number,
      oem_number: p.oem_number,
      quantity: p.quantity,
      category_name: category?.name || null,
      compat_label,
    };
  });

  // cover_path for parts uses part-images bucket; callers should use publicPartImageUrl
  return { rows, error: null, hasMore };
}
