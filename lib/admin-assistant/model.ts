/**
 * Model + secret configuration for the admin AI assistant (server-only).
 *
 * Model calls go through the Vercel AI Gateway (plain "provider/model" strings).
 * Auth: on Vercel deployments the gateway uses the project's OIDC token automatically;
 * locally set AI_GATEWAY_API_KEY (or run `vercel env pull` to get VERCEL_OIDC_TOKEN).
 */

/** Strong tool-calling model by default; override with ADMIN_ASSISTANT_MODEL or AI_MODEL. */
export const DEFAULT_ADMIN_ASSISTANT_MODEL = 'anthropic/claude-sonnet-5.5';

const MODEL_ID_RE = /^[a-z0-9][a-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._:-]*$/;

/** Gateway model id: ADMIN_ASSISTANT_MODEL ?? AI_MODEL ?? default ("provider/model" only). */
export function resolveAdminAssistantModelId(): string {
  for (const candidate of [process.env.ADMIN_ASSISTANT_MODEL, process.env.AI_MODEL]) {
    const value = candidate?.trim();
    if (value && MODEL_ID_RE.test(value)) return value;
  }
  return DEFAULT_ADMIN_ASSISTANT_MODEL;
}

/** True when the AI Gateway can authenticate (API key locally, OIDC on Vercel). */
export function isAdminAssistantConfigured(): boolean {
  return Boolean(
    process.env.AI_GATEWAY_API_KEY?.trim() ||
      process.env.VERCEL_OIDC_TOKEN?.trim() ||
      // On Vercel Functions the OIDC token is injected per request (x-vercel-oidc-token).
      process.env.VERCEL === '1'
  );
}

/**
 * HMAC secret that signs tool-approval requests so an approval cannot be forged or
 * replayed with different arguments from client-controlled chat history.
 * Write tools are disabled (auto-denied) until this is set to 32+ characters.
 */
export function getApprovalSecret(): string | null {
  const value = process.env.ADMIN_ASSISTANT_APPROVAL_SECRET?.trim();
  return value && value.length >= 32 ? value : null;
}
