import type { MarketingCampaignPayload } from '@/lib/types';

/** Resolve the public path a campaign should deep-link to. */
export function campaignLinkUrl(payload: MarketingCampaignPayload | null | undefined): string {
  if (!payload) return '/offers';
  if (payload.blog_slug) return `/blog/${payload.blog_slug}`;
  if (payload.url) return String(payload.url);
  if (payload.href) return String(payload.href);
  if (payload.vehicle_id) return `/vehicles`; // slug resolved at send time when available
  if (payload.part_id) return `/parts`;
  return '/offers';
}

export function parseCountryList(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 40);
}
