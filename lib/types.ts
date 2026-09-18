export type PartCondition = 'new' | 'used' | 'refurbished' | 'for-parts';
export type InquiryStatus = 'new' | 'read' | 'responded' | 'closed';
export type AdminRole = 'admin' | 'staff';
export type StockOrigin = 'japan' | 'dubai' | 'singapore' | 'china' | 'thailand' | 'taiwan';
export type StockStatus = 'available' | 'reserved' | 'sold';
export type LifecycleStage = 'unassigned' | 'auction' | 'yard' | 'port' | 'sold';
export type LifecycleEventType =
  | 'stage_change'
  | 'reauction'
  | 'yard_transfer'
  | 'export_request'
  | 'inspection'
  | 'export_certificate'
  | 'bl'
  | 'original_bl'
  | 'surrender_bl'
  | 'bl_amendment'
  | 'courier'
  | 'roro'
  | 'container_20ft'
  | 'container_40ft'
  | 'parts_shipping'
  | 'meter_reverse'
  | 'yard_images'
  | 'note';

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  image_url: string | null;
  meta_title: string | null;
  meta_description: string | null;
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
  meta_title: string | null;
  meta_description: string | null;
  search_keywords: string[];
  manufacturer_part_number: string | null;
  interchange_numbers: string[];
  superseded_part_numbers: string[];
  export_markets: string[];
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
  lifecycle_stage: LifecycleStage;
  meta_title: string | null;
  meta_description: string | null;
  search_keywords: string[];
  destination_markets: string[];
  shipping_methods: string[];
  created_at: string;
  updated_at: string;
}

export interface VehicleLifecycleEvent {
  id: string;
  vehicle_id: string;
  event_type: LifecycleEventType;
  from_stage: LifecycleStage | null;
  to_stage: LifecycleStage | null;
  title: string | null;
  notes: string | null;
  metadata: Json;
  created_by: string;
  created_at: string;
}

export type WorkspaceRequestType =
  | 'inquiry'
  | 'part_request'
  | 'bl'
  | 'inspection'
  | 'shipping'
  | 'other';

export type WorkspaceRequestStatus = 'open' | 'in_progress' | 'waiting' | 'done' | 'cancelled';

export type WorkspaceRequestEventType =
  | 'opened'
  | 'status_change'
  | 'assignment'
  | 'due_date'
  | 'note'
  | 'title_change'
  | 'attachment';

