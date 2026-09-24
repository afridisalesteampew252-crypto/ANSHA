'use client';

import { useEffect, useState } from 'react';
import { Bell, Download, Rocket, Share, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { siteConfig } from '@/lib/site-config';
import { usePwaInstall } from '@/components/pwa/use-pwa-install';

export function InstallAppButton({
  className,
  variant = 'outline',
  size = 'sm',
  label = 'Install app',
}: {
  className?: string;
  variant?: 'outline' | 'ghost' | 'accent' | 'default' | 'secondary';
  size?: 'sm' | 'default' | 'icon' | 'lg';
  label?: string;
}) {
  const { installed, canNativePrompt, isIos, promptInstall, clearDismiss } = usePwaInstall();
  const [hintOpen, setHintOpen] = useState(false);

  if (installed) return null;

  const onClick = async () => {
    clearDismiss();
    if (canNativePrompt) {
      await promptInstall();
      return;
    }
    setHintOpen(true);
  };

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={cn('gap-1.5', className)}
        onClick={() => void onClick()}
        aria-label={`Get ${siteConfig.pwaName}`}
      >
        <Rocket className="h-4 w-4" />
        {label}
      </Button>
      {hintOpen ? (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-4 sm:items-center"
          role="dialog"
          aria-label={`How to install ${siteConfig.pwaName}`}
          onClick={() => setHintOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-background p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold">{siteConfig.pwaName}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {isIos
                    ? 'Add ANSHA to your Home Screen for a clean, app-like experience.'
                    : 'Install ANSHA for faster access to live stock, parts, deals, and export support.'}
                </p>
              </div>
              <button
                type="button"
                className="rounded-md p-1 text-muted-foreground hover:bg-secondary"
                aria-label="Close"
                onClick={() => setHintOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {isIos ? (
              <ol className="mt-4 space-y-2 text-sm text-foreground">
                <li className="flex gap-2">
                  <span className="font-bold text-accent">1.</span>
                  Tap <Share className="mx-1 inline h-4 w-4 text-accent" aria-hidden /> Share in Safari.
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-accent">2.</span>
                  Choose <strong>Add to Home Screen</strong>.
                </li>
                <li className="flex gap-2"><span className="font-bold text-accent">3.</span>Confirm — {siteConfig.pwaName} opens like an app.</li>
              </ol>
            ) : (
              <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
                <li>Chrome / Edge: menu → <strong>Install app</strong>.</li>
                <li>Android: browser menu → <strong>Add to Home screen</strong>.</li>
                <li>Your account, live catalog, and Supabase data stay connected.</li>
              </ul>
            )}
            <Button type="button" className="mt-5 w-full" onClick={() => setHintOpen(false)}>
              Continue browsing
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function InstallPrompt() {
  const {
    installed,
    dismissed,
    canNativePrompt,
    isIos,
    showManualHint,
    promptInstall,
    dismissBanner,
  } = usePwaInstall();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (installed || dismissed) {
      setVisible(false);
      return;
    }
    // Show quickly when native prompt is ready; otherwise soft-delay for iOS / manual.
    const delay = canNativePrompt ? 8000 : 12000;
    const timer = window.setTimeout(() => setVisible(true), delay);
    return () => window.clearTimeout(timer);
  }, [installed, dismissed, canNativePrompt]);

  if (!visible || installed || dismissed) return null;

  const install = async () => {
    if (canNativePrompt) {
      const result = await promptInstall();
      if (result.outcome === 'accepted') {
        setVisible(false);
        return;
      }
      if (result.outcome === 'dismissed') {
        dismissBanner();
        setVisible(false);
      }
      return;
    }
    // Manual / iOS: keep banner; user follows steps below.
  };

  return (
    <div
      className={cn(
        'fixed left-3 right-3 z-50 max-w-full rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur-md',
        'bottom-[calc(4.25rem+env(safe-area-inset-bottom,0px))] lg:bottom-4 lg:left-auto lg:right-4 lg:w-[22rem]'
      )}
      role="dialog"
      aria-label={`Get ${siteConfig.pwaName}`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
          <Rocket className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Get the ANSHA app</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isIos || showManualHint
              ? 'Add ANSHA to your home screen for a polished, app-like catalog experience.'
              : 'One tap to live inventory, parts, deals, and export support.'}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1 rounded-lg bg-secondary/70 px-2 py-1"><Sparkles className="h-3 w-3 text-accent" />Faster access</span>
            <span className="flex items-center gap-1 rounded-lg bg-secondary/70 px-2 py-1"><Bell className="h-3 w-3 text-accent" />Updates ready</span>
          </div>
          {(isIos || (showManualHint && !canNativePrompt)) ? (
            <ol className="mt-2 space-y-1 text-[11px] leading-snug text-muted-foreground">
              {isIos ? (
                <>
                  <li>1. Tap Share in Safari</li>
                  <li>2. Add to Home Screen</li>
                </>
              ) : (
                <>
                  <li>Use the browser menu → Install app / Add to Home screen</li>
                  <li>Or tap Install app in the site header or footer</li>
                </>
              )}
            </ol>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {canNativePrompt ? (
              <Button size="sm" type="button" onClick={() => void install()}>
                Add ANSHA
              </Button>
            ) : (
              <Button size="sm" type="button" variant="accent" onClick={dismissBanner}>
                Got it
              </Button>
            )}
            <Button size="sm" type="button" variant="ghost" onClick={dismissBanner}>
              Not now
            </Button>
          </div>
        </div>
        <button
          type="button"
          className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label="Dismiss install prompt"
          onClick={dismissBanner}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
