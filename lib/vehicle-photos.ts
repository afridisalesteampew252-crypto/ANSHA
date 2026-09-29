import type { VehiclePhoto, VehiclePhotoView } from '@/lib/types';

export const VEHICLE_PHOTO_VIEWS: VehiclePhotoView[] = [
  'front', 'rear', 'left_side', 'right_side', 'interior', 'engine', 'detail', 'other',
];

export const VEHICLE_PHOTO_VIEW_LABELS: Record<VehiclePhotoView, string> = {
  front: 'Front', rear: 'Rear', left_side: 'Left side', right_side: 'Right side',
  interior: 'Interior', engine: 'Engine bay', detail: 'Detail', other: 'Other',
};

/** Minimal photo fields needed for cover / auction-sheet helpers (partial selects OK). */
export type VehiclePhotoLike = Pick<VehiclePhoto, 'storage_path' | 'is_cover' | 'sort_order'> &
  Partial<Pick<VehiclePhoto, 'is_auction_sheet' | 'id' | 'vehicle_id' | 'created_at'>>;

/**
 * Auction sheets in Japan stock ZIPs are named like `A.png` / `A.jpg`
 * (single letter A as the basename). Do not treat chassis codes or PixPin_* as sheets.
 */
export function isAuctionSheetFilename(fileName: string): boolean {
  const base = fileName
    .replace(/^.*[\\/]/, '')
    .replace(/\.[^.]+$/, '')
    .trim();
  return /^A$/i.test(base) || /^A[\s._-]/i.test(base);
}

/** Photos safe for public gallery / cover. */
export function publicVehiclePhotos<T extends VehiclePhotoLike>(photos: T[] | null | undefined): T[] {
  return (photos || []).filter((photo) => !photo.is_auction_sheet);
}

export function vehicleHasAuctionSheet(photos: VehiclePhotoLike[] | null | undefined): boolean {
  return (photos || []).some((photo) => photo.is_auction_sheet);
}

/** Admin-only auction sheet images (filename A.* / is_auction_sheet). */
export function auctionSheetPhotos<T extends VehiclePhotoLike>(photos: T[] | null | undefined): T[] {
  return (photos || [])
    .filter((photo) => photo.is_auction_sheet)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);
}

export function pickVehicleCoverPhoto<T extends VehiclePhotoLike>(
  photos: T[] | null | undefined
): T | undefined {
  const publicPhotos = publicVehiclePhotos(photos);
  return publicPhotos.find((photo) => photo.is_cover) || publicPhotos[0];
}
