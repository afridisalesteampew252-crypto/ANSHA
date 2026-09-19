'use client';

import Link from 'next/link';
import { Heart, MessageCircle, ShoppingBag, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { CatalogImage } from '@/components/public/catalog-image';
import { useCustomerLists } from '@/hooks/use-customer-lists';
import { siteConfig } from '@/lib/site-config';
import type { SavedCatalogItem } from '@/lib/customer-lists';

interface SavedListPageProps {
  mode: 'cart' | 'favorites';
}

function buildWhatsAppHref(items: SavedCatalogItem[]) {
  const lines = items.slice(0, 12).map((item, index) => `${index + 1}. ${item.title}${item.subtitle ? ` (${item.subtitle})` : ''} — ${siteConfig.url}${item.href}`);
  const intro = items.length === 1
    ? `Hello ${siteConfig.name}, I'm inquiring about this item from my ${items[0]?.kind === 'vehicle' ? 'vehicle' : 'parts'} list:`
    : `Hello ${siteConfig.name}, I'd like a quote on these ${items.length} items:`;
  return `https://wa.me/${siteConfig.whatsappNumber}?text=${encodeURIComponent([intro, '', ...lines].join('\n'))}`;
}

export function SavedListPage({ mode }: SavedListPageProps) {
  const { cart, favorites, removeFromCart, removeFavorite, addToCart, toggleFavorite } = useCustomerLists();
  const items = mode === 'cart' ? cart : favorites;
  const isCart = mode === 'cart';

  const onRemove = (item: SavedCatalogItem) => {
    if (isCart) removeFromCart(item.id, item.kind);
    else removeFavorite(item.id, item.kind);
    toast.success(isCart ? 'Removed from cart' : 'Removed from favorites');
  };

  return (
    <div className="container-page py-8 sm:py-12">
      <div className="max-w-3xl">
        <span className="eyebrow">{isCart ? 'Inquiry cart' : 'Wishlist'}</span>
        <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          {isCart ? 'Your inquiry cart' : 'Saved favorites'}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          {isCart
            ? 'Items you want a quote on. Nothing is checked out here — inquire with ANSHA when ready.'
            : 'Parts and vehicles you hearted while browsing. Saved on this device.'}
        </p>
      </div>

      {!items.length ? (
        <div className="mt-10 rounded-3xl border border-dashed border-border bg-card p-10 text-center">
          {isCart ? <ShoppingBag className="mx-auto h-10 w-10 text-muted-foreground/35" /> : <Heart className="mx-auto h-10 w-10 text-muted-foreground/35" />}
          <h2 className="mt-4 text-lg font-bold">{isCart ? 'Cart is empty' : 'No favorites yet'}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Browse the catalog and tap the icons on any listing.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild variant="accent"><Link href="/parts">Browse parts</Link></Button>
            <Button asChild variant="outline"><Link href="/vehicles">Browse vehicles</Link></Button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button asChild variant="accent" className="h-11 rounded-full">
              <a href={buildWhatsAppHref(items)} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-4 w-4" /> Inquire on WhatsApp
              </a>
            </Button>
            <p className="text-sm text-muted-foreground">{items.length} item{items.length === 1 ? '' : 's'}</p>
          </div>

          <ul className="mt-6 space-y-3">
            {items.map((item) => (
              <li key={`${item.kind}-${item.id}`} className="flex gap-3 rounded-2xl border border-border bg-card p-3 sm:gap-4 sm:p-4">
                <Link href={item.href} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-secondary sm:h-24 sm:w-24">
                  {item.imageUrl ? (
                    <CatalogImage src={item.imageUrl} alt={item.title} fill sizes="96px" objectFit="cover" className="object-cover" />
                  ) : (
                    <span className="grid h-full place-items-center text-xs text-muted-foreground">No image</span>
                  )}
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent">
                        {item.kind === 'vehicle' ? 'Vehicle' : 'Part'}
                      </p>
                      <Link href={item.href} className="mt-0.5 block line-clamp-2 text-sm font-bold leading-snug hover:text-accent sm:text-base">
                        {item.title}
                      </Link>
                      {item.subtitle ? <p className="mt-1 font-mono text-[11px] text-muted-foreground">{item.subtitle}</p> : null}
                      {item.priceLabel ? <p className="mt-1 text-sm font-extrabold">{item.priceLabel}</p> : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemove(item)}
                      className="grid h-10 w-10 place-items-center rounded-full border border-border text-muted-foreground transition hover:border-accent hover:text-accent"
                      aria-label={`Remove ${item.title}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline" className="h-9 rounded-full">
                      <Link href={item.href}>View item</Link>
                    </Button>
                    {isCart ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-9 rounded-full"
                        onClick={() => {
                          const { added } = toggleFavorite(item);
                          toast.success(added ? 'Moved to favorites' : 'Already updated favorites');
                        }}
                      >
                        <Heart className="h-3.5 w-3.5" /> Save
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-9 rounded-full"
                        onClick={() => {
                          addToCart(item);
                          toast.success('Added to inquiry cart');
                        }}
                      >
                        <ShoppingBag className="h-3.5 w-3.5" /> Add to cart
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
