export type PartCondition = 'new' | 'used' | 'refurbished' | 'for-parts';
export type InquiryStatus = 'new' | 'read' | 'responded' | 'closed';
export type AdminRole = 'admin' | 'staff' | 'sales' | 'freelancer' | 'manager' | 'accounts';
export type StockOrigin = 'japan' | 'dubai' | 'singapore' | 'china' | 'thailand' | 'taiwan';
export type StockPool = 'owned' | 'auction_third_party';
export type StockStatus = 'available' | 'reserved' | 'sold';
export type VehicleClass = 'passenger' | 'commercial_truck' | 'heavy_machinery';
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
  /** FOB sell quote in catalog currency. */
  price_fob: number | null;
  /** C&F (CFR) sell quote in catalog currency. */
  price_cf: number | null;
  /** CIF sell quote in catalog currency. */
  price_cif: number | null;
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
  purchase_price: number | null;
  purchase_currency: string | null;
  purchase_date: string | null;
  supplier_id: string | null;
  supplier_invoice_id: string | null;
  landed_cost: number | null;
  reserved_customer_id: string | null;
  reserved_by: string | null;
  reservation_price_term: 'fob' | 'cf' | 'cif' | null;
  reservation_shipment_term: 'dhl' | 'roro' | 'container_20ft' | 'container_40ft' | null;
  /** Whether inspection is required for the active reservation; cleared on release. */
  reservation_inspection_required: boolean | null;
  reservation_vat_applicable: boolean | null;
  reservation_etd: string | null;
  reservation_eta: string | null;
  reservation_requester_name: string | null;
  reservation_requester_role: 'sales' | 'freelancer' | 'manager' | 'admin' | null;
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
  /** Meter hours for heavy equipment; prefer over mileage when set. */
  operating_hours: number | null;
  color: string | null;
  /** passenger | commercial_truck | heavy_machinery */
  vehicle_class: VehicleClass;
  /** Optional subtype e.g. excavator, dump_truck */
  equipment_category: string | null;
  price: number | null;
  /** FOB sell quote in catalog currency. */
  price_fob: number | null;
  /** C&F (CFR) sell quote in catalog currency. */
  price_cf: number | null;
  /** CIF sell quote in catalog currency. */
  price_cif: number | null;
  currency: string;
  show_price: boolean;
  description: string | null;
  location: string | null;
  is_published: boolean;
  is_featured: boolean;
  stock_origin: StockOrigin;
  /** owned = purchased inventory; auction_third_party = third-party auction/yard listings. */
  stock_pool: StockPool;
  stock_status: StockStatus;
  sold_at: string | null;
  sold_by: string | null;
  lifecycle_stage: LifecycleStage;
  purchase_price: number | null;
  purchase_currency: string | null;
  purchase_date: string | null;
  supplier_id: string | null;
  supplier_invoice_id: string | null;
  landed_cost: number | null;
  reserved_customer_id: string | null;
  /** Admin who reserved; field agents only see own reserved units. */
  reserved_by: string | null;
  /** Incoterm on active reservation: FOB / C&F / CIF. */
  reservation_price_term: 'fob' | 'cf' | 'cif' | null;
  /** Shipment mode on active reservation (same as export_shipments.mode). */
  reservation_shipment_term: 'dhl' | 'roro' | 'container_20ft' | 'container_40ft' | null;
  /** Whether inspection is required for the active reservation; cleared on release. */
  reservation_inspection_required: boolean | null;
  /** Whether VAT applies on the reservation proforma; cleared on release. */
  reservation_vat_applicable: boolean | null;
  reservation_etd: string | null;
  reservation_eta: string | null;
  reservation_requester_name: string | null;
  reservation_requester_role: 'sales' | 'freelancer' | 'manager' | 'admin' | null;
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


