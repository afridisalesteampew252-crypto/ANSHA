export const LIFECYCLE_STAGES = [
  { value: 'unassigned', label: 'Unassigned' },
  { value: 'auction', label: 'Auction' },
  { value: 'yard', label: 'Yard' },
  { value: 'port', label: 'Port' },
  { value: 'sold', label: 'Sold' },
] as const;

export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number]['value'];

export const LIFECYCLE_EVENT_TYPES = [
  { value: 'reauction', label: 'Reauction' },
  { value: 'yard_transfer', label: 'Yard transfer' },
  { value: 'export_request', label: 'Export request' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'export_certificate', label: 'Export certificate' },
  { value: 'bl', label: 'BL' },
  { value: 'original_bl', label: 'Original BL' },
  { value: 'surrender_bl', label: 'Surrender BL' },
  { value: 'bl_amendment', label: 'BL amendment' },
  { value: 'courier', label: 'Courier' },
  { value: 'roro', label: 'RORO' },
  { value: 'container_20ft', label: '20 FT container' },
  { value: 'container_40ft', label: '40 FT container' },
  { value: 'parts_shipping', label: 'Parts shipping' },
  { value: 'meter_reverse', label: 'Meter reverse' },
  { value: 'yard_images', label: 'Yard images' },
  { value: 'note', label: 'Note' },
] as const;

export type LifecycleEventType = (typeof LIFECYCLE_EVENT_TYPES)[number]['value'] | 'stage_change';

/** Recommended forward path. Any stage may still be selected in admin for operational recovery. */
export const RECOMMENDED_NEXT_STAGE: Partial<Record<LifecycleStage, LifecycleStage>> = {
  unassigned: 'auction',
  auction: 'yard',
  yard: 'port',
  port: 'sold',
};

export function lifecycleStageLabel(value: string | null | undefined) {
  return LIFECYCLE_STAGES.find((stage) => stage.value === value)?.label || 'Unassigned';
}

export function lifecycleEventLabel(value: string | null | undefined) {
  if (value === 'stage_change') return 'Stage change';
  return LIFECYCLE_EVENT_TYPES.find((event) => event.value === value)?.label || value || 'Event';
}
