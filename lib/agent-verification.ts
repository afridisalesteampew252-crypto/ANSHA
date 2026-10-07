export const AGENT_VERIFICATION_STATUSES = ['pending', 'verified', 'rejected', 'suspended'] as const;
export type AgentVerificationStatus = typeof AGENT_VERIFICATION_STATUSES[number];

export type SalesAgentVerification = {
  agent_id: string;
  full_name: string;
  email: string;
  phone: string;
  role: 'sales' | 'freelancer';
  is_active: boolean;
  verification_status: AgentVerificationStatus;
  referral_code: string | null;
  reviewed_at: string | null;
  review_note: string | null;
};

export type SalesAgentContact = { full_name: string; email: string; phone: string };

export const AGENT_VERIFICATION_LABEL: Record<AgentVerificationStatus, string> = {
  pending: 'Awaiting admin review',
  verified: 'Verified by admin',
  rejected: 'Contact rejected',
  suspended: 'Suspended',
};

export function normalizeSalesAgentContact(contact: SalesAgentContact): SalesAgentContact {
  return {
    full_name: contact.full_name.trim(),
    email: contact.email.trim().toLowerCase(),
    phone: contact.phone.trim().replace(/[ ().-]/g, ''),
  };
}

export function validateSalesAgentContact(contact: SalesAgentContact): string | null {
  const normalized = normalizeSalesAgentContact(contact);
  if (normalized.full_name.length < 2 || normalized.full_name.length > 160) return 'Enter a full name between 2 and 160 characters.';
  if (normalized.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)) return 'Enter a valid contact email.';
  const rawPhone = contact.phone.trim();
  if (rawPhone.length > 40 || !/^\+?[0-9 ().-]+$/.test(rawPhone) || !/^\+?[0-9]{7,15}$/.test(normalized.phone)) return 'Enter a contact phone with 7 to 15 digits, including the country code.';
  return null;
}

export function canShareAgentReferral(agent: SalesAgentVerification): boolean {
  return ['sales', 'freelancer'].includes(agent.role) && agent.is_active === true && agent.verification_status === 'verified' &&
    /^[a-f0-9]{32}$/.test(agent.referral_code || '');
}

export function salesAgentReferralUrl(agent: SalesAgentVerification, origin: string): string | null {
  if (!canShareAgentReferral(agent)) return null;
  try {
    const url = new URL('/', origin);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    url.searchParams.set('ref', agent.referral_code!);
    return url.toString();
  } catch { return null; }
}
