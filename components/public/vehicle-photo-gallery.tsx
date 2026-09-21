'use client';

import { useEffect, useRef, useState } from 'react';
import { Car, ChevronLeft, ChevronRight, Images, ZoomIn } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { CatalogImage, publicVehicleImageUrl } from '@/components/public/catalog-image';
import { vehicleImageAlt } from '@/lib/seo';
import type { VehiclePhoto } from '@/lib/types';
import { cn } from '@/lib/utils';

const AUTO_MS = 4200;

type VehiclePhotoGalleryProps = {
  title: string;
  photos: VehiclePhoto[];
  featured?: boolean;
  initialIndex?: number;
  /** Optional year/make/model for alt text (never invents specs). */
  year?: number | string | null;
  make?: string | null;
  model?: string | null;
};

export function VehiclePhotoGallery({
  title,
  photos,
  featured = false,
  initialIndex = 0,
  year,
  make,
  model,
}: VehiclePhotoGalleryProps) {
  const [selectedImage, setSelectedImage] = useState(initialIndex);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const thumbRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedImage(initialIndex);
  }, [initialIndex]);

  useEffect(() => {
    if (photos.length < 2 || paused || lightboxOpen) {
      setProgress(0);
      return;
    }
    const started = Date.now();
    const tick = window.setInterval(() => {
      const pct = Math.min(100, ((Date.now() - started) / AUTO_MS) * 100);
      setProgress(pct);
    }, 50);
    const advance = window.setTimeout(() => {
      setSelectedImage((prev) => (prev === photos.length - 1 ? 0 : prev + 1));
      setProgress(0);
    }, AUTO_MS);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(advance);
    };
  }, [photos.length, selectedImage, paused, lightboxOpen]);

  useEffect(() => {
    const node = thumbRef.current?.querySelector<HTMLElement>('[aria-current="true"]');
    node?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [selectedImage]);

  const currentPhoto = photos[selectedImage];
  const photoUrl = currentPhoto ? publicVehicleImageUrl(currentPhoto.storage_path) : null;
  const altBase = { title, year, make, model };

  const navigatePhoto = (dir: 'prev' | 'next') => {
    setSelectedImage((prev) => {
      if (dir === 'prev') return prev === 0 ? photos.length - 1 : prev - 1;
      return prev === photos.length - 1 ? 0 : prev + 1;
    });
    setProgress(0);
  };

  return (
    <div className="min-w-0 space-y-3">
      <div
        className="group relative aspect-[4/3] w-full cursor-zoom-in overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-secondary/80 to-background shadow-sm"
        onClick={() => photoUrl && setLightboxOpen(true)}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
        }}
        role={photoUrl ? 'button' : undefined}
        tabIndex={photoUrl ? 0 : undefined}
        onKeyDown={(event) => {
          if (photoUrl && (event.key === 'Enter' || event.key === ' ')) {
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
        aria-label={photoUrl ? `Open ${vehicleImageAlt(altBase)} image ${selectedImage + 1} in full screen` : undefined}
      >
        {photoUrl ? (
          <CatalogImage
            key={currentPhoto.id}
            src={photoUrl}
            alt={vehicleImageAlt(altBase, { photoIndex: selectedImage + 1 })}
            fill
            priority={selectedImage === 0}
            sizes="(max-width: 1024px) 100vw, 50vw"
            objectFit="contain"
            className="p-2 transition-opacity duration-500 sm:p-4"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Car className="h-20 w-20 text-muted-foreground/30" />
          </div>
        )}

        {featured ? (
          <div className="absolute top-3 left-3 z-10">
            <Badge className="border-foreground bg-foreground text-background">Featured</Badge>
          </div>
        ) : null}

        {photoUrl ? (
          <div className="pointer-events-none absolute inset-0 hidden items-center justify-center bg-black/0 opacity-0 transition-all duration-200 group-hover:bg-black/15 group-hover:opacity-100 sm:flex">
            <div className="flex items-center gap-2 rounded-lg bg-background/95 px-3 py-1.5 text-sm font-medium shadow-lg">
              <ZoomIn className="h-4 w-4" />
              Click to view
            </div>
          </div>
        ) : null}

        {photos.length > 1 ? (
          <>
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
              {selectedImage + 1} / {photos.length}
            </div>
            <div className="absolute inset-x-0 bottom-0 z-10 h-1 bg-black/20">
              <div className="h-full bg-accent transition-[width] duration-75 ease-linear" style={{ width: `${progress}%` }} />
            </div>
            <div className="absolute bottom-3 left-3 z-10 flex max-w-[55%] gap-1.5 overflow-hidden">
              {photos.map((photo, index) => (
                <button
                  key={photo.id}
                  type="button"
                  aria-label={`Go to photo ${index + 1}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedImage(index);
                    setProgress(0);
                  }}
                  className={cn(
                    'h-1.5 flex-1 rounded-full transition',
                    index === selectedImage ? 'bg-white' : 'bg-white/35 hover:bg-white/60'
                  )}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>

      {photos.length > 1 ? (
        <div
          ref={thumbRef}
          className="flex max-w-full snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Vehicle photo thumbnails"
        >
          {photos.map((photo, idx) => {
            const thumbUrl = publicVehicleImageUrl(photo.storage_path);
            return (
              <button
                key={photo.id}
                type="button"
                onClick={() => {
                  setSelectedImage(idx);
                  setProgress(0);
                }}
                aria-label={`Show photo ${idx + 1} of ${photos.length}`}
                aria-current={idx === selectedImage ? 'true' : undefined}
                className={cn(
                  'relative aspect-square w-[4.5rem] shrink-0 snap-start overflow-hidden rounded-xl border-2 bg-secondary/60 transition-all sm:w-24',
                  idx === selectedImage ? 'border-accent ring-2 ring-accent/15' : 'border-border hover:border-foreground/40'
                )}
              >
                <CatalogImage
                  src={thumbUrl}
                  alt={vehicleImageAlt(altBase, { photoIndex: idx + 1 })}
                  fill
                  sizes="96px"
                  objectFit="contain"
                  className="p-1"
                />
              </button>
            );
          })}
        </div>
      ) : null}

      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="h-[92vh] max-w-[min(96vw,72rem)] overflow-hidden border-white/10 bg-black/95 p-0">
          <DialogTitle className="sr-only">
            {title} — Image {selectedImage + 1}
          </DialogTitle>
          <div className="relative flex h-full min-h-[50vh] w-full flex-col items-center justify-center p-4 pb-24 sm:p-8 sm:pb-28">
            {photoUrl ? (
              <div className="relative min-h-0 w-full flex-1">
                <CatalogImage
                  src={photoUrl}
                  alt={vehicleImageAlt(altBase, { photoIndex: selectedImage + 1 })}
                  fill
                  sizes="96vw"
                  objectFit="contain"
                />
              </div>
            ) : null}
            {photos.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => navigatePhoto('prev')}
                  className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                  aria-label="Previous photo"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  onClick={() => navigatePhoto('next')}
                  className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                  aria-label="Next photo"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
                <div className="absolute bottom-3 left-3 right-3 flex max-w-full items-center gap-3 overflow-x-auto overscroll-x-contain rounded-xl bg-white/10 p-2 backdrop-blur-sm">
                  <div className="flex shrink-0 items-center gap-1.5 px-1 text-xs text-white/80">
                    <Images className="h-4 w-4" />
                    {selectedImage + 1}/{photos.length}
                  </div>
                  {photos.map((photo, index) => (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={() => setSelectedImage(index)}
                      aria-label={`Show photo ${index + 1}`}
                      aria-current={index === selectedImage ? 'true' : undefined}
                      className={cn(
                        'relative h-14 w-14 shrink-0 overflow-hidden rounded-md border-2 bg-white/5',
                        index === selectedImage ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100'
                      )}
                    >
                      <CatalogImage
                        src={publicVehicleImageUrl(photo.storage_path)}
                        alt=""
                        fill
                        sizes="56px"
                        objectFit="contain"
                      />
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
