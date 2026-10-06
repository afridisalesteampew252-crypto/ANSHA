import { useEffect, useRef } from 'react';

/**
 * Lightweight, client-side spam screening for the public inquiry / part-request forms.
 * The authoritative limits live in the database (migration
 * 20261006012000_public_form_spam_protection.sql: CHECK constraints + per-IP rate limit);
 * this only stops naive form-filling bots before they cost a request.
 */
export const FORM_LIMITS = {
  name: 120,
  email: 254,
  phone: 40,
  message: 5000,
  make: 80,
  model: 80,
  year: 10,
  partName: 200,
  partNumber: 120,
} as const;

/** Name of the hidden honeypot input. Real users never see or fill it. */
export const HONEYPOT_FIELD = 'company_website';

/** Humans need a few seconds to fill a form; instant submits are bots. */
const MIN_FILL_MS = 2500;
const MAX_LINKS = 3;

export type SubmissionVerdict = 'ok' | 'bot';

export function screenSubmission({
  honeypot,
  startedAt,
  text,
}: {
  honeypot: string;
  startedAt: number;
  text: string;
}): SubmissionVerdict {
  if (honeypot.trim()) return 'bot';
  if (Date.now() - startedAt < MIN_FILL_MS) return 'bot';
  const links = text.match(/https?:\/\//gi)?.length ?? 0;
  if (links > MAX_LINKS) return 'bot';
  return 'ok';
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function isValidOptionalEmail(value: string) {
  const trimmed = value.trim();
  return !trimmed || (trimmed.length <= FORM_LIMITS.email && EMAIL_PATTERN.test(trimmed));
}

/** Maps a Supabase insert error to a message that is safe to show the visitor. */
export function publicFormErrorMessage(error: { message?: string; hint?: string | null } | null, fallback: string) {
  if (!error) return fallback;
  if (error.hint === 'rate_limited' || /too many requests/i.test(error.message || '')) {
    return error.message || 'Too many requests. Please try again later or contact us on WhatsApp.';
  }
  if (/violates check constraint/i.test(error.message || '')) {
    return 'Please check your details: one of the fields is too long or the email address is invalid.';
  }
  return fallback;
}

/** Timestamp (ms) of when the form mounted; reset it after a successful submit. */
export function useFormStartTime() {
  const startedAt = useRef(0);
  useEffect(() => {
    startedAt.current = Date.now();
  }, []);
  return startedAt;
}
