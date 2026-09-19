import type { VehiclePhoto } from '@/lib/types';

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
export function publicVehiclePhotos(photos: VehiclePhoto[] | null | undefined): VehiclePhoto[] {
  return (photos || []).filter((photo) => !photo.is_auction_sheet);
}

export function vehicleHasAuctionSheet(photos: VehiclePhoto[] | null | undefined): boolean {
  return (photos || []).some((photo) => photo.is_auction_sheet);
}

/** Admin-only auction sheet images (filename A.* / is_auction_sheet). */
export function auctionSheetPhotos(photos: VehiclePhoto[] | null | undefined): VehiclePhoto[] {
  return (photos || [])
    .filter((photo) => photo.is_auction_sheet)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);
}

export function pickVehicleCoverPhoto(photos: VehiclePhoto[] | null | undefined): VehiclePhoto | undefined {
  const publicPhotos = publicVehiclePhotos(photos);
  return publicPhotos.find((photo) => photo.is_cover) || publicPhotos[0];
}
