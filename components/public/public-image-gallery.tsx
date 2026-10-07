'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Images, Pause, Play, ZoomIn } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { CatalogImage } from '@/components/public/catalog-image';
import { cn } from '@/lib/utils';

export type PublicGalleryImage = {
  id: string;
  src: string;
  alt: string;
};

type PublicImageGalleryProps = {
  images: PublicGalleryImage[];
  initialIndex?: number;
  aspectClassName?: string;
  objectFit?: 'contain' | 'cover';
  emptyIcon?: ReactNode;
  badge?: ReactNode;
  className?: string;
};

const SWIPE_THRESHOLD = 48;
const AUTO_ROTATE_INTERVAL = 5_000;

/** Tiny gray blur so remote catalog images can use Next blur placeholder without new assets. */
const BLUR_DATA_URL =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//Z';

export function PublicImageGallery({
  images,
  initialIndex = 0,
  aspectClassName = 'aspect-[4/3]',
  objectFit = 'contain',
  emptyIcon,
  badge,
  className,
}: PublicImageGalleryProps) {
  const [selectedImage, setSelectedImage] = useState(initialIndex);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [scale, setScale] = useState(1);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [touching, setTouching] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const galleryRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const pinchStartDist = useRef<number | null>(null);
  const pinchStartScale = useRef(1);

  useEffect(() => {
    setSelectedImage(Math.min(Math.max(0, initialIndex), Math.max(0, images.length - 1)));
  }, [initialIndex, images.length]);

  useEffect(() => {
    if (!lightboxOpen) setScale(1);
  }, [lightboxOpen, selectedImage]);

  useEffect(() => {
    const container = thumbRef.current;
    const node = container?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!container || !node) return;
    // Move only the thumbnail strip; automatic rotation must not scroll the page.
    container.scrollTo({
      left: container.scrollLeft + node.getBoundingClientRect().left
        - container.getBoundingClientRect().left - (container.clientWidth - node.clientWidth) / 2,
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  }, [selectedImage, reducedMotion]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncMotion = () => setReducedMotion(media.matches);
    const syncVisibility = () => setPageVisible(!document.hidden);
    syncMotion();
    syncVisibility();
    media.addEventListener('change', syncMotion);
    document.addEventListener('visibilitychange', syncVisibility);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.1 });
    if (galleryRef.current) observer.observe(galleryRef.current);
    return () => {
      observer.disconnect();
      media.removeEventListener('change', syncMotion);
      document.removeEventListener('visibilitychange', syncVisibility);
    };
  }, []);

  useEffect(() => {
    if (images.length < 2 || paused || hovered || focused || touching || lightboxOpen
      || !visible || !pageVisible || reducedMotion) return;
    const timer = window.setTimeout(() => {
      setSelectedImage((index) => (index + 1) % images.length);
    }, AUTO_ROTATE_INTERVAL);
    return () => window.clearTimeout(timer);
  }, [images.length, selectedImage, paused, hovered, focused, touching, lightboxOpen, visible, pageVisible, reducedMotion]);

  const current = images[selectedImage];
  const hasMany = images.length > 1;

  const navigatePhoto = (dir: 'prev' | 'next') => {
    setSelectedImage((prev) => {
      if (!images.length) return 0;
      if (dir === 'prev') return prev === 0 ? images.length - 1 : prev - 1;
      return prev === images.length - 1 ? 0 : prev + 1;
    });
  };

  const onTouchStart = (event: React.TouchEvent) => {
    if (event.touches.length === 1) {
      touchStartX.current = event.touches[0].clientX;
    }
    if (event.touches.length === 2) {
      const [a, b] = [event.touches[0], event.touches[1]];
      pinchStartDist.current = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      pinchStartScale.current = scale;
      touchStartX.current = null;
    }
  };

  const onTouchMove = (event: React.TouchEvent) => {
    if (event.touches.length === 2 && pinchStartDist.current) {
      const [a, b] = [event.touches[0], event.touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const next = Math.min(3, Math.max(1, (pinchStartScale.current * dist) / pinchStartDist.current));
      setScale(next);
    }
  };

  const onTouchEnd = (event: React.TouchEvent) => {
    if (event.touches.length === 0) {
      pinchStartDist.current = null;
    }
    if (touchStartX.current == null || scale > 1.05) {
      touchStartX.current = null;
      return;
    }
    const endX = event.changedTouches[0]?.clientX ?? touchStartX.current;
    const delta = endX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < SWIPE_THRESHOLD || !hasMany) return;
    navigatePhoto(delta < 0 ? 'next' : 'prev');
  };

  return (
    <div
      ref={galleryRef}
      className={cn('min-w-0 space-y-3', className)}
      role="region"
      aria-label="Product photo gallery"
      onPointerEnter={(event) => {
        if (event.pointerType !== 'touch') setHovered(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== 'touch') setHovered(false);
      }}
      onPointerDownCapture={() => setFocused(false)}
      onKeyDownCapture={() => setFocused(true)}
      onFocusCapture={(event) => setFocused(event.target.matches(':focus-visible'))}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
      onTouchStartCapture={() => setTouching(true)}
      onTouchEndCapture={(event) => {
        if (event.touches.length === 0) setTouching(false);
      }}
      onTouchCancelCapture={() => setTouching(false)}
    >
      <div
        className={cn(
          'group relative w-full cursor-zoom-in overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-secondary/80 to-background shadow-sm',
          aspectClassName
        )}
        onClick={() => current && setLightboxOpen(true)}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        role={current ? 'button' : undefined}
        tabIndex={current ? 0 : undefined}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (current && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            setLightboxOpen(true);
          }
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            navigatePhoto('prev');
          }
          if (event.key === 'ArrowRight') {
            event.preventDefault();
            navigatePhoto('next');
          }
        }}
        aria-label={current ? `Open ${current.alt} in full screen` : undefined}
      >
        {current ? (
          <CatalogImage
            key={current.id}
            src={current.src}
            alt={current.alt}
            fill
            priority={selectedImage === 0}
            sizes="(max-width: 1024px) 100vw, 50vw"
            objectFit={objectFit}
            className={cn('transition-opacity duration-500', objectFit === 'contain' && 'p-2 sm:p-4')}
            placeholder="blur"
            blurDataURL={BLUR_DATA_URL}
          />
        ) : (
          <div className="flex h-full items-center justify-center">{emptyIcon}</div>
        )}

        {badge ? <div className="absolute left-3 top-3 z-10">{badge}</div> : null}

        {current ? (
          <div className="pointer-events-none absolute inset-0 hidden items-center justify-center bg-black/0 opacity-0 transition-all duration-200 group-hover:bg-black/15 group-hover:opacity-100 sm:flex">
            <div className="flex items-center gap-2 rounded-lg bg-background/95 px-3 py-1.5 text-sm font-medium shadow-lg">
              <ZoomIn className="h-4 w-4" />
              Click to view
            </div>
          </div>
        ) : null}

        {hasMany ? (
          <>
            {!reducedMotion ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setPaused((value) => !value);
                }}
                className="absolute bottom-2 left-2 z-10 flex h-11 items-center gap-1.5 rounded-lg bg-background/90 px-3 shadow-md transition hover:bg-background"
                aria-label={paused ? 'Resume slideshow' : 'Pause slideshow'}
              >
                {paused ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
                <span className="text-xs font-medium">{paused ? 'Play' : 'Pause'}</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                navigatePhoto('prev');
              }}
              className="absolute left-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 shadow-md transition hover:bg-background sm:opacity-0 sm:group-hover:opacity-100"
              aria-label="Previous photo"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                navigatePhoto('next');
              }}
              className="absolute right-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 shadow-md transition hover:bg-background sm:opacity-0 sm:group-hover:opacity-100"
              aria-label="Next photo"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <div className="absolute bottom-3 right-3 z-10 rounded-md bg-black/60 px-2 py-1 text-xs text-white">
              {selectedImage + 1} / {images.length}
            </div>
          </>
        ) : null}
      </div>

      {hasMany ? (
        <div
          ref={thumbRef}
          className="flex max-w-full snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Photo thumbnails"
        >
          {images.map((image, idx) => (
            <button
              key={image.id}
              type="button"
              onClick={() => setSelectedImage(idx)}
              aria-label={`Show photo ${idx + 1} of ${images.length}`}
              aria-current={idx === selectedImage ? 'true' : undefined}
              className={cn(
                'relative aspect-square w-[4.5rem] shrink-0 snap-start overflow-hidden rounded-xl border-2 bg-secondary/60 transition-all sm:w-24',
                idx === selectedImage ? 'border-accent ring-2 ring-accent/15' : 'border-border hover:border-foreground/40'
              )}
            >
              <CatalogImage
                src={image.src}
                alt={image.alt}
                fill
                sizes="96px"
                objectFit={objectFit}
                className="p-1"
                placeholder="blur"
                blurDataURL={BLUR_DATA_URL}
              />
            </button>
          ))}
        </div>
      ) : null}

      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="h-[92vh] max-w-[min(96vw,72rem)] overflow-hidden border-white/10 bg-black/95 p-0">
          <DialogTitle className="sr-only">
            Image {selectedImage + 1} of {images.length || 1}
          </DialogTitle>
          <div
            className="relative flex h-full min-h-[50vh] w-full flex-col items-center justify-center p-4 pb-24 sm:p-8 sm:pb-28"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            {current ? (
              <div
                className="relative min-h-0 w-full flex-1 touch-none"
                style={{ transform: `scale(${scale})`, transition: scale === 1 ? 'transform 150ms ease' : undefined }}
              >
                <CatalogImage
                  src={current.src}
                  alt={current.alt}
                  fill
                  sizes="96vw"
                  objectFit="contain"
                  placeholder="blur"
                  blurDataURL={BLUR_DATA_URL}
                />
              </div>
            ) : null}
            {hasMany ? (
              <>
                <button
                  type="button"
                  onClick={() => navigatePhoto('prev')}
                  className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                  aria-label="Previous photo"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  onClick={() => navigatePhoto('next')}
                  className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                  aria-label="Next photo"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
                <div className="absolute bottom-3 left-3 right-3 flex max-w-full items-center gap-3 overflow-x-auto overscroll-x-contain rounded-xl bg-white/10 p-2 backdrop-blur-sm">
                  <div className="flex shrink-0 items-center gap-1.5 px-1 text-xs text-white/80">
                    <Images className="h-4 w-4" />
                    {selectedImage + 1}/{images.length}
                  </div>
                  {images.map((image, index) => (
                    <button
                      key={image.id}
                      type="button"
                      onClick={() => setSelectedImage(index)}
                      aria-label={`Show photo ${index + 1}`}
                      aria-current={index === selectedImage ? 'true' : undefined}
                      className={cn(
                        'relative h-14 w-14 shrink-0 overflow-hidden rounded-md border-2 bg-white/5',
                        index === selectedImage ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100'
                      )}
                    >
                      <CatalogImage src={image.src} alt="" fill sizes="56px" objectFit="contain" />
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
