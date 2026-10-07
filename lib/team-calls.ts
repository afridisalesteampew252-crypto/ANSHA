export type TeamCallKind = 'voice' | 'video';

/** Media travels through the Jitsi host; chat stores only the invitation. */
export function teamCallUrl(base: string, roomId: string, kind: TeamCallKind) {
  const host = new URL(base);
  if (host.protocol !== 'https:' || host.username || host.password || host.search || host.hash) {
    throw new Error('Team calls require a secure Jitsi server URL.');
  }
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(roomId)) throw new Error('Invalid call room.');
  host.pathname = `${host.pathname.replace(/\/$/, '')}/ANSHA-${roomId}`;
  host.hash = `config.startWithVideoMuted=${kind === 'voice'}&config.prejoinPageEnabled=true`;
  return host.toString();
}

export function sharedLocationUrl(latitude: number, longitude: number) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw new Error('Invalid location.');
  }
  const lat = latitude.toFixed(6);
  const lon = longitude.toFixed(6);
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`;
}
