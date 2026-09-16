const DEFAULT_MAX_EDGE = 1920;
const DEFAULT_QUALITY = 0.82;

export type CompressedCatalogImage = {
  file: File;
  originalBytes: number;
  compressedBytes: number;
  width: number;
  height: number;
};

function safeStem(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'catalog-image';
}

export async function compressCatalogImage(
  input: Blob,
  nameStem: string,
  options: { maxEdge?: number; quality?: number } = {}
): Promise<CompressedCatalogImage> {
  if (!input.type.startsWith('image/')) throw new Error('The selected file is not a supported image.');

  const bitmap = await createImageBitmap(input, { imageOrientation: 'from-image' });
  const maxEdge = options.maxEdge || DEFAULT_MAX_EDGE;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
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
      (blob) => blob ? resolve(blob) : reject(new Error('Image compression failed.')),
      'image/webp',
      options.quality || DEFAULT_QUALITY
    );
  });
  const file = new File([output], `${safeStem(nameStem)}.webp`, { type: 'image/webp', lastModified: Date.now() });

  return { file, originalBytes: input.size, compressedBytes: file.size, width, height };
}
