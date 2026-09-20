/** Freight Charges configuration master (Phase 76). */

import type { ShipmentMode } from '@/lib/trade-terms';

export type FreightChargeShipmentType = ShipmentMode;

export type FreightCharge = {
  id: string;
  source_country: string;
  source_port: string | null;
  destination_country: string;
  destination_port: string | null;
  shipment_type: FreightChargeShipmentType;
  freight_charge: number;
  currency: string;
  shipping_company: string | null;
  contact_person: string | null;
  contact_number: string | null;
  email: string | null;
  website: string | null;
  notes: string | null;
  is_active: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export function formatFreightRoute(country: string, port: string | null | undefined): string {
  const c = country.trim();
  const p = (port || '').trim();
  if (c && p) return `${c} / ${p}`;
  return c || p || '—';
}

export function formatFreightAmount(amount: number, currency: string): string {
  const cur = (currency || 'USD').trim().toUpperCase() || 'USD';
  const n = Number(amount);
  if (!Number.isFinite(n)) return `— ${cur}`;
  return `${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${cur}`;
}
