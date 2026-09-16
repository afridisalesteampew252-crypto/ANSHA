import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const startedAt = Date.now();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !publishableKey) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        service: 'ansha-web',
        checks: { configuration: 'failed', database: 'skipped' },
      },
      { status: 503 }
    );
  }

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/parts?select=id&limit=1`, {
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${publishableKey}`,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      throw new Error(`Supabase returned ${response.status}`);
    }

    return NextResponse.json({
      status: 'healthy',
      service: 'ansha-web',
      checks: { configuration: 'passed', database: 'passed' },
      latencyMs: Date.now() - startedAt,
      deployment: process.env.VERCEL_ENV ?? 'local',
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    });
  } catch {
    return NextResponse.json(
      {
        status: 'degraded',
        service: 'ansha-web',
        checks: { configuration: 'passed', database: 'failed' },
        latencyMs: Date.now() - startedAt,
      },
      { status: 503 }
    );
  }
}