export interface WorkspaceRequest {
  id: string;
  request_type: WorkspaceRequestType;
  status: WorkspaceRequestStatus;
  title: string;
  notes: string | null;
  assigned_to: string | null;
  due_at: string | null;
  inquiry_id: string | null;
  part_request_id: string | null;
  vehicle_id: string | null;
  customer_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceRequestEvent {
  id: string;
  request_id: string;
  event_type: WorkspaceRequestEventType;
  from_status: WorkspaceRequestStatus | null;
  to_status: WorkspaceRequestStatus | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface WorkspaceRequestAttachment {
  id: string;
  request_id: string;
  event_id: string | null;
  uploaded_by: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
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
  tax_registration_number: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomerProfile {
  id: string;
  customer_id: string;
  email: string;
  full_name: string | null;
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

export interface ImportRow {
  id: number;
  import_job_id: string;
  row_number: number;
  record_key: string | null;
  status: 'success' | 'failed' | 'skipped';
  message: string | null;
  payload: Json;
  created_at: string;
}

export type ConversationType = 'direct' | 'group';

export interface ChatConversation {
  id: string;
  conversation_type: ConversationType;
  name: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type ChatLinkEntityType = 'vehicle' | 'customer' | 'inquiry' | 'invoice' | 'request';

export interface ChatConversationLink {
  id: string;
  conversation_id: string;
  entity_type: ChatLinkEntityType;
  entity_id: string;
  created_by: string;
  created_at: string;
}

export interface ChatParticipant {
  conversation_id: string;
  user_id: string;
  is_manager: boolean;
  joined_at: string;
  last_read_at: string | null;
  last_delivered_at: string | null;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  reply_to_id: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
}

export interface ChatAttachment {
  id: string;
  message_id: string;
  uploaded_by: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

export interface InternalMail {
  id: string;
  sender_id: string;
  subject: string;
  body: string;
  created_at: string;
}

export interface InternalMailRecipient {
  mail_id: string;
  recipient_id: string;
  recipient_type: 'to' | 'cc' | 'bcc';
  read_at: string | null;
  archived_at: string | null;
  deleted_at: string | null;
}

export interface InternalMailAttachment {
  id: string;
  mail_id: string;
  uploaded_by: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

export type NotificationType =
  | 'chat_message'
  | 'internal_mail'
  | 'inquiry'
  | 'part_request'
  | 'invoice'
  | 'remittance'
  | 'system';

export interface AdminNotification {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  notification_type: NotificationType;
  title: string;
  body: string | null;
  href: string | null;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
}

export type InvoiceDocumentType =
  | 'delivery_note'
  | 'tax_invoice'
  | 'proforma_invoice'
  | 'quotation'
  | 'purchase_invoice'
  | 'commercial_invoice';

export type InvoiceStatus = 'draft' | 'sent' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';
export type InvoiceProviderStatus = 'not_submitted' | 'queued' | 'accepted' | 'rejected';
export type PaymentMethod = 'cash' | 'bank_transfer' | 'card' | 'cheque' | 'other';
export type InventoryType = 'part' | 'vehicle';

export interface InvoiceCompanySettings {
  id: boolean;
  legal_name: string;
  trading_name: string;
  tax_registration_number: string;
  address: string;
  phone: string | null;
  email: string | null;
  default_currency: string;
  default_tax_rate: number;
  payment_terms: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface InvoiceSequence {
  fiscal_year: number;
  next_number: number;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  document_type: InvoiceDocumentType;
  customer_id: string | null;
  customer_name: string;
  customer_company: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  customer_tax_registration_number: string | null;
  seller_name: string;
  seller_tax_registration_number: string;
  seller_address: string;
  issue_date: string;
  due_date: string;
  currency: string;
  reference: string | null;
  status: InvoiceStatus;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  notes: string | null;
  terms: string | null;
  provider_name: string | null;
  provider_submission_id: string | null;
  provider_status: InvoiceProviderStatus;
  structured_payload: Json;
  reported_at: string | null;
  verification_code: string;
  verification_enabled: boolean;
  verification_issued_at: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  tax_rate: number;
  line_subtotal: number;
  line_discount: number;
  line_tax: number;
  line_total: number;
  sort_order: number;
  inventory_type: InventoryType | null;
  part_id: string | null;
  vehicle_id: string | null;
  inventory_reference: string | null;
  created_at: string;
}

export interface InvoicePayment {
  id: string;
  invoice_id: string;
  payment_date: string;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
}

export type RemittanceStatus = 'pending' | 'confirmed' | 'rejected' | 'reversed';
export type RemittanceMethod = 'bank_transfer' | 'cash' | 'card' | 'cheque' | 'remittance_company' | 'other';

export interface RemittanceSequence {
  fiscal_year: number;
  next_number: number;
}

export interface Remittance {
  id: string;
  remittance_number: string;
  customer_id: string | null;
  invoice_id: string | null;
  invoice_payment_id: string | null;
  customer_name: string;
  received_date: string;
  amount: number;
  currency: string;
  method: RemittanceMethod;
  bank_reference: string | null;
  sender_bank: string | null;
  receiving_bank: string | null;
  status: RemittanceStatus;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface RemittanceDocument {
  id: string;
  remittance_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string;
  created_at: string;
}

export interface RemittanceAllocation {
  id: string;
  remittance_id: string;
  invoice_id: string;
  invoice_payment_id: string;
  amount: number;
  created_by: string;
  created_at: string;
}

export interface SupplierInvoice {
  id: string;
  supplier_name: string;
  invoice_number: string | null;
  invoice_date: string;
  currency: string;
  total_amount: number;
  reference: string | null;
  notes: string | null;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

type TableDef<T> = {
  Row: T;
  Insert: Partial<T>;
  Update: Partial<T>;
};

export interface Database {
  public: {
    Tables: {
      admin_notifications: TableDef<AdminNotification>;
      admin_profiles: TableDef<AdminProfile>;
      blog_categories: TableDef<BlogCategory>;
      blog_posts: TableDef<BlogPost>;
      categories: TableDef<Category>;
      chat_attachments: TableDef<ChatAttachment>;
      chat_conversation_links: TableDef<ChatConversationLink>;
      chat_conversations: TableDef<ChatConversation>;
      chat_messages: TableDef<ChatMessage>;
      chat_participants: TableDef<ChatParticipant>;
      customers: TableDef<Customer>;
      customer_profiles: TableDef<CustomerProfile>;
      import_jobs: TableDef<ImportJob>;
      import_rows: TableDef<ImportRow>;
      inquiries: TableDef<Inquiry>;
      internal_mail: TableDef<InternalMail>;
      internal_mail_attachments: TableDef<InternalMailAttachment>;
      internal_mail_recipients: TableDef<InternalMailRecipient>;
      invoice_company_settings: TableDef<InvoiceCompanySettings>;
      invoice_items: TableDef<InvoiceItem>;
      invoice_payments: TableDef<InvoicePayment>;
      invoice_sequences: TableDef<InvoiceSequence>;
      invoices: TableDef<Invoice>;
      part_compatibility: TableDef<PartCompatibility>;
      part_photos: TableDef<PartPhoto>;
      part_requests: TableDef<PartRequest>;
      parts: TableDef<Part>;
      remittance_allocations: TableDef<RemittanceAllocation>;
      remittance_documents: TableDef<RemittanceDocument>;
      remittance_sequences: TableDef<RemittanceSequence>;
      remittances: TableDef<Remittance>;
      supplier_invoices: TableDef<SupplierInvoice>;
      vehicle_photos: TableDef<VehiclePhoto>;
      vehicle_lifecycle_events: TableDef<VehicleLifecycleEvent>;
      vehicles: TableDef<Vehicle>;
      workspace_request_attachments: TableDef<WorkspaceRequestAttachment>;
      workspace_request_events: TableDef<WorkspaceRequestEvent>;
      workspace_requests: TableDef<WorkspaceRequest>;
    };
  };
}
