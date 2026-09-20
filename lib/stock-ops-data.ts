import { supabase } from '@/lib/supabase/client';
import {
  daysBetween,
  deriveShipmentViewStatus,
  deriveStockPaymentStatus,
  type StockOpsRow,
} from '@/lib/stock-ops';
import { pickVehicleCoverPhoto } from '@/lib/vehicle-photos';

type RawVehicle = {
  id: string;
  title: string;
  slug: string;
  make: string;
  model: string;
  year: number | null;
  stock_number: string | null;
  chassis_number: string | null;
  chassis_code: string | null;
  fuel_type: string | null;
  transmission: string | null;
  color: string | null;
  location: string | null;
  stock_origin: string | null;
  stock_status: string;
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
  vehicle_photos?: Array<{ storage_path: string; is_cover: boolean; sort_order: number; is_auction_sheet?: boolean }>;
};

/** Load vehicles with shipment + invoice enrichment for stock ops screens. */
export async function loadStockOpsRows(limit = 800): Promise<{ rows: StockOpsRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('vehicles')
    .select(
      'id,title,slug,make,model,year,stock_number,chassis_number,chassis_code,fuel_type,transmission,color,location,stock_origin,stock_status,price,price_fob,price_cf,price_cif,currency,purchase_price,purchase_currency,purchase_date,landed_cost,reserved_by,reserved_customer_id,reservation_requester_name,reservation_requester_role,reservation_etd,reservation_eta,reservation_vat_applicable,reservation_price_term,reservation_shipment_term,created_at,sold_at,vehicle_photos(storage_path,is_cover,sort_order,is_auction_sheet)'
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return { rows: [], error: error.message };

  const vehicles = (data || []) as unknown as RawVehicle[];
  const vehicleIds = vehicles.map((v) => v.id);
  if (!vehicleIds.length) return { rows: [], error: null };

  const reservedByIds = Array.from(new Set(vehicles.map((v) => v.reserved_by).filter(Boolean))) as string[];
  const customerIds = Array.from(new Set(vehicles.map((v) => v.reserved_customer_id).filter(Boolean))) as string[];

  const [agentRes, custRes, linkRes, itemRes, docRes] = await Promise.all([
    reservedByIds.length
      ? supabase.from('admin_profiles').select('id,full_name,email').in('id', reservedByIds)
      : Promise.resolve({ data: [], error: null }),
    customerIds.length
      ? supabase.from('customers').select('id,full_name,company_name,country').in('id', customerIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('export_shipment_vehicles')
      .select(
        'vehicle_id, export_shipments(id,shipment_number,status,mode,destination_country,destination_port,loading_port,vessel_name,voyage_no,bl_number,booking_ref,etd,eta,created_at)'
      )
      .in('vehicle_id', vehicleIds),
    supabase
      .from('invoice_items')
      .select('vehicle_id, invoices(id,status,total_amount,balance_due,currency,created_at,document_type)')
      .in('vehicle_id', vehicleIds)
      .not('vehicle_id', 'is', null)
      .limit(2000),
    supabase
      .from('export_shipment_documents')
      .select('export_shipment_id,doc_type')
      .limit(4000),
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
  const shipByVehicle: Record<string, ShipInfo> = {};
  for (const row of linkRes.data || []) {
    const ship = Array.isArray(row.export_shipments) ? row.export_shipments[0] : row.export_shipments;
    if (!ship?.id) continue;
    const prev = shipByVehicle[row.vehicle_id];
    if (!prev || String(ship.created_at) > prev.created_at) {
      shipByVehicle[row.vehicle_id] = ship as ShipInfo;
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
  const invByVehicle: Record<string, InvInfo> = {};
  for (const row of itemRes.data || []) {
    if (!row.vehicle_id) continue;
    const inv = Array.isArray(row.invoices) ? row.invoices[0] : row.invoices;
    if (!inv?.id) continue;
    const prev = invByVehicle[row.vehicle_id];
    if (!prev || String(inv.created_at) > prev.created_at) {
      invByVehicle[row.vehicle_id] = inv as InvInfo;
    }
  }

  const docsByShipment: Record<string, Set<string>> = {};
  for (const row of docRes.data || []) {
    if (!docsByShipment[row.export_shipment_id]) docsByShipment[row.export_shipment_id] = new Set();
    docsByShipment[row.export_shipment_id].add(row.doc_type);
  }

  const rows: StockOpsRow[] = vehicles.map((v) => {
    const ship = shipByVehicle[v.id];
    const inv = invByVehicle[v.id];
    const docs = ship ? docsByShipment[ship.id] : undefined;
    const cust = v.reserved_customer_id ? custMap[v.reserved_customer_id] : null;
    const cover = pickVehicleCoverPhoto(v.vehicle_photos || []);
    const stock_payment = deriveStockPaymentStatus({
      stockStatus: v.stock_status,
      invoiceStatus: inv?.status,
    });
    const shipment_view = deriveShipmentViewStatus(ship?.status);
    const agingAnchor =
      shipment_view === 'delivered'
        ? ship?.eta || v.sold_at || v.created_at
        : shipment_view === 'shipped'
          ? ship?.etd || ship?.created_at || v.created_at
          : shipment_view === 'booked'
            ? ship?.created_at || v.created_at
            : v.purchase_date || v.created_at;

    return {
      id: v.id,
      title: v.title,
      slug: v.slug,
      make: v.make,
      model: v.model,
      year: v.year,
      stock_number: v.stock_number,
      chassis_number: v.chassis_number,
      chassis_code: v.chassis_code,
      fuel_type: v.fuel_type,
      transmission: v.transmission,
      color: v.color,
      location: v.location,
      stock_origin: v.stock_origin,
      stock_status: v.stock_status,
      price: v.price,
      price_fob: v.price_fob,
      price_cf: v.price_cf,
      price_cif: v.price_cif,
      currency: v.currency,
      purchase_price: v.purchase_price,
      purchase_currency: v.purchase_currency,
      purchase_date: v.purchase_date,
      landed_cost: v.landed_cost,
      reserved_by: v.reserved_by,
      reserved_customer_id: v.reserved_customer_id,
      reservation_requester_name: v.reservation_requester_name,
      reservation_requester_role: v.reservation_requester_role,
      reservation_etd: v.reservation_etd,
      reservation_eta: v.reservation_eta,
      reservation_vat_applicable: v.reservation_vat_applicable,
      reservation_price_term: v.reservation_price_term,
      reservation_shipment_term: v.reservation_shipment_term,
      created_at: v.created_at,
      sold_at: v.sold_at,
      cover_path: cover?.storage_path || null,
      agent_name: v.reserved_by ? agentMap[v.reserved_by] || null : null,
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
      shipment_mode: ship?.mode || v.reservation_shipment_term || null,
      destination_country: ship?.destination_country || null,
      destination_port: ship?.destination_port || null,
      loading_port: ship?.loading_port || null,
      vessel_name: ship?.vessel_name || null,
      voyage_no: ship?.voyage_no || null,
      bl_number: ship?.bl_number || null,
      booking_ref: ship?.booking_ref || null,
      etd: ship?.etd || v.reservation_etd || null,
      eta: ship?.eta || v.reservation_eta || null,
      has_bl: !!docs?.has('bill_of_lading'),
      has_waybill: !!docs?.has('waybill'),
      has_surrendered: !!docs?.has('surrendered_bl'),
      has_export_cert: !!docs?.has('export_certificate'),
      has_inspection: !!docs?.has('inspection_certificate'),
      stock_payment,
      shipment_view,
      aging_days: daysBetween(agingAnchor),
    };
  });

  return { rows, error: null };
}
