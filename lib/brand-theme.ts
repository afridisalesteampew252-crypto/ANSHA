export const DEFAULT_BRAND_ACCENT = '#D21E1E';
const BRAND_COLOR_STORAGE_KEY = 'ansha-brand-accent';
const BRAND_COLOR_UPDATED_STORAGE_KEY = 'ansha-brand-accent-updated-at';

export function normalizeHexColor(value: string | null | undefined): string | null {
  if (!value || !/^#[0-9a-fA-F]{6}$/.test(value.trim())) return null;
  return value.trim().toUpperCase();
}

export function hexToHsl(value: string): string {
  const normalized = normalizeHexColor(value) || DEFAULT_BRAND_ACCENT;
  const red = parseInt(normalized.slice(1, 3), 16) / 255;
  const green = parseInt(normalized.slice(3, 5), 16) / 255;
  const blue = parseInt(normalized.slice(5, 7), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;
  let saturation = 0;
  const lightness = (max + min) / 2;

  if (delta !== 0) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
    switch (max) {
      case red:
        hue = ((green - blue) / delta) % 6;
        break;
      case green:
        hue = (blue - red) / delta + 2;
        break;
      default:
        hue = (red - green) / delta + 4;
    }
    hue *= 60;
    if (hue < 0) hue += 360;
  }

  return `${Math.round(hue)} ${Math.round(saturation * 100)}% ${Math.round(lightness * 100)}%`;
}

export function applyBrandAccentColor(value: string): string | null {
  const color = normalizeHexColor(value);
  if (!color || typeof document === 'undefined') return null;
  const hsl = hexToHsl(color);
  const root = document.documentElement;
  root.style.setProperty('--accent', hsl);
  root.style.setProperty('--ring', hsl);
  root.style.setProperty('--accent-soft', hsl);

  const red = parseInt(color.slice(1, 3), 16);
  const green = parseInt(color.slice(3, 5), 16);
  const blue = parseInt(color.slice(5, 7), 16);
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  root.style.setProperty('--accent-foreground', luminance > 0.62 ? '220 15% 10%' : '0 0% 100%');

  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    meta.content = color;
  });
  return color;
}

export function persistBrandAccentColor(value: string): string | null {
  const color = applyBrandAccentColor(value);
  if (!color) return null;
  try {
    localStorage.setItem(BRAND_COLOR_STORAGE_KEY, color);
    localStorage.setItem(BRAND_COLOR_UPDATED_STORAGE_KEY, String(Date.now()));
  } catch {
    // The database remains the source of truth if browser storage is unavailable.
  }
  return color;
}

export function readCachedBrandAccentColor(): { color: string; isFresh: boolean } | null {
  if (typeof window === 'undefined') return null;
  try {
    const color = normalizeHexColor(localStorage.getItem(BRAND_COLOR_STORAGE_KEY));
    if (!color) return null;
    const updatedAt = Number(localStorage.getItem(BRAND_COLOR_UPDATED_STORAGE_KEY));
    return { color, isFresh: Number.isFinite(updatedAt) && Date.now() - updatedAt < 60_000 };
  } catch {
    return null;
  }
}
