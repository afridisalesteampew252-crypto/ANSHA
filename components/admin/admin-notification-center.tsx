'use client';

import { RecipientNotificationCenter } from '@/components/notifications/recipient-notification-center';

export function AdminNotificationCenter({ userId }: { userId: string }) {
  return <RecipientNotificationCenter audience="admin" userId={userId} />;
}
