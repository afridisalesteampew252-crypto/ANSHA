export type PartCondition = 'new' | 'used' | 'refurbished' | 'for-parts';
export type InquiryStatus = 'new' | 'read' | 'responded' | 'closed';
export type AdminRole = 'admin' | 'staff';
export type StockOrigin = 'japan' | 'dubai' | 'singapore' | 'china' | 'thailand' | 'taiwan';
export type StockStatus = 'available' | 'reserved' | 'sold';

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Part {
  id: string;
  part_code: string;
  name: string;
  slug: string;
  category_id: string | null;
  brand: string | null;
  part_number: string | null;
  oem_number: string | null;
  condition: PartCondition;
  price: number | null;
  currency: string;
  quantity: number;
  location: string | null;
  description: string | null;
  is_published: boolean;
  is_featured: boolean;
  show_price: boolean;
  stock_origin: StockOrigin;
  stock_status: StockStatus;
  sold_at: string | null;
  sold_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PartPhoto {
  id: string;
  part_id: string;
  storage_path: string;
  is_cover: boolean;
  sort_order: number;
  created_at: string;
}

export interface PartCompatibility {
  id: string;
  part_id: string;
  make: string;
  model: string;
  variant: string | null;
  chassis_code: string | null;
  engine_code: string | null;
  year_from: number | null;
  year_to: number | null;
  created_at: string;
}

export interface Inquiry {
  id: string;
  part_id: string | null;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  message: string;
  status: InquiryStatus;
  created_at: string;
  updated_at: string;
}

export interface Vehicle {
  id: string;
  title: string;
  slug: string;
  make: string;
  model: string;
  variant: string | null;
  year: number | null;
  chassis_code: string | null;
  chassis_number: string | null;
  stock_number: string | null;
  engine_code: string | null;
  transmission: string | null;
  fuel_type: string | null;
  mileage: number | null;
  color: string | null;
  price: number | null;
  currency: string;
  show_price: boolean;
  description: string | null;
  location: string | null;
  is_published: boolean;
  is_featured: boolean;
  stock_origin: StockOrigin;
  stock_status: StockStatus;
  sold_at: string | null;
  sold_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface VehiclePhoto {
  id: string;
  vehicle_id: string;
  storage_path: string;
  is_cover: boolean;
  sort_order: number;
  created_at: string;
}

export interface VehicleWithPhotos extends Vehicle {
  vehicle_photos: VehiclePhoto[];
}

export interface AdminProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: AdminRole;
  avatar_url: string | null;
  created_at: string;
}

export interface Customer {
  id: string;
  customer_code: string;
  full_name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  country: string | null;
  address: string | null;
  notes: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ImportJob {
  id: string;
  import_type: 'parts_excel' | 'vehicles_excel' | 'parts_images_zip' | 'vehicles_images_zip';
  file_name: string;
  status: 'processing' | 'completed' | 'completed_with_errors' | 'failed';
  total_rows: number;
  successful_rows: number;
  failed_rows: number;
  created_by: string;
  error_summary: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface PartWithRelations extends Part {
  categories: Category | null;
  part_photos: PartPhoto[];
  part_compatibility: PartCompatibility[];
}

export type BlogPostStatus = 'draft' | 'published' | 'archived';
export type PartRequestStatus = 'new' | 'reviewed' | 'fulfilled' | 'closed';

export interface BlogCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  created_at: string;
}

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string | null;
  featured_image: string | null;
  category_id: string | null;
  author_id: string | null;
  status: BlogPostStatus;
  is_featured: boolean;
  meta_title: string | null;
  meta_description: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BlogPostWithCategory extends BlogPost {
  blog_categories: BlogCategory | null;
}

export interface PartRequest {
  id: string;
  customer_name: string;
  email: string | null;
  phone: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_year: string | null;
  part_name: string | null;
  part_number: string | null;
  message: string | null;
  status: PartRequestStatus;
  created_at: string;
  updated_at: string;
}

export interface Database {
  public: {
    Tables: {
      categories: {
        Row: Category;
        Insert: Partial<Category>;
        Update: Partial<Category>;
      };
      parts: {
        Row: Part;
        Insert: Partial<Part>;
        Update: Partial<Part>;
      };
      part_photos: {
        Row: PartPhoto;
        Insert: Partial<PartPhoto>;
        Update: Partial<PartPhoto>;
      };
      part_compatibility: {
        Row: PartCompatibility;
        Insert: Partial<PartCompatibility>;
        Update: Partial<PartCompatibility>;
      };
      inquiries: {
        Row: Inquiry;
        Insert: Partial<Inquiry>;
        Update: Partial<Inquiry>;
      };
      admin_profiles: {
        Row: AdminProfile;
        Insert: Partial<AdminProfile>;
        Update: Partial<AdminProfile>;
      };
      vehicles: {
        Row: Vehicle;
        Insert: Partial<Vehicle>;
        Update: Partial<Vehicle>;
      };
      vehicle_photos: {
        Row: VehiclePhoto;
        Insert: Partial<VehiclePhoto>;
        Update: Partial<VehiclePhoto>;
      };
      blog_categories: {
        Row: BlogCategory;
        Insert: Partial<BlogCategory>;
        Update: Partial<BlogCategory>;
      };
      blog_posts: {
        Row: BlogPost;
        Insert: Partial<BlogPost>;
        Update: Partial<BlogPost>;
      };
      part_requests: {
        Row: PartRequest;
        Insert: Partial<PartRequest>;
        Update: Partial<PartRequest>;
      };
      customers: {
        Row: Customer;
        Insert: Partial<Customer>;
        Update: Partial<Customer>;
      };
      import_jobs: {
        Row: ImportJob;
        Insert: Partial<ImportJob>;
        Update: Partial<ImportJob>;
      };
    };
  };
}
