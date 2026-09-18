export const CHAT_LINK_ENTITY_TYPES = [
  { value: 'vehicle', label: 'Vehicle', href: (id: string) => `/admin/vehicles/${id}` },
  { value: 'customer', label: 'Customer', href: (id: string) => `/admin/customers/${id}` },
  { value: 'inquiry', label: 'Inquiry', href: () => '/admin/inquiries' },
  { value: 'invoice', label: 'Invoice', href: (id: string) => `/admin/invoices/${id}` },
  { value: 'request', label: 'Request', href: (id: string) => `/admin/requests/${id}` },
] as const;

export type ChatLinkEntityType = (typeof CHAT_LINK_ENTITY_TYPES)[number]['value'];

export function chatLinkEntityLabel(value: string | null | undefined) {
  return CHAT_LINK_ENTITY_TYPES.find((item) => item.value === value)?.label || value || 'Record';
}

export function chatLinkHref(entityType: string, entityId: string) {
  const match = CHAT_LINK_ENTITY_TYPES.find((item) => item.value === entityType);
  return match ? match.href(entityId) : '/admin/chat';
}

export function chatFilterQuery(entityType: ChatLinkEntityType, entityId: string) {
  return `/admin/chat?${entityType}=${encodeURIComponent(entityId)}`;
}
