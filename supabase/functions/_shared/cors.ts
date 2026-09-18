const CANONICAL_ORIGIN = 'https://www.anshatradingco.com';

const EXACT_ORIGINS = new Set([
  CANONICAL_ORIGIN,
  'https://anshatradingco.com',
  'https://www.anshatrading.com',
  'https://anshatrading.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

export function isAllowedOrigin(origin: string) {
  if (!origin || EXACT_ORIGINS.has(origin)) return EXACT_ORIGINS.has(origin);
  try {
    const parsed = new URL(origin);
    return parsed.protocol === 'https:' && parsed.hostname.endsWith('.vercel.app');
  } catch {
    return false;
  }
}

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') || '';
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  if (isAllowedOrigin(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

export function json(request: Request, body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: corsHeaders(request) });
}
