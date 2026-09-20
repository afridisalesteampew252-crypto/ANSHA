# Tawk.to (live chat + agent automation)

Public widget IDs and admin Live chat shortcuts. Optional webhook mirror for “needs attention” in `/admin/live-chat`.

## Can we MCP Tawk into Cursor?

**No official Tawk → Cursor MCP server exists.** Do not invent or install a fake one.

What exists:

| Thing | Direction | Useful for ANSHA? |
| --- | --- | --- |
| Tawk **AI Assist + MCP** | Tawk’s AI agent calls *your* MCP tools | No — opposite of “agent drives Tawk for admin” |
| Tawk **REST API** (`https://api.tawk.to/v1/`) | You call Tawk (chats, tickets, stats, webhooks, KB, widgets) | Yes, but **access is by request** (not open signup). After approval you create an API key under profile → REST API Keys. Auth: HTTP Basic, API key as username. |
| Tawk **Webhooks** | Tawk POSTs chat start/end/transcript/ticket to your URL | **Yes — implemented** (see below). No REST key required. |
| **Zapier MCP** / **Truto** (third-party) | Hosted MCP wrapping Tawk triggers/API | Optional for Cursor agents; Zapier today exposes *triggers* (chat started/ended/transcript/ticket), not a full agent inbox. Truto claims REST-backed MCP after you connect Tawk (requires REST access + paid bridge). |

### If you still want Cursor MCP later

1. Prefer **webhooks + ANSHA admin UI** (already in-repo) for day-to-day ops.
2. For Cursor/Claude tools: create a Zapier MCP connection to tawk.to ([zapier.com/mcp/tawk-to](https://zapier.com/mcp/tawk-to)) and add the Zapier MCP URL in Cursor Settings → MCP — **only after** you accept Zapier’s ToS and connect the same Tawk property. Do not put Zapier tokens in git.
3. REST-backed MCP (Truto or a custom server) only after Raheel requests and receives Tawk REST API access and creates `TAWK_API_KEY` (server-only; never `NEXT_PUBLIC_*`).

There is **no** checked-in `mcp.json` snippet with a real Tawk server URL, because Tawk does not publish one.

## What stays in the Tawk dashboard

- Live reply / assign / tags / departments
- Agent presence (online/away)
- Full mid-chat message stream (webhooks do **not** fire per message)
- Widget design, triggers, AI Assist training
- Creating REST API keys (after access approval)

ANSHA cannot safely iframe the agent dashboard (Tawk sets frame-blocking headers). `/admin/live-chat` always keeps open-tab / popup shortcuts.

## What ANSHA automates today

| Capability | How |
| --- | --- |
| Public site chat widget | `NEXT_PUBLIC_TAWK_PROPERTY_ID` + `NEXT_PUBLIC_TAWK_WIDGET_ID` |
| Admin Live chat page | `/admin/live-chat` — **admin + manager only** |
| Open / popup fallback | Built into `AdminTawkInbox` |
| “Needs attention” list + open count | Webhook → Edge `tawk-webhook` → `tawk_chat_sessions` / `tawk_ticket_events` |
| Dismiss in ANSHA | Sets `dismissed_at` (does not close the chat in Tawk) |
| Reply | Always link-out to Tawk dashboard |

Webhooks supported by Tawk: `chat:start`, `chat:end`, `chat:transcript_created`, `ticket:create`. ANSHA uses start/end/ticket for the list; transcripts are acknowledged and ignored (no full transcript UI yet).

## Setup (Raheel)

### Already set (public widget)

Property / widget IDs are public embed values (not secrets):

- Property: `6aaf2bd1f7ee5834457346b1`
- Widget: `1k2u46ath`

### Webhook (required for needs-attention)

**Code status:** Phase 58 is in-repo (migration + Edge `tawk-webhook` + Needs attention UI). **Operational status:** Needs attention stays empty until the Edge secret, function deploy, and Tawk dashboard webhook steps below are confirmed on production.

1. Apply migration `supabase/migrations/20260920070000_phase_58_tawk_chat_events.sql`.
2. Generate a long random secret (e.g. `openssl rand -hex 32`).
3. Set Edge secret (never commit):

```bash
supabase secrets set TAWK_WEBHOOK_SECRET=<secret> --project-ref ydrnilquojvalhgifest
```

4. Deploy with JWT verification **off** (Tawk cannot send a Supabase JWT):

```bash
supabase functions deploy tawk-webhook --no-verify-jwt --project-ref ydrnilquojvalhgifest
```

5. In Tawk → Administration → **Settings** (or **Integrations**) → **Webhooks** → Create:
   - **Name:** e.g. `ANSHA Live chat`
   - **URL:** `https://ydrnilquojvalhgifest.supabase.co/functions/v1/tawk-webhook`
   - **Events:** Chat Start, Chat End, New ticket (optional: New Chat Transcript)
   - Save. Tawk shows a **webhook secret** on that page (there is no secret field on the create form).
6. Copy Tawk’s webhook secret into Supabase Edge (and local `.env.local` only):

```bash
supabase secrets set TAWK_WEBHOOK_SECRET=<tawk-shown-secret> --project-ref ydrnilquojvalhgifest
```

   Redeploy is not required after changing the secret alone, but confirm the function is still active.
7. Send a test chat from the public site; confirm a row appears under `/admin/live-chat` → Needs attention.

### Optional REST API

1. Fill Tawk’s [REST API access request](https://help.tawk.to/article/rest-api).
2. After approval: Dashboard profile → REST API Keys → Create Key.
3. Store only as server/Edge secret `TAWK_API_KEY` (placeholder in `.env.example`). Do not put it in Vercel as `NEXT_PUBLIC_*`.
4. Use later for pull-based stats / custom MCP — not required for the webhook mirror.

## Env reference

| Variable | Where | Secret? |
| --- | --- | --- |
| `NEXT_PUBLIC_TAWK_PROPERTY_ID` | Vercel / `.env.local` | No (publishable) |
| `NEXT_PUBLIC_TAWK_WIDGET_ID` | Vercel / `.env.local` | No (publishable) |
| `NEXT_PUBLIC_TAWK_DASHBOARD_URL` | Optional; default `https://dashboard.tawk.to` | No |
| `TAWK_WEBHOOK_SECRET` | Supabase Edge secret only | **Yes** |
| `TAWK_API_KEY` | Future; Edge/server only after REST approval | **Yes** |

## Roles

Live chat UI and mirrored tables: **admin + manager** only (`canAccessLiveChat` / `private.can_access_live_chat()`). Staff, sales, freelancer, and accounts cannot open `/admin/live-chat` or read Tawk mirror tables.