export interface VehicleLifecycleEventAttachment {
  id: string;
  event_id: string;
  vehicle_id: string;
  uploaded_by: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
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
  is_auction_sheet: boolean;
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
  is_active: boolean;
  /** Present after phase_60 presence migration; null/undefined when never seen. */
  last_seen_at?: string | null;
  /**
   * Phase 66: stock_origin values a manager may see/manage.
   * Empty array = no inventory access. Ignored for non-manager roles.
   */
  allowed_stock_origins?: StockOrigin[] | string[] | null;
  /** Phase 70: default remittance collection office (Users UI). */
  office_id?: string | null;
  /** Phase 70: default remittance desk shift (Users UI). */
  shift_id?: string | null;
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
  owner_id: string | null;
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

export interface Review {
  id: string;
  name: string;
  role: string | null;
  location: string | null;
  quote: string;
  rating: number;
  sort_order: number;
  is_published: boolean;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  notify_insights: boolean;
  notify_deals: boolean;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
}

export interface SiteOffer {
  id: string;
  title: string;
  summary: string | null;
  href: string;
  vehicle_id: string | null;
  part_id: string | null;
  discount_percent: number | null;
  sale_price: number | null;
  is_published: boolean;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}


/** Phase 49 — marketing campaign records (ops-only MVP). Phase 66 adds audience + links + sent_count. */
export type MarketingCampaignChannel = 'push' | 'email' | 'offer';
export type MarketingCampaignStatus = 'draft' | 'scheduled' | 'sent';

export type MarketingCampaignPayload = {
  topic?: string;
  title?: string;
  body?: string;
  url?: string;
  to_email?: string;
  subject?: string;
  offer_id?: string;
  offer_title?: string;
  summary?: string | null;
  href?: string;
  /** Audience: customer countries (email segment). */
  audience_countries?: string[];
  /** Audience hint: stock origins featured in link / copy (not a separate subscriber list). */
  audience_stock_origins?: string[];
  blog_post_id?: string;
  blog_slug?: string;
  blog_title?: string;
  vehicle_id?: string;
  vehicle_title?: string;
  part_id?: string;
  part_name?: string;
  [key: string]: unknown;
};

export interface MarketingCampaign {
  id: string;
  name: string;
  channel: MarketingCampaignChannel;
  status: MarketingCampaignStatus;
  payload: MarketingCampaignPayload;
  sent_at: string | null;
  /** Phase 66: successful delivery count (devices or emails). No open tracking. */
  sent_count?: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}



export type WhatsAppMessageDirection = 'outbound' | 'inbound';
export type WhatsAppMessageKind = 'text' | 'template';
export type WhatsAppMessageStatus = 'pending' | 'sent' | 'failed' | 'delivered' | 'read';

export interface WhatsAppMessageLog {
  id: string;
  direction: WhatsAppMessageDirection;
  message_type: WhatsAppMessageKind;
  to_phone: string;
  customer_id: string | null;
  template_name: string | null;
  body: string | null;
  wa_message_id: string | null;
  status: WhatsAppMessageStatus;
  error_message: string | null;
  raw_response: Record<string, unknown> | null;
  sent_by: string | null;
  created_at: string;
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
  last_message_at: string | null;
  last_message_preview: string | null;
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
  | 'system'
  | 'request_due';

export type WorkspaceRequestDueReminderKind = 'due_soon' | 'overdue';

export interface WorkspaceRequestDueReminder {
  id: string;
  request_id: string;
  assignee_id: string;
  due_at_snapshot: string;
  kind: WorkspaceRequestDueReminderKind;
  notified_at: string;
}

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
  /** Document Incoterm shown on print/PDF. */
  price_term: 'fob' | 'cf' | 'cif' | null;
  /** Document shipment mode shown on print/PDF. */
  shipment_term: 'dhl' | 'roro' | 'container_20ft' | 'container_40ft' | null;
  /** When false, VAT is not applied (line tax rates should be 0). */
  vat_applicable: boolean;
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
  /** Optional Incoterm for this line when priced from a catalog quote. */
  price_term: 'fob' | 'cf' | 'cif' | null;
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

export type RemittanceStatus = 'pending' | 'confirmed' | 'rejected' | 'reversed' | 'unknown';
export type RemittanceMethod = 'bank_transfer' | 'cash' | 'card' | 'cheque' | 'remittance_company' | 'other';

export interface RemittanceSequence {
  fiscal_year: number;
  next_number: number;
}

/** Phase 70 — office picklist for user profiles + remittance tagging/dashboard */
export interface RemittanceOffice {
  id: string;
  name: string;
  code: string | null;
  is_active: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Phase 70 — shift picklist for user profiles + remittance tagging */
export interface RemittanceShift {
  id: string;
  name: string;
  office_id: string | null;
  hours_label: string | null;
  is_active: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
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
  /** Staff tagged as receiver — can view via My remittances */
  received_by: string | null;
  office_id: string | null;
  shift_id: string | null;
  is_unknown: boolean;
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
  supplier_id: string | null;
  purchase_order_id: string | null;
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

export interface Supplier {
  id: string;
  supplier_code: string;
  name: string;
  trn: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  currency: string;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventoryReceipt {
  id: string;
  receipt_number: string;
  received_date: string;
  supplier_id: string | null;
  supplier_invoice_id: string | null;
  purchase_order_id: string | null;
  currency: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventoryReceiptLine {
  id: string;
  receipt_id: string;
  inventory_type: 'part' | 'vehicle';
  part_id: string | null;
  vehicle_id: string | null;
  quantity: number;
  unit_cost: number;
  notes: string | null;
  purchase_order_line_id: string | null;
  created_at: string;
}

export type PurchaseOrderStatus = 'draft' | 'ordered' | 'cancelled';
export type PurchaseOrderMatchStatus =
  | 'open'
  | 'partially_received'
  | 'received'
  | 'invoiced'
  | 'matched'
  | 'partially_paid'
  | 'paid'
  | 'cancelled';

export interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_id: string;
  order_date: string;
  currency: string;
  vat_rate: number;
  terms: string | null;
  notes: string | null;
  status: PurchaseOrderStatus;
  amount_ordered: number;
  amount_received: number;
  amount_invoiced: number;
  amount_paid: number;
  qty_ordered: number;
  qty_received: number;
  match_status: PurchaseOrderMatchStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderLine {
  id: string;
  purchase_order_id: string;
  description: string;
  inventory_type: 'part' | 'vehicle' | null;
  part_id: string | null;
  vehicle_id: string | null;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  sort_order: number;
  notes: string | null;
  created_at: string;
}

export type SupplierPaymentStatus = 'pending' | 'confirmed' | 'rejected' | 'reversed';
export type SupplierPaymentMethod =
  | 'bank_transfer'
  | 'cash'
  | 'card'
  | 'cheque'
  | 'remittance_company'
  | 'other';

export interface SupplierPayment {
  id: string;
  payment_number: string;
  supplier_id: string;
  paid_date: string;
  amount: number;
  currency: string;
  method: SupplierPaymentMethod;
  bank_reference: string | null;
  status: SupplierPaymentStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupplierPaymentAllocation {
  id: string;
  payment_id: string;
  purchase_order_id: string | null;
  supplier_invoice_id: string | null;
  amount: number;
  created_by: string | null;
  created_at: string;
}

export type ExportShipmentStatus =
  | 'draft'
  | 'booked'
  | 'loaded'
  | 'sailed'
  | 'arrived'
  | 'completed'
  | 'cancelled';

export type ExportShipmentMode = 'dhl' | 'roro' | 'container_20ft' | 'container_40ft';

export type ExportShipmentDocType =
  | 'bill_of_lading'
  | 'export_certificate'
  | 'waybill'
  | 'courier'
  | 'inspection_certificate'
  | 'surrendered_bl';

export interface ExportShipment {
  id: string;
  shipment_number: string;
  status: ExportShipmentStatus;
  mode: ExportShipmentMode;
  customer_id: string | null;
  destination_country: string | null;
  loading_port: string | null;
  destination_port: string | null;
  bl_number: string | null;
  vessel_name: string | null;
  voyage_no: string | null;
  booking_ref: string | null;
  etd: string | null;
  eta: string | null;
  notes: string | null;
  workspace_request_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExportShipmentVehicle {
  id: string;
  export_shipment_id: string;
  vehicle_id: string;
  sort_order: number;
  notes: string | null;
  created_at: string;
}

export interface ExportShipmentPart {
  id: string;
  export_shipment_id: string;
  part_id: string;
  quantity: number;
  sort_order: number;
  notes: string | null;
  created_at: string;
}

export interface ExportShipmentDocument {
  id: string;
  export_shipment_id: string;
  doc_type: ExportShipmentDocType;
  country_code: string | null;
  country_name: string | null;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
}

/** Phase 36 Ã¢â‚¬" UAE VAT return pack (reporting-first). */
export interface VatReturnLine {
  source: string;
  side: 'output' | 'input';
  id: string;
  reference: string;
  document_type: string;
  party: string;
  trn: string | null;
  doc_date: string;
  currency: string;
  taxable_amount: number;
  vat_amount: number;
  gross_amount: number;
  vat_rate: number;
  status: string | null;
  purchase_order_id?: string | null;
}

export interface VatReturnCurrencyRollup {
  currency: string;
  output_taxable: number;
  output_vat: number;
  input_taxable: number;
  input_vat: number;
  net_payable: number;
  output_line_count: number;
  input_line_count: number;
}

export interface VatReturnSummary {
  period: { from: string; to: string };
  assumptions: {
    default_vat_rate: number;
    output_document_types: string[];
    input_customer_document_types: string[];
    supplier_vat_basis: string;
    supplier_rate_source: string;
    excluded_statuses: string[];
    excluded_document_types: string[];
    fx: string;
    gl_postings: boolean;
  };
  by_currency: VatReturnCurrencyRollup[];
  kpis: {
    currency: string;
    output_taxable: number;
    output_vat: number;
    input_taxable: number;
    input_vat: number;
    net_payable: number;
    output_line_count: number;
    input_line_count: number;
  };
  output_lines: VatReturnLine[];
  input_lines: VatReturnLine[];
}

export interface VatReturnPeriod {
  id: string;
  period_from: string;
  period_to: string;
  label: string | null;
  notes: string | null;
  currency_focus: string;
  snapshot: VatReturnSummary | Json;
  created_by: string | null;
  created_at: string;
}

/** Phase 33 Ã¢â‚¬" import landed-cost pack (freight/duty/charges rolled into stock). */
export type LandedCostPackStatus = 'draft' | 'posted' | 'cancelled';
export type LandedCostChargeType = 'freight' | 'duty' | 'insurance' | 'handling' | 'other';
export type LandedCostAllocationMethod = 'equal' | 'purchase_value' | 'manual';

export interface LandedCostPack {
  id: string;
  pack_number: string;
  status: LandedCostPackStatus;
  pack_date: string;
  currency: string;
  allocation_method: LandedCostAllocationMethod;
  supplier_id: string | null;
  purchase_order_id: string | null;
  inventory_receipt_id: string | null;
  supplier_invoice_id: string | null;
  notes: string | null;
  total_charges: number;
  posted_at: string | null;
  posted_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LandedCostCharge {
  id: string;
  pack_id: string;
  charge_type: LandedCostChargeType;
  description: string | null;
  amount: number;
  supplier_id: string | null;
  sort_order: number;
  created_at: string;
}

export interface LandedCostAllocation {
  id: string;
  pack_id: string;
  inventory_type: 'vehicle' | 'part';
  vehicle_id: string | null;
  part_id: string | null;
  allocated_amount: number;
  purchase_basis: number | null;
  created_at: string;
}

/** Phase 34 - ops bank ledger (not the public /banking page). */
export type BankTxnDirection = 'in' | 'out';

export interface BankAccount {
  id: string;
  account_code: string;
  name: string;
  bank_name: string;
  currency: string;
  iban: string | null;
  account_number: string | null;
  opening_balance: number;
  opening_balance_date: string | null;
  is_active: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BankTransaction {
  id: string;
  txn_number: string;
  bank_account_id: string;
  txn_date: string;
  amount: number;
  direction: BankTxnDirection;
  description: string | null;
  reference: string | null;
  is_reconciled: boolean;
  reconciled_at: string | null;
  reconciled_by: string | null;
  remittance_id: string | null;
  supplier_payment_id: string | null;
  expense_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Phase 50 - feed readiness placeholders (not live Open Banking). */
export type BankFeedStatus = 'manual' | 'pending_provider';

export interface BankFeedConnection {
  id: string;
  bank_account_id: string | null;
  label: string;
  provider: string | null;
  status: BankFeedStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Phase 35 Ã¢â‚¬" operating expenses (not payroll). */
export type ExpenseStatus = 'draft' | 'posted' | 'cancelled';
export type ExpensePaymentMethod =
  | 'bank_transfer'
  | 'cash'
  | 'card'
  | 'cheque'
  | 'remittance_company'
  | 'other';

export interface ExpenseCategory {
  id: string;
  code: string;
  name: string;
  description: string | null;
  gl_account_hint: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Expense {
  id: string;
  expense_number: string;
  expense_date: string;
  amount: number;
  currency: string;
  category_id: string;
  payee: string | null;
  payment_method: ExpensePaymentMethod;
  bank_account_id: string | null;
  bank_reference: string | null;
  notes: string | null;
  status: ExpenseStatus;
  posted_at: string | null;
  posted_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Phase 37 Ã¢â‚¬" payroll / leave / EOS MVP (ops-only). */
export type EmployeeStatus = 'active' | 'inactive' | 'terminated';
export type LeaveType = 'annual' | 'sick' | 'unpaid' | 'other';
export type LeaveRequestStatus = 'pending' | 'approved' | 'rejected';
export type PayrollRunStatus = 'draft' | 'posted' | 'cancelled';
export type EosSeparationType = 'resignation' | 'termination';

export interface Employee {
  id: string;
  admin_profile_id: string | null;
  full_name: string;
  join_date: string;
  basic_salary: number;
  currency: string;
  status: EmployeeStatus;
  bank_account_id: string | null;
  leave_balance_days: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeaveRequest {
  id: string;
  employee_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  days: number | null;
  status: LeaveRequestStatus;
  notes: string | null;
  deducted_from_balance: boolean;
  decided_by: string | null;
  decided_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Persisted indicative EOS calculator run (Phase 48). Not legal advice. */
export interface EosEstimateLog {
  id: string;
  employee_id: string;
  as_of_date: string;
  separation_type: EosSeparationType;
  basic_salary: number;
  currency: string;
  days_of_service: number;
  years_of_service: number;
  daily_wage: number;
  entitlement_days: number;
  mode_multiplier: number;
  estimate_amount: number;
  formula: string;
  inputs: Record<string, unknown>;
  result: Record<string, unknown>;
  disclaimer: string;
  created_by: string | null;
  created_at: string;
}

export interface PayrollRun {
  id: string;
  run_number: string;
  status: PayrollRunStatus;
  period_start: string;
  period_end: string;
  currency: string;
  notes: string | null;
  bank_account_id: string | null;
  total_basic: number;
  total_allowances: number;
  total_deductions: number;
  total_net: number;
  posted_at: string | null;
  posted_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayrollLine {
  id: string;
  payroll_run_id: string;
  employee_id: string;
  basic_salary: number;
  allowances: number;
  deductions: number;
  net_pay: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}


/** Phase 39 — outbound transactional email send log. */
export type OutboundEmailStatus = 'sent' | 'failed';

export interface OutboundEmailLog {
  id: string;
  to_email: string;
  subject: string;
  body_preview: string;
  status: OutboundEmailStatus;
  provider: string;
  provider_message_id: string | null;
  error_message: string | null;
  related_invoice_id: string | null;
  created_by: string | null;
  created_at: string;
}

/** Phase 38 Ã¢â‚¬" general ledger chart, journals, financial statements. */
export type GlAccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
export type GlJournalStatus = 'draft' | 'posted' | 'reversed';
export type GlSourceModule =
  | 'manual'
  | 'invoice'
  | 'remittance'
  | 'supplier_payment'
  | 'bank'
  | 'expense'
  | 'landed_cost'
  | 'other';

export interface GlAccount {
  id: string;
  code: string;
  name: string;
  account_type: GlAccountType;
  is_active: boolean;
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface GlJournal {
  id: string;
  journal_number: string;
  status: GlJournalStatus;
  entry_date: string;
  description: string | null;
  currency: string;
  total_debit: number;
  total_credit: number;
  posted_at: string | null;
  posted_by: string | null;
  reversed_at: string | null;
  reversed_by: string | null;
  reverses_journal_id: string | null;
  reversed_by_journal_id: string | null;
  source_module: GlSourceModule | null;
  source_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface GlJournalLine {
  id: string;
  journal_id: string;
  account_id: string;
  line_no: number;
  description: string | null;
  debit: number;
  credit: number;
  created_at: string;
}

export interface GlTrialBalanceRow {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: GlAccountType;
  total_debit: number;
  total_credit: number;
  balance: number;
}

export interface GlProfitAndLossRow {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: 'revenue' | 'expense';
  amount: number;
}

export interface GlBalanceSheetRow {
  section: 'assets' | 'liabilities' | 'equity';
  account_id: string | null;
  account_code: string;
  account_name: string;
  account_type: GlAccountType;
  amount: number;
}

/** Phase 42 Ã¢â‚¬" ops AI assistant chat history. */
export interface AiChatThread {
  id: string;
  title: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface AiChatMessage {
  id: string;
  thread_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_by: string | null;
  created_at: string;
}

type TableDef<T> = {
  Row: T;
  Insert: Partial<T>;
  Update: Partial<T>;
};


/** Phase 43 - append-only ops audit trail. */
export interface AuditLog {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type OfficeShift = 'morning' | 'night';
export type AttendanceStatus = 'present' | 'absent' | 'leave' | 'remote';

/** Phase 58 — Tawk webhook mirror for admin Live chat */
export interface TawkChatSession {
  id: string;
  chat_id: string;
  property_id: string | null;
  status: 'open' | 'ended';
  visitor_name: string | null;
  visitor_email: string | null;
  visitor_city: string | null;
  visitor_country: string | null;
  domain: string | null;
  referrer: string | null;
  first_message: string | null;
  started_at: string;
  ended_at: string | null;
  last_event_at: string;
  dismissed_at: string | null;
  last_hook_event_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TawkTicketEvent {
  id: string;
  ticket_id: string;
  human_id: number | null;
  subject: string | null;
  message_preview: string | null;
  requester_name: string | null;
  requester_email: string | null;
  property_id: string | null;
  event_time: string;
  hook_event_id: string | null;
  dismissed_at: string | null;
  created_at: string;
}

export interface TawkWebhookReceipt {
  hook_event_id: string;
  event_type: string;
  received_at: string;
}

/** Phase 54 — HR workforce */
export interface ShiftLocation {
  id: string;
  country: string;
  city: string | null;
  office_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ShiftAssignment {
  id: string;
  user_id: string;
  location_id: string;
  shift: OfficeShift;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceRecord {
  id: string;
  user_id: string;
  assignment_id: string | null;
  work_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  status: AttendanceStatus;
  notes: string | null;
  recorded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Database {
  public: {
    Tables: {
      admin_notifications: TableDef<AdminNotification>;
      admin_profiles: TableDef<AdminProfile>;
      attendance_records: TableDef<AttendanceRecord>;
      audit_logs: TableDef<AuditLog>;
      ai_chat_messages: TableDef<AiChatMessage>;
      ai_chat_threads: TableDef<AiChatThread>;
      bank_accounts: TableDef<BankAccount>;
      bank_feed_connections: TableDef<BankFeedConnection>;
      bank_transactions: TableDef<BankTransaction>;
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
      employees: TableDef<Employee>;
      eos_estimate_logs: TableDef<EosEstimateLog>;
      expense_categories: TableDef<ExpenseCategory>;
      expenses: TableDef<Expense>;
      export_master_options: TableDef<import('./export-masters').ExportMasterOption>;
      export_shipment_documents: TableDef<ExportShipmentDocument>;
      export_shipment_parts: TableDef<ExportShipmentPart>;
      export_shipment_vehicles: TableDef<ExportShipmentVehicle>;
      export_shipments: TableDef<ExportShipment>;
      gl_accounts: TableDef<GlAccount>;
      gl_journal_lines: TableDef<GlJournalLine>;
      gl_journals: TableDef<GlJournal>;
      import_jobs: TableDef<ImportJob>;
      import_rows: TableDef<ImportRow>;
      inquiries: TableDef<Inquiry>;
      inventory_receipt_lines: TableDef<InventoryReceiptLine>;
      inventory_receipts: TableDef<InventoryReceipt>;
      internal_mail: TableDef<InternalMail>;
      internal_mail_attachments: TableDef<InternalMailAttachment>;
      internal_mail_recipients: TableDef<InternalMailRecipient>;
      invoice_company_settings: TableDef<InvoiceCompanySettings>;
      invoice_items: TableDef<InvoiceItem>;
      invoice_payments: TableDef<InvoicePayment>;
      invoice_sequences: TableDef<InvoiceSequence>;
      invoices: TableDef<Invoice>;
      landed_cost_allocations: TableDef<LandedCostAllocation>;
      landed_cost_charges: TableDef<LandedCostCharge>;
      landed_cost_packs: TableDef<LandedCostPack>;
      leave_requests: TableDef<LeaveRequest>;
      marketing_campaigns: TableDef<MarketingCampaign>;
      outbound_email_log: TableDef<OutboundEmailLog>;
      part_compatibility: TableDef<PartCompatibility>;
      part_photos: TableDef<PartPhoto>;
      part_requests: TableDef<PartRequest>;
      parts: TableDef<Part>;
      payroll_lines: TableDef<PayrollLine>;
      payroll_runs: TableDef<PayrollRun>;
      purchase_order_lines: TableDef<PurchaseOrderLine>;
      purchase_orders: TableDef<PurchaseOrder>;
      push_subscriptions: TableDef<PushSubscriptionRow>;
      remittance_allocations: TableDef<RemittanceAllocation>;
      remittance_documents: TableDef<RemittanceDocument>;
      remittance_offices: TableDef<RemittanceOffice>;
      remittance_sequences: TableDef<RemittanceSequence>;
      remittance_shifts: TableDef<RemittanceShift>;
      remittances: TableDef<Remittance>;
      reviews: TableDef<Review>;
      shift_assignments: TableDef<ShiftAssignment>;
      shift_locations: TableDef<ShiftLocation>;
      site_offers: TableDef<SiteOffer>;
      supplier_invoices: TableDef<SupplierInvoice>;
      supplier_payment_allocations: TableDef<SupplierPaymentAllocation>;
      supplier_payments: TableDef<SupplierPayment>;
      suppliers: TableDef<Supplier>;
      tawk_chat_sessions: TableDef<TawkChatSession>;
      tawk_ticket_events: TableDef<TawkTicketEvent>;
      tawk_webhook_receipts: TableDef<TawkWebhookReceipt>;
      vehicle_photos: TableDef<VehiclePhoto>;
      vehicle_lifecycle_event_attachments: TableDef<VehicleLifecycleEventAttachment>;
      vehicle_lifecycle_events: TableDef<VehicleLifecycleEvent>;
      vehicles: TableDef<Vehicle>;
      vat_return_periods: TableDef<VatReturnPeriod>;
      whatsapp_message_log: TableDef<WhatsAppMessageLog>;
      workspace_request_attachments: TableDef<WorkspaceRequestAttachment>;
      workspace_request_due_reminders: TableDef<WorkspaceRequestDueReminder>;
      workspace_request_events: TableDef<WorkspaceRequestEvent>;
      workspace_requests: TableDef<WorkspaceRequest>;
    };
  };
}
