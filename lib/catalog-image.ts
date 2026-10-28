export const CATALOG_IMAGE_POLICY = {
  version: 'opt-v1',
  maxEdge: 1400,
  quality: 0.74,
  minSavingsRatio: 0.08,
} as const;

export type CompressedCatalogImage = {
  file: File;
  originalBytes: number;
  compressedBytes: number;
  originalWidth: number;
  originalHeight: number;
  width: number;
  height: number;
  resized: boolean;
  savingsBytes: number;
  savingsPercent: number;
};

export type ExistingCatalogImageDecision = {
  replace: boolean;
  reason: 'legacy-format' | 'oversized' | 'meaningful-savings' | 'no-benefit';
};

export function safeCatalogImageStem(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'catalog-image';
}

export function isWebpCatalogImagePath(path: string) {
  return /\.webp(?:$|[?#])/i.test(path.trim());
}

/** Images written by the current optimization policy are never reprocessed by the bulk tool. */
export function isManagedCatalogImagePath(path: string) {
  return new RegExp(`-${CATALOG_IMAGE_POLICY.version}\\.webp(?:$|[?#])`, 'i').test(path.trim());
}

export function catalogImageStoragePath(existingPath: string, optimizedFileName: string) {
  const slash = existingPath.lastIndexOf('/');
  const folder = slash >= 0 ? existingPath.slice(0, slash + 1) : '';
  return `${folder}${Date.now()}-${Math.random().toString(36).slice(2, 9)}-${optimizedFileName}`;
}

/**
 * Decide whether a legacy stored image should be swapped for a newly compressed WebP.
 * Existing WebP is only replaced when dimensions are excessive or the byte saving is meaningful.
 */
export function shouldReplaceExistingCatalogImage(input: {
  storagePath: string;
  originalBytes: number;
  compressedBytes: number;
  originalWidth: number;
  originalHeight: number;
  maxEdge?: number;
  minSavingsRatio?: number;
}): ExistingCatalogImageDecision {
  if (input.compressedBytes <= 0 || input.originalBytes <= 0 || input.compressedBytes >= input.originalBytes) {
    return { replace: false, reason: 'no-benefit' };
  }

  if (!isWebpCatalogImagePath(input.storagePath)) {
    return { replace: true, reason: 'legacy-format' };
  }

  const maxEdge = input.maxEdge ?? CATALOG_IMAGE_POLICY.maxEdge;
  if (Math.max(input.originalWidth, input.originalHeight) > maxEdge) {
    return { replace: true, reason: 'oversized' };
  }

  const savingsRatio = 1 - input.compressedBytes / input.originalBytes;
  if (savingsRatio >= (input.minSavingsRatio ?? CATALOG_IMAGE_POLICY.minSavingsRatio)) {
    return { replace: true, reason: 'meaningful-savings' };
  }

  return { replace: false, reason: 'no-benefit' };
}

export async function compressCatalogImage(
  input: Blob,
  nameStem: string,
  options: { maxEdge?: number; quality?: number } = {}
): Promise<CompressedCatalogImage> {
  if (!input.type.startsWith('image/')) throw new Error('The selected file is not a supported image.');

  const maxEdge = options.maxEdge ?? CATALOG_IMAGE_POLICY.maxEdge;
  const quality = options.quality ?? CATALOG_IMAGE_POLICY.quality;
  if (!Number.isFinite(maxEdge) || maxEdge < 320 || maxEdge > 4096) {
    throw new Error('Image maximum edge must be between 320 and 4096 pixels.');
  }
  if (!Number.isFinite(quality) || quality <= 0 || quality > 1) {
    throw new Error('Image quality must be greater than 0 and no more than 1.');
  }

  const bitmap = await createImageBitmap(input, { imageOrientation: 'from-image' });
  const originalWidth = bitmap.width;
  const originalHeight = bitmap.height;
  const scale = Math.min(1, maxEdge / Math.max(originalWidth, originalHeight));
  const width = Math.max(1, Math.round(originalWidth * scale));
  const height = Math.max(1, Math.round(originalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) {
    bitmap.close();
    throw new Error('Image processing is not available in this browser.');
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const output = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Image compression failed.'))),
      'image/webp',
      quality
    );
  });

  if (output.type !== 'image/webp') {
    throw new Error('This browser could not create a WebP image.');
  }

  const file = new File(
    [output],
    `${safeCatalogImageStem(nameStem)}-${CATALOG_IMAGE_POLICY.version}.webp`,
    { type: 'image/webp', lastModified: Date.now() }
  );
  const savingsBytes = Math.max(0, input.size - file.size);
  const savingsPercent = input.size > 0 ? Math.max(0, Math.round((savingsBytes / input.size) * 100)) : 0;

  return {
    file,
    originalBytes: input.size,
    compressedBytes: file.size,
    originalWidth,
    originalHeight,
    width,
    height,
    resized: width !== originalWidth || height !== originalHeight,
    savingsBytes,
    savingsPercent,
  };
}
