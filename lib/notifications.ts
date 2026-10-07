export type NotificationAudience = 'admin' | 'portal';

/** Notifications are database-generated, but never turn their links into open redirects. */
export function notificationHref(href: string | null, audience: NotificationAudience): string | null {
  if (!href || /[\\\u0000-\u0020]/.test(href)) return null;
  const root = `/${audience}`;
  if (href !== root && !href.startsWith(`${root}/`) && !href.startsWith(`${root}?`)) return null;
  const url = new URL(href, 'https://notifications.local');
  return url.origin === 'https://notifications.local' && (url.pathname === root || url.pathname.startsWith(`${root}/`)) ? href : null;
}

export type RecipientNotification = {
  id: string;
  notification_type: string;
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
};
