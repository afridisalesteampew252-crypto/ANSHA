/** Export configuration master lists (Phase 62). */

export const EXPORT_MASTER_KINDS = [
  'destination_country',
  'loading_port',
  'destination_port',
  'vessel',
  'voyage',
] as const;

export type ExportMasterKind = (typeof EXPORT_MASTER_KINDS)[number];

export const EXPORT_MASTER_KIND_LABELS: Record<ExportMasterKind, string> = {
  destination_country: 'Destination country',
  loading_port: 'Loading port',
  destination_port: 'Destination port',
  vessel: 'Vessel',
  voyage: 'Voyage',
};

export type ExportMasterOption = {
  id: string;
  kind: ExportMasterKind;
  name: string;
  code: string | null;
  is_active: boolean;
  sort_order: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
