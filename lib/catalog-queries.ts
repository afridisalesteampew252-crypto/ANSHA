import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPPORTED_MANUFACTURERS } from '@/lib/manufacturer-logos';
import {
  PUBLIC_CATEGORY_CARD_SELECT,
  PUBLIC_PART_CARD_SELECT,
  PUBLIC_VEHICLE_CARD_SELECT,
  type PublicCategoryCard,
  type PublicPartCard,
  type PublicVehicleCard,
} from '@/lib/public-card-data';
import { STOCK_ORIGINS } from '@/lib/stock';
import type { StockOrigin } from '@/lib/types';
import {
  EQUIPMENT_CATEGORIES,
  MACHINERY_VEHICLE_CLASSES,
  isVehicleClass,
  type VehicleClass,
} from '@/lib/vehicle-class';

/**
 * Shared public catalog filters + queries. Used by the server pages (first page in the
 * initial HTML) and the client catalogs (filter changes / pagination), so both always
 * build exactly the same query.
 */

type ParamsLike = { get(key: string): string | null };
export type SearchParamsInput = Record<string, string | string[] | undefined>;

export function toUrlSearchParams(record: SearchParamsInput): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === 'string') params.set(key, value);
    else if (Array.isArray(value) && value[0] != null) params.set(key, value[0]);
  }
  return params;
}

function safeSearch(value: string): string {
  return value.trim().replace(/[,%()]/g, ' ');
}

function parseStockOrigin(value: string | null): 'all' | StockOrigin {
  return STOCK_ORIGINS.some((origin) => origin.value === value) ? (value as StockOrigin) : 'all';
}

/* ----------------------------------------------------------------- vehicles */

export const VEHICLE_PAGE_SIZE = 48;
const VEHICLE_SORTS = ['newest', 'year-new', 'price-low', 'price-high'];

export type VehicleCatalogFilters = {
  q: string;
  brand: string;
  stockOrigin: 'all' | StockOrigin;
  sort: string;
};

export function parseVehicleCatalogFilters(params: ParamsLike): VehicleCatalogFilters {
  const brand = params.get('brand');
  const sort = params.get('sort');
  return {
    q: params.get('q') || '',
    brand: brand && (SUPPORTED_MANUFACTURERS as readonly string[]).includes(brand) ? brand : 'all',
    stockOrigin: parseStockOrigin(params.get('stock')),
    sort: sort && VEHICLE_SORTS.includes(sort) ? sort : 'newest',
  };
}

export async function fetchVehicleCatalogPage(
  supabase: SupabaseClient,
  filters: VehicleCatalogFilters,
  offset = 0
): Promise<{ items: PublicVehicleCard[]; count: number; error: string | null }> {
  let request = supabase
    .from('vehicles')
    .select(PUBLIC_VEHICLE_CARD_SELECT, { count: 'exact' })
    .eq('is_published', true)
    .eq('stock_status', 'available');
  const q = safeSearch(filters.q);
  if (q) {
    request = request.or(
      `title.ilike.%${q}%,make.ilike.%${q}%,model.ilike.%${q}%,chassis_code.ilike.%${q}%,stock_number.ilike.%${q}%`
    );
  }
  if (filters.brand !== 'all') request = request.eq('make', filters.brand);
  if (filters.stockOrigin !== 'all') request = request.eq('stock_origin', filters.stockOrigin);
  if (filters.sort === 'year-new') request = request.order('year', { ascending: false, nullsFirst: false });
  else if (filters.sort === 'price-low') request = request.order('price', { ascending: true, nullsFirst: false });
  else if (filters.sort === 'price-high') request = request.order('price', { ascending: false, nullsFirst: true });
  else request = request.order('created_at', { ascending: false });
  const { data, count, error } = await request
    .order('id', { ascending: true })
    .range(offset, offset + VEHICLE_PAGE_SIZE - 1);
  return {
    items: (data || []) as unknown as PublicVehicleCard[],
    count: count ?? 0,
    error: error?.message ?? null,
  };
}

/* ---------------------------------------------------------------- machinery */

export const MACHINERY_LIMIT = 48;
const MACHINERY_SORTS = ['newest', 'year-new', 'hours-low', 'price-low', 'price-high'];

export type MachineryCatalogFilters = {
  q: string;
  classFilter: 'all' | VehicleClass;
  equipmentType: string;
  stockOrigin: 'all' | StockOrigin;
  sort: string;
};

export function parseMachineryCatalogFilters(params: ParamsLike): MachineryCatalogFilters {
  const cls = params.get('class');
  const type = params.get('type');
  const sort = params.get('sort');
  return {
    q: params.get('q') || '',
    classFilter:
      cls && isVehicleClass(cls) && MACHINERY_VEHICLE_CLASSES.includes(cls) ? cls : 'all',
    equipmentType: type && EQUIPMENT_CATEGORIES.some((item) => item.value === type) ? type : 'all',
    stockOrigin: parseStockOrigin(params.get('stock')),
    sort: sort && MACHINERY_SORTS.includes(sort) ? sort : 'newest',
  };
}

