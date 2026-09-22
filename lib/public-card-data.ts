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
  'id,name,slug,part_code,oem_number,brand,condition,price,price_fob,price_cf,price_cif,currency,quantity,is_featured,show_price,stock_origin,stock_status,categories(name),part_photos(storage_path,is_cover,sort_order),part_compatibility(make,model,chassis_code,year_from,year_to)';

export const PUBLIC_VEHICLE_CARD_SELECT =
  'id,title,slug,make,model,year,transmission,fuel_type,mileage,operating_hours,vehicle_class,equipment_category,price,price_fob,price_cf,price_cif,currency,show_price,is_featured,stock_origin,stock_pool,stock_status,vehicle_photos(storage_path,is_cover,is_auction_sheet,sort_order)';

export const PUBLIC_BLOG_CARD_SELECT =
  'id,title,slug,excerpt,featured_image,is_featured,published_at,created_at,blog_categories(id,name,slug)';

export type PublicCategoryCard = Pick<Category, 'id' | 'name' | 'slug' | 'image_url'>;

export type PublicPartCard = Pick<
  Part,
  | 'id'
  | 'name'
  | 'slug'
  | 'part_code'
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
