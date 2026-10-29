/** A bounded JSON-object reader for authenticated API routes. */
export class RequestBodyError extends Error {
  constructor(message: string, public readonly status: 400 | 413) {
    super(message);
    this.name = 'RequestBodyError';
  }
}

export async function readJsonObject(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const tooLarge = () => new RequestBodyError('Request body is too large.', 413);
  const declared = request.headers.get('content-length');
  if (declared && Number(declared) > maxBytes) throw tooLarge();
  if (!request.body) throw new RequestBodyError('A JSON object is required.', 400);

  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        // Preserve the 413 even if the underlying stream cannot be cancelled.
        await reader.cancel().catch(() => undefined);
        throw tooLarge();
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError('Could not read the request body.', 400);
  } finally {
    reader.releaseLock();
  }

  let body: unknown;
  try { body = JSON.parse(text); } catch { throw new RequestBodyError('Invalid JSON body.', 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new RequestBodyError('A JSON object is required.', 400);
  }
  return body as Record<string, unknown>;
}
