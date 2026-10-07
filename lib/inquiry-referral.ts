/** Browser attribution is a convenience; the inquiry RPC validates every referral server-side. */
export const REFERRAL_STORAGE_KEY = 'ansha-inquiry-referral';
export const REFERRAL_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export type InquiryReferralRecord = { code: string; capturedAt: number };
export type InquiryReferralStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function normalizeInquiryReferralCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toLowerCase();
  return /^[a-z0-9_-]{8,80}$/.test(code) ? code : null;
}

export function readInquiryReferralRecord(raw: string | null | undefined, now = Date.now()): InquiryReferralRecord | null {
  if (!raw || !Number.isFinite(now)) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    const code = normalizeInquiryReferralCode(record.code);
    const capturedAt = record.capturedAt;
    if (!code || typeof capturedAt !== 'number' || !Number.isFinite(capturedAt)
      || capturedAt < 0 || capturedAt > now || now - capturedAt >= REFERRAL_WINDOW_MS) return null;
    return { code, capturedAt };
  } catch { return null; }
}

export function getInquiryReferral(storage: InquiryReferralStorage, now = Date.now()): string | null {
  try {
    const raw = storage.getItem(REFERRAL_STORAGE_KEY);
    const stored = readInquiryReferralRecord(raw, now);
    if (raw && !stored) storage.removeItem(REFERRAL_STORAGE_KEY);
    return stored?.code || null;
  } catch { return null; }
}

/** Keep the first browser referral without extending its original 30-day window. */
export function captureInquiryReferral(value: unknown, storage: InquiryReferralStorage, now = Date.now()): string | null {
  const first = getInquiryReferral(storage, now);
  if (first) return first;
  const code = normalizeInquiryReferralCode(value);
  if (!code || !Number.isFinite(now) || now < 0) return null;
  try { storage.setItem(REFERRAL_STORAGE_KEY, JSON.stringify({ code, capturedAt: now })); } catch { /* Private mode may prevent persistence. */ }
  return code;
}

export function getBrowserInquiryReferral(): string | null {
  if (typeof window === 'undefined') return null;
  const code = new URLSearchParams(window.location.search).get('ref');
  try { return captureInquiryReferral(code, window.localStorage); }
  catch { return normalizeInquiryReferralCode(code); }
}

export function validateInquiryContact(email: string, phone: string): string | null {
  const cleanEmail = email.trim(); const cleanPhone = phone.trim();
  if (cleanEmail && (cleanEmail.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail))) {
    return 'Please enter a valid email address.';
  }
  if (cleanPhone) {
    const digits = cleanPhone.replace(/\D/g, '');
    if (cleanPhone.length > 40 || !/^[+0-9 ().-]+$/.test(cleanPhone) || digits.length < 7 || digits.length > 20) {
      return 'Please enter a valid phone number, including your country code.';
    }
  }
  return cleanEmail || cleanPhone ? null : 'Please provide a phone number or email address so we can contact you.';
}

export type SalesInquiryInput = {
  name: string; email?: string; phone?: string; message: string;
  partId?: string | null; vehicleId?: string | null; source?: 'website' | 'mobile' | 'portal';
};

/** No introducer or customer-profile ID is accepted: those identities are resolved by the RPC. */
export function buildSalesInquiryParams(input: SalesInquiryInput, referralCode: string | null = null) {
  const email = input.email || ''; const phone = input.phone || '';
  const contactError = validateInquiryContact(email, phone);
  if (contactError) throw new Error(contactError);
  const name = input.name.trim(); const message = input.message.trim();
  if (!name || !message) throw new Error('Please fill in your name and message.');
  if (name.length > 120 || message.length > 5000) throw new Error('Please shorten your name or message.');
  if (input.partId && input.vehicleId) throw new Error('Choose one vehicle or part for this inquiry.');
  const source = input.source || 'website';
  if (!['website', 'mobile', 'portal'].includes(source)) throw new Error('Invalid inquiry source.');
  return {
    p_customer_name: name, p_customer_email: email.trim() || null, p_customer_phone: phone.trim() || null,
    p_message: message, p_part_id: input.partId || null, p_vehicle_id: input.vehicleId || null,
    p_referral_code: normalizeInquiryReferralCode(referralCode), p_source: source,
  };
}

export type SalesInquiryReceipt = { id: string; inquiry_number: string };
export function parseSalesInquiryReceipt(value: unknown): SalesInquiryReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Inquiry confirmation was not received.');
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(record.id)
    || typeof record.inquiry_number !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(record.inquiry_number)) {
    throw new Error('Inquiry confirmation was not received.');
  }
  return { id: record.id, inquiry_number: record.inquiry_number };
}

type SalesInquiryClient = {
  rpc: (name: string, args: ReturnType<typeof buildSalesInquiryParams>) => PromiseLike<{
    data: unknown; error: { message?: string; hint?: string | null } | null;
  }>;
};

export async function submitSalesInquiry(
  client: SalesInquiryClient, input: SalesInquiryInput, referralCode = getBrowserInquiryReferral()
): Promise<SalesInquiryReceipt> {
  const { data, error } = await client.rpc('submit_sales_inquiry', buildSalesInquiryParams(input, referralCode));
  if (error) throw error;
  return parseSalesInquiryReceipt(data);
}
