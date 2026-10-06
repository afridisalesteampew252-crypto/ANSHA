import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Daily workspace-request due reminders (vercel.json cron, 04:00 UTC).
 *
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically when the CRON_SECRET
 * environment variable is set on the project. This route then forwards the same secret to the
 * Supabase Edge Function `remind-request-dues` (deployed with verify_jwt = false), which checks
 * it against its own CRON_SECRET secret. Both values must be identical.
 */
function secretsMatch(provided: string, expected: string) {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function runReminders(request: Request) {
  const cronSecret = process.env.CRON_SECRET || '';
  if (!cronSecret) {
    console.error('[cron/request-dues] CRON_SECRET is not set; refusing to run.');
    return NextResponse.json({ error: 'Cron is not configured.' }, { status: 503 });
  }

  const authorization = request.headers.get('authorization') || '';
  const provided = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : '';
  if (!provided || !secretsMatch(provided, cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !publishableKey) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
  }

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/remind-request-dues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cronSecret}`,
        'x-cron-secret': cronSecret,
        apikey: publishableKey,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(25_000),
    });
  } catch (error) {
    console.error('[cron/request-dues] Edge function request failed', error);
    return NextResponse.json({ error: 'Reminder function is unreachable.' }, { status: 502 });
  }

  const payload = await response.json().catch(() => ({ error: 'Invalid reminder response.' }));
  if (!response.ok) {
    console.error('[cron/request-dues] Edge function returned', response.status, payload);
  }
  return NextResponse.json(payload, { status: response.status });
}

export async function GET(request: Request) {
  return runReminders(request);
}

export async function POST(request: Request) {
  return runReminders(request);
}
