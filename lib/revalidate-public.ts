/**
 * Fire-and-forget request to refresh cached public pages after a staff edit.
 * Failures are ignored: pages also revalidate on a timer (see detail page `revalidate`).
 */
export function requestPublicRevalidation(
  kind: 'vehicle' | 'part',
  slugs: Array<string | null | undefined>
): void {
  if (typeof window === 'undefined') return;
  const clean = slugs.filter((s): s is string => Boolean(s && s.trim()));
  void fetch('/api/revalidate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, slugs: clean }),
    keepalive: true,
  }).catch(() => {});
}
