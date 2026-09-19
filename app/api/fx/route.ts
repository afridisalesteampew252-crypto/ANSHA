import { NextResponse } from 'next/server';

export const revalidate = 3600;

const QUOTE_CODES = ['USD', 'EUR', 'JPY', 'PKR'] as const;

type QuoteCode = (typeof QUOTE_CODES)[number];

type OpenErApiResponse = {
  result?: string;
  base_code?: string;
  time_last_update_utc?: string;
  rates?: Record<string, number>;
};

export async function GET() {
  try {
    const response = await fetch('https://open.er-api.com/v6/latest/AED', {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
      throw new Error(`FX upstream returned ${response.status}`);
    }

    const payload = (await response.json()) as OpenErApiResponse;
    if (payload.result !== 'success' || !payload.rates) {
      throw new Error('FX upstream returned an unexpected payload');
    }

    const rates = QUOTE_CODES.reduce<Partial<Record<QuoteCode, number>>>((acc, code) => {
      const value = payload.rates?.[code];
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        acc[code] = value;
      }
      return acc;
    }, {});

    if (Object.keys(rates).length === 0) {
      throw new Error('FX upstream missing requested quote currencies');
    }

    return NextResponse.json(
      {
        base: 'AED',
        rates,
        updatedAt: payload.time_last_update_utc ?? new Date().toISOString(),
        source: 'open.er-api.com',
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      }
    );
  } catch {
    return NextResponse.json(
      {
        error: 'Unable to load FX rates',
        base: 'AED',
        rates: null,
      },
      {
        status: 502,
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      }
    );
  }
}
