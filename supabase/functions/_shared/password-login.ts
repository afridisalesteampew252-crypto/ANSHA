export type LoginState = {
  attempts: number;
  locked_until: string | null;
  retry_after: number;
  allowed?: boolean;
  busy?: boolean;
  reservation?: string;
};

export function parsePasswordLogin(body: unknown) {
  if (!body || typeof body !== 'object') return null;
  const input = body as Record<string, unknown>;
  if (typeof input.email !== 'string' || typeof input.password !== 'string') return null;
  const email = input.email.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      || !input.password || input.password.length > 1024
      || (input.scope !== 'admin' && input.scope !== 'customer')) return null;
  return { email, password: input.password, scope: input.scope };
}

export async function passwordLoginIdentifier(email: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email.trim().toLowerCase()));
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, '0')).join('');
}

export function wrongPassword(error: { code?: string } | null) {
  // Email confirmation, network failures and provider throttling are not wrong passwords.
  return error?.code === 'invalid_credentials';
}

export function passwordLoginFailure(state: LoginState) {
  return {
    error: state.busy
      ? 'A sign-in is already in progress. Please wait a moment.'
      : state.retry_after > 0
        ? 'Too many failed attempts. Sign-in is locked for 5 minutes.'
        : `Invalid email or password. ${Math.max(0, 3 - state.attempts)} attempts remain before a temporary sign-in lock.`,
    attempts: state.attempts,
    locked_until: state.locked_until,
    retry_after: state.retry_after,
  };
}
