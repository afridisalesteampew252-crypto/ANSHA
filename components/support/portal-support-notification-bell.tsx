'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { RecipientNotificationCenter } from '@/components/notifications/recipient-notification-center';

/** Includes invoice updates and TT-copy reviews as well as support replies. */
export function PortalSupportNotificationBell() {
  const [userId, setUserId] = useState('');
  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => { if (active) setUserId(data.session?.user.id || ''); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setUserId(session?.user.id || ''));
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  return <RecipientNotificationCenter audience="portal" userId={userId} />;
}
