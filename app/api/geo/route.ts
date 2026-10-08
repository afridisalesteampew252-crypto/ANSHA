import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/** Visitor country from the hosting edge (Vercel / Cloudflare). Used to preselect the export region. */
export function GET(request: NextRequest) {
  const raw =
    request.headers.get('x-vercel-ip-country') ||
    request.headers.get('cf-ipcountry') ||
    '';
  const country = /^[A-Za-z]{2}$/.test(raw) ? raw.toUpperCase() : null;
  return NextResponse.json({ country }, { headers: { 'Cache-Control': 'private, no-store' } });
}
