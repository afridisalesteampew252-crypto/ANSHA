/* Phase 57: classify vehicles as passenger / commercial truck / heavy machinery (additive). */

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS vehicle_class text NOT NULL DEFAULT 'passenger',
  ADD COLUMN IF NOT EXISTS equipment_category text,
  ADD COLUMN IF NOT EXISTS operating_hours integer;

ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_vehicle_class_check;
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_vehicle_class_check
  CHECK (vehicle_class IN ('passenger', 'commercial_truck', 'heavy_machinery'));

ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_operating_hours_check;
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_operating_hours_check
  CHECK (operating_hours IS NULL OR operating_hours >= 0);

COMMENT ON COLUMN public.vehicles.vehicle_class IS
  'Catalog class: passenger cars/SUVs, commercial trucks, or heavy machinery / construction equipment.';
COMMENT ON COLUMN public.vehicles.equipment_category IS
  'Optional subtype for trucks/machinery (e.g. excavator, wheel_loader, dump_truck).';
COMMENT ON COLUMN public.vehicles.operating_hours IS
  'Meter hours for heavy equipment; prefer over mileage when set.';

CREATE INDEX IF NOT EXISTS vehicles_vehicle_class_idx
  ON public.vehicles (vehicle_class);

CREATE INDEX IF NOT EXISTS vehicles_public_class_stock_idx
  ON public.vehicles (vehicle_class, stock_origin, stock_status, created_at DESC)
  WHERE is_published;
