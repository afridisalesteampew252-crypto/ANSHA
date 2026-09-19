'use client';

import { Heart, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useCustomerLists } from '@/hooks/use-customer-lists';
import type { CatalogItemKind, SavedCatalogItem } from '@/lib/customer-lists';

type SavePayload = Omit<SavedCatalogItem, 'addedAt'>;

interface SaveItemActionsProps {
  item: SavePayload;
  className?: string;
  size?: 'sm' | 'md';
  showLabels?: boolean;
}

export function SaveItemActions({ item, className, size = 'sm', showLabels = false }: SaveItemActionsProps) {
  const { cartHas, favoriteHas, addToCart, toggleFavorite } = useCustomerLists();
  const inCart = cartHas(item.id, item.kind);
  const saved = favoriteHas(item.id, item.kind);
  const dim = size === 'md' ? 'h-11 w-11' : 'h-9 w-9';
  const icon = size === 'md' ? 'h-[18px] w-[18px]' : 'h-4 w-4';

  const onFavorite = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const { added } = toggleFavorite(item);
    toast.success(added ? 'Saved to favorites' : 'Removed from favorites');
  };

  const onCart = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (inCart) {
      toast.message('Already in your inquiry cart');
      return;
    }
    addToCart(item);
    toast.success('Added to inquiry cart');
  };

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <button
        type="button"
        onClick={onFavorite}
        aria-pressed={saved}
        aria-label={saved ? `Remove ${item.title} from favorites` : `Save ${item.title} to favorites`}
        className={cn(
          'grid place-items-center rounded-full border transition active:scale-95',
          dim,
          showLabels && 'w-auto gap-1.5 px-3',
          saved
            ? 'border-accent bg-accent text-white shadow-sm'
            : 'border-border bg-card/95 text-foreground backdrop-blur hover:border-accent/40 hover:text-accent',
        )}
      >
        <Heart className={cn(icon, saved && 'fill-current')} />
        {showLabels ? <span className="text-xs font-bold">{saved ? 'Saved' : 'Save'}</span> : null}
      </button>
      <button
        type="button"
        onClick={onCart}
        aria-pressed={inCart}
        aria-label={inCart ? `${item.title} is in your cart` : `Add ${item.title} to inquiry cart`}
        className={cn(
          'grid place-items-center rounded-full border transition active:scale-95',
          dim,
          showLabels && 'w-auto gap-1.5 px-3',
          inCart
            ? 'border-[#101114] bg-[#101114] text-white'
            : 'border-border bg-card/95 text-foreground backdrop-blur hover:border-accent/40 hover:text-accent',
        )}
      >
        <ShoppingBag className={icon} />
        {showLabels ? <span className="text-xs font-bold">{inCart ? 'In cart' : 'Add'}</span> : null}
      </button>
    </div>
  );
}

export function toPartSaveItem(input: {
  id: string;
  slug: string;
  name: string;
  part_code: string;
  priceLabel: string;
  imageUrl?: string | null;
}): SavePayload {
  return {
    id: input.id,
    kind: 'part' satisfies CatalogItemKind,
    slug: input.slug,
    title: input.name,
    subtitle: input.part_code,
    priceLabel: input.priceLabel,
    imageUrl: input.imageUrl ?? null,
    href: `/parts/${input.slug}`,
  };
}

export function toVehicleSaveItem(input: {
  id: string;
  slug: string;
  title: string;
  subtitle?: string;
  priceLabel: string;
  imageUrl?: string | null;
}): SavePayload {
  return {
    id: input.id,
    kind: 'vehicle' satisfies CatalogItemKind,
    slug: input.slug,
    title: input.title,
    subtitle: input.subtitle,
    priceLabel: input.priceLabel,
    imageUrl: input.imageUrl ?? null,
    href: `/vehicles/${input.slug}`,
  };
}
