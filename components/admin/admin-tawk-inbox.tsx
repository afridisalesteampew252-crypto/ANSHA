'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Headphones, Loader2, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const DEFAULT_DASHBOARD_URL = 'https://dashboard.tawk.to';
const EMBED_PROBE_MS = 1600;

function resolveDashboardUrl() {
  const fromEnv = process.env.NEXT_PUBLIC_TAWK_DASHBOARD_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  return DEFAULT_DASHBOARD_URL;
}

function openPopup(url: string) {
  const width = Math.min(1280, Math.max(960, Math.round(window.screen.availWidth * 0.72)));
  const height = Math.min(900, Math.max(720, Math.round(window.screen.availHeight * 0.82)));
  const left = Math.round((window.screen.availWidth - width) / 2);
  const top = Math.round((window.screen.availHeight - height) / 2);
  window.open(
    url,
    'ansha-tawk-inbox',
    `popup=yes,noopener,noreferrer,width=${width},height=${height},left=${left},top=${top}`
  );
}

/**
 * Staff surface for the Tawk.to agent inbox.
 * Tries a full-height embed; Tawk typically blocks framing, so CTAs always stay available.
 */
export function AdminTawkInbox() {
  const dashboardUrl = resolveDashboardUrl();
  const [probeKey, setProbeKey] = useState(0);
  const [embedState, setEmbedState] = useState<'probing' | 'likely_blocked'>('probing');
  const [preferFallback, setPreferFallback] = useState(false);

  useEffect(() => {
    if (preferFallback) return;
    // Tawk sets XFO/CSP so the frame stays blank but still fires onLoad — treat
    // a short probe as “likely blocked” and surface the open/popup fallback.
    setEmbedState('probing');
    const timer = window.setTimeout(() => setEmbedState('likely_blocked'), EMBED_PROBE_MS);
    return () => window.clearTimeout(timer);
  }, [preferFallback, probeKey]);

  const showBlockedPanel = preferFallback || embedState === 'likely_blocked';

  return (
    <div className="-m-4 flex h-[calc(100dvh-7.5rem)] min-h-[560px] flex-col overflow-hidden border-y border-border/80 bg-background md:-m-8 md:h-[calc(100dvh-4.75rem)]">
      <div className="flex flex-wrap items-center gap-3 border-b border-border/80 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/12 text-accent">
            <Headphones className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-tight">Website live chat</p>
            <p className="text-xs text-muted-foreground">
              Answer public-site visitors in the Tawk agent inbox. Sign in once at dashboard.tawk.to — same login works here.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {showBlockedPanel ? null : (
            <Button type="button" variant="outline" size="sm" onClick={() => setPreferFallback(true)}>
              Use shortcuts instead
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => openPopup(dashboardUrl)}>
            <Maximize2 className="h-4 w-4" />
            Open popup
          </Button>
          <Button type="button" size="sm" asChild>
            <a href={dashboardUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
              Open Tawk inbox
            </a>
          </Button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 bg-secondary/20">
        {!preferFallback ? (
          <iframe
            key={probeKey}
            title="Tawk.to agent inbox"
            src={dashboardUrl}
            className="h-full w-full border-0 bg-background"
            referrerPolicy="no-referrer-when-downgrade"
            allow="clipboard-read; clipboard-write"
          />
        ) : null}

        {embedState === 'probing' && !preferFallback ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/70">
            <div className="flex items-center gap-2 rounded-lg border bg-background px-4 py-3 text-sm text-muted-foreground shadow-sm">
              <Loader2 className="h-4 w-4 animate-spin text-accent" />
              Loading Tawk inbox…
            </div>
          </div>
        ) : null}

        {showBlockedPanel ? (
          <div className="absolute inset-0 flex items-center justify-center overflow-y-auto bg-background/95 p-6">
            <div className="w-full max-w-lg space-y-5 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/12 text-accent">
                <Headphones className="h-6 w-6" />
              </div>
              <div className="space-y-2">
                <h2 className="text-lg font-semibold tracking-tight">Open the Tawk agent inbox</h2>
                <p className="text-sm text-muted-foreground">
                  Tawk blocks embedding their dashboard inside other apps for security. Use a new tab or a sized popup so you can monitor chats without leaving ANSHA entirely.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button type="button" asChild>
                  <a href={dashboardUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    Open Tawk inbox
                  </a>
                </Button>
                <Button type="button" variant="outline" onClick={() => openPopup(dashboardUrl)}>
                  <Maximize2 className="h-4 w-4" />
                  Open popup
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                First visit: log in at{' '}
                <a href={dashboardUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                  {dashboardUrl.replace(/^https?:\/\//, '')}
                </a>
                . Keep that session signed in for faster reopen.
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPreferFallback(false);
                  setProbeKey((key) => key + 1);
                }}
              >
                Retry embed
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
