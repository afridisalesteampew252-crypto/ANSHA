/** Shared freight math. Container capacities are estimates, subject to the carrier's loading plan. */
export const CONTAINER_SHARE_COUNTS = { small: 6, large: 4, xl: 3 } as const;
export type ContainerVehicleSize = keyof typeof CONTAINER_SHARE_COUNTS;
export type ContainerSizeChoice = 'auto' | ContainerVehicleSize;

export function normalizeVehicleModel(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

export function vehicleVolume(length: unknown, width: unknown, height: unknown): number | null {
  const dimensions = [length, width, height].map(Number);
  if (!dimensions.every((value) => Number.isFinite(value) && value > 0)) return null;
  const volume = dimensions.reduce((total, value) => total * value, 1);
  return Number.isFinite(volume) ? Number(volume.toFixed(3)) : null;
}

export function vehicleSizeForVolume(volumeM3: number): ContainerVehicleSize {
  if (!Number.isFinite(volumeM3) || volumeM3 <= 0) throw new Error('Enter a positive vehicle volume.');
  if (volumeM3 <= 9) return 'small';
  if (volumeM3 <= 14) return 'large';
  return 'xl';
}

export function freightPerVehicle(
  mode: 'roro' | 'container_40ft',
  volumeM3: number,
  rate: number,
  size: ContainerSizeChoice = 'auto'
): number {
  const resolvedSize = size === 'auto' ? vehicleSizeForVolume(volumeM3) : size;
  if (!Number.isFinite(volumeM3) || volumeM3 <= 0 || !Number.isFinite(rate) || rate < 0) {
    throw new Error('Enter a positive volume and a valid freight rate.');
  }
  return mode === 'roro' ? volumeM3 * rate : rate / CONTAINER_SHARE_COUNTS[resolvedSize];
}

/** Use amounts in one currency: C&F = FOB + freight; CIF = C&F + insurance. */
export function exportQuotePrices(fob: number, freight: number, insurance: number) {
  if (![fob, freight, insurance].every((value) => Number.isFinite(value) && value >= 0)) {
    throw new Error('FOB, freight and insurance must be valid non-negative amounts.');
  }
  const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  return { fob: round(fob), cf: round(fob + freight), cif: round(fob + freight + insurance) };
}
