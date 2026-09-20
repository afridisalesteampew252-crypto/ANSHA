export const VEHICLE_CLASSES = [
  { value: 'passenger', label: 'Passenger vehicle' },
  { value: 'commercial_truck', label: 'Commercial truck' },
  { value: 'heavy_machinery', label: 'Heavy machinery' },
] as const;

export type VehicleClass = (typeof VEHICLE_CLASSES)[number]['value'];

/** Public “Heavy machinery & trucks” browse set (excludes passenger cars). */
export const MACHINERY_VEHICLE_CLASSES: readonly VehicleClass[] = [
  'commercial_truck',
  'heavy_machinery',
];

export const EQUIPMENT_CATEGORIES = [
  { value: 'excavator', label: 'Excavator' },
  { value: 'wheel_loader', label: 'Wheel loader' },
  { value: 'bulldozer', label: 'Bulldozer' },
  { value: 'crane', label: 'Crane' },
  { value: 'forklift', label: 'Forklift' },
  { value: 'dump_truck', label: 'Dump truck' },
  { value: 'tractor_head', label: 'Tractor head / prime mover' },
  { value: 'trailer', label: 'Trailer' },
  { value: 'grader', label: 'Grader' },
  { value: 'roller', label: 'Roller / compactor' },
  { value: 'other', label: 'Other' },
] as const;

export type EquipmentCategory = (typeof EQUIPMENT_CATEGORIES)[number]['value'];

export function isVehicleClass(value: string | null | undefined): value is VehicleClass {
  return VEHICLE_CLASSES.some((item) => item.value === value);
}

export function vehicleClassLabel(value: string | null | undefined) {
  return VEHICLE_CLASSES.find((item) => item.value === value)?.label || 'Passenger vehicle';
}

export function equipmentCategoryLabel(value: string | null | undefined) {
  if (!value) return null;
  return EQUIPMENT_CATEGORIES.find((item) => item.value === value)?.label || value.replace(/_/g, ' ');
}

export function isMachineryClass(value: string | null | undefined) {
  return value === 'commercial_truck' || value === 'heavy_machinery';
}

/** Short badge copy for cards / filters. */
export function vehicleClassBadgeLabel(value: string | null | undefined) {
  if (value === 'commercial_truck') return 'Truck';
  if (value === 'heavy_machinery') return 'Machinery';
  return 'Vehicle';
}
