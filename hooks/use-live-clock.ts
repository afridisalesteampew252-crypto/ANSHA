'use client';

import { useEffect, useState } from 'react';

export type LiveClockZone = {
  id: string;
  label: string;
  timeZone: string;
  badge?: string;
};

export function formatZoneTime(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

export function useLiveClock(timeZone: string) {
  const [now, setNow] = useState(() => formatZoneTime(new Date(), timeZone));

  useEffect(() => {
    const tick = () => setNow(formatZoneTime(new Date(), timeZone));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [timeZone]);

  return now;
}

export function useLiveClocks(zones: LiveClockZone[]) {
  const zoneKey = zones.map((zone) => `${zone.id}:${zone.timeZone}`).join('|');
  const [times, setTimes] = useState<Record<string, string>>(() => {
    const stamp = new Date();
    return Object.fromEntries(zones.map((zone) => [zone.id, formatZoneTime(stamp, zone.timeZone)]));
  });

  useEffect(() => {
    const tick = () => {
      const stamp = new Date();
      setTimes(Object.fromEntries(zones.map((zone) => [zone.id, formatZoneTime(stamp, zone.timeZone)])));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
    // zoneKey captures id+timeZone; zones list is stable for ADMIN_CLOCK_ZONES.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneKey]);

  return times;
}

export const ADMIN_CLOCK_ZONES: LiveClockZone[] = [
  { id: 'pk', label: 'Pakistan', timeZone: 'Asia/Karachi', badge: 'PKT' },
  { id: 'dxb', label: 'Dubai', timeZone: 'Asia/Dubai', badge: 'GST' },
];