export async function fetchMachineryCatalog(
  supabase: SupabaseClient,
  filters: MachineryCatalogFilters
): Promise<{ items: PublicVehicleCard[]; error: string | null }> {
  let request = supabase
    .from('vehicles')
    .select(PUBLIC_VEHICLE_CARD_SELECT)
    .eq('is_published', true)
    .eq('stock_status', 'available')
    .in('vehicle_class', [...MACHINERY_VEHICLE_CLASSES]);
  const q = safeSearch(filters.q);
  if (q) {
    request = request.or(
      `title.ilike.%${q}%,make.ilike.%${q}%,model.ilike.%${q}%,chassis_code.ilike.%${q}%,stock_number.ilike.%${q}%,equipment_category.ilike.%${q}%`
    );
  }
  if (filters.classFilter !== 'all') request = request.eq('vehicle_class', filters.classFilter);
  if (filters.equipmentType !== 'all') request = request.eq('equipment_category', filters.equipmentType);
  if (filters.stockOrigin !== 'all') request = request.eq('stock_origin', filters.stockOrigin);
  if (filters.sort === 'year-new') request = request.order('year', { ascending: false, nullsFirst: false });
  else if (filters.sort === 'hours-low') request = request.order('operating_hours', { ascending: true, nullsFirst: false });
  else if (filters.sort === 'price-low') request = request.order('price', { ascending: true, nullsFirst: false });
  else if (filters.sort === 'price-high') request = request.order('price', { ascending: false, nullsFirst: true });
  else request = request.order('created_at', { ascending: false });
  const { data, error } = await request.limit(MACHINERY_LIMIT);
  return { items: (data || []) as unknown as PublicVehicleCard[], error: error?.message ?? null };
}

/* -------------------------------------------------------------------- parts */

export const PARTS_PAGE_SIZE = 12;

export type PartsCatalogFilters = {
  q: string;
  category: string;
  condition: string;
  brand: string;
  stock: string;
  sort: string;
  page: number;
};

export function parsePartsCatalogFilters(params: ParamsLike): PartsCatalogFilters {
  return {
    q: params.get('q') || '',
    category: params.get('category') || 'all',
    condition: params.get('condition') || 'all',
    brand: params.get('brand') || 'all',
    stock: params.get('stock') || 'all',
    sort: params.get('sort') || 'newest',
    page: Math.max(1, Number(params.get('page')) || 1),
  };
}

export async function fetchPublicCategories(supabase: SupabaseClient): Promise<PublicCategoryCard[]> {
  const { data } = await supabase.from('categories').select(PUBLIC_CATEGORY_CARD_SELECT).order('sort_order');
  return (data || []) as unknown as PublicCategoryCard[];
}

export async function fetchPartsCatalogPage(
  supabase: SupabaseClient,
  filters: PartsCatalogFilters,
  categoryId: string | undefined
): Promise<{ items: PublicPartCard[]; count: number; error: string | null }> {
  let request = supabase
    .from('parts')
    .select(PUBLIC_PART_CARD_SELECT, { count: 'exact' })
    .eq('is_published', true)
    .eq('stock_status', 'available');
  const q = safeSearch(filters.q);
  if (q) {
    request = request.or(
      `name.ilike.%${q}%,brand.ilike.%${q}%,part_code.ilike.%${q}%,oem_number.ilike.%${q}%,part_number.ilike.%${q}%,manufacturer_part_number.ilike.%${q}%,catalog_search_text.ilike.%${q}%`
    );
  }
  if (categoryId) request = request.eq('category_id', categoryId);
  if (filters.condition !== 'all') request = request.eq('condition', filters.condition);
  if (filters.brand !== 'all') request = request.eq('brand', filters.brand);
  if (filters.stock !== 'all') request = request.eq('stock_origin', filters.stock);
  if (filters.sort === 'oldest') request = request.order('created_at', { ascending: true });
  else if (filters.sort === 'name') request = request.order('name', { ascending: true });
  else if (filters.sort === 'price-low') request = request.order('price', { ascending: true, nullsFirst: false });
  else if (filters.sort === 'price-high') request = request.order('price', { ascending: false, nullsFirst: true });
  else request = request.order('created_at', { ascending: false });
  const from = (filters.page - 1) * PARTS_PAGE_SIZE;
  const { data, count, error } = await request.range(from, from + PARTS_PAGE_SIZE - 1);
  return {
    items: (data || []) as unknown as PublicPartCard[],
    count: count ?? 0,
    error: error?.message ?? null,
  };
}
