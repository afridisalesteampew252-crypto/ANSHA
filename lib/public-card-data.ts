import type {
  BlogCategory,
  BlogPost,
  Category,
  Part,
  PartCompatibility,
  PartPhoto,
  Vehicle,
  VehiclePhoto,
} from '@/lib/types';

export const PUBLIC_CATEGORY_CARD_SELECT = 'id,name,slug,image_url';

export const PUBLIC_PART_CARD_SELECT =
  'id,name,slug,part_code,part_number,oem_number,brand,condition,price,price_fob,price_cf,price_cif,currency,quantity,is_featured,show_price,stock_origin,stock_status,categories(name),part_photos(storage_path,is_cover,sort_order),part_compatibility(make,model,chassis_code,year_from,year_to)';

export const PUBLIC_VEHICLE_CARD_SELECT =
  'id,title,slug,make,model,year,transmission,fuel_type,mileage,operating_hours,vehicle_class,equipment_category,price,price_fob,price_cf,price_cif,currency,show_price,is_featured,stock_origin,stock_pool,stock_status,vehicle_photos(storage_path,is_cover,is_auction_sheet,sort_order)';

/**
 * Vehicle / part detail selects. vehicles and parts use an anon COLUMN allow-list
 * (migration 20261006010000_restrict_public_inventory_columns.sql), so never use `*` on
 * those two tables in public code. Embedded photo/category/compatibility tables are fine.
 */
export const PUBLIC_VEHICLE_DETAIL_SELECT =
  'id,title,slug,make,model,variant,year,chassis_code,engine_code,transmission,fuel_type,mileage,color,price,price_fob,price_cf,price_cif,currency,show_price,description,location,is_published,is_featured,stock_number,stock_origin,stock_pool,stock_status,vehicle_class,equipment_category,operating_hours,destination_markets,shipping_methods,meta_title,meta_description,created_at,updated_at,vehicle_photos(*)';

export const PUBLIC_PART_DETAIL_SELECT =
  'id,part_code,name,slug,category_id,brand,part_number,oem_number,condition,price,price_fob,price_cf,price_cif,currency,quantity,location,description,is_published,is_featured,show_price,stock_origin,stock_status,manufacturer_part_number,interchange_numbers,superseded_part_numbers,export_markets,meta_title,meta_description,created_at,updated_at,categories(*),part_photos(*),part_compatibility(*)';

export const PUBLIC_BLOG_CARD_SELECT =
  'id,title,slug,excerpt,featured_image,is_featured,published_at,created_at,blog_categories(id,name,slug)';

export type PublicCategoryCard = Pick<Category, 'id' | 'name' | 'slug' | 'image_url'>;

export type PublicPartCard = Pick<
  Part,
  | 'id'
  | 'name'
  | 'slug'
  | 'part_code'
  | 'part_number'
  | 'oem_number'
  | 'brand'
  | 'condition'
  | 'price'
  | 'price_fob'
  | 'price_cf'
  | 'price_cif'
  | 'currency'
  | 'quantity'
  | 'is_featured'
  | 'show_price'
  | 'stock_origin'
  | 'stock_status'
> & {
  categories: Pick<Category, 'name'> | null;
  part_photos: Array<Pick<PartPhoto, 'storage_path' | 'is_cover' | 'sort_order'>>;
  part_compatibility: Array<
    Pick<PartCompatibility, 'make' | 'model' | 'chassis_code' | 'year_from' | 'year_to'>
  >;
};

export type PublicVehicleCard = Pick<
  Vehicle,
  | 'id'
  | 'title'
  | 'slug'
  | 'make'
  | 'model'
  | 'year'
  | 'transmission'
  | 'fuel_type'
  | 'mileage'
  | 'operating_hours'
  | 'vehicle_class'
  | 'equipment_category'
  | 'price'
  | 'price_fob'
  | 'price_cf'
  | 'price_cif'
  | 'currency'
  | 'show_price'
  | 'is_featured'
  | 'stock_origin'
  | 'stock_pool'
  | 'stock_status'
> & {
  vehicle_photos: Array<
    Pick<VehiclePhoto, 'storage_path' | 'is_cover' | 'is_auction_sheet' | 'sort_order'>
  >;
};

export type PublicBlogCard = Pick<
  BlogPost,
  | 'id'
  | 'title'
  | 'slug'
  | 'excerpt'
  | 'featured_image'
  | 'is_featured'
  | 'published_at'
  | 'created_at'
> & {
  blog_categories: Pick<BlogCategory, 'id' | 'name' | 'slug'> | null;
};
