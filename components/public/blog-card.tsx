'use client';

import Link from 'next/link';
import { Calendar, ArrowRight, FileText } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { blogImageUrl } from '@/lib/blog-image';
import type { PublicBlogCard } from '@/lib/public-card-data';

interface BlogCardProps {
  post: PublicBlogCard;
}

export function BlogCard({ post }: BlogCardProps) {
  const imageUrl = blogImageUrl(post.featured_image);

  const dateStr = post.published_at || post.created_at;
  const date = new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <Card className="group overflow-hidden rounded-xl border-border/85 bg-card shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition-all duration-300 hover:-translate-y-1 hover:border-accent/45 hover:shadow-[0_18px_40px_rgba(15,23,42,0.12)] motion-reduce:transform-none motion-reduce:transition-none">
      <Link href={`/blog/${post.slug}`} className="block">
        <div className="relative aspect-[16/10] overflow-hidden bg-[linear-gradient(145deg,hsl(var(--secondary)),hsl(var(--surface-featured)))]">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={post.title}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white/60 shadow-sm"><FileText className="h-8 w-8 text-accent/45" /></span>
            </div>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#101114]/55 to-transparent" />
          {post.blog_categories ? <Badge className="absolute bottom-3 left-3 border border-white/25 bg-[#101114]/80 text-[10px] text-white shadow-sm backdrop-blur-md">{post.blog_categories.name}</Badge> : null}
        </div>
      </Link>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {date}
          </span>
        </div>
        <Link href={`/blog/${post.slug}`} className="block mt-2.5">
          <h3 className="line-clamp-2 text-base font-extrabold leading-snug transition-colors group-hover:text-accent sm:text-lg">
            {post.title}
          </h3>
        </Link>
        {post.excerpt && (
          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground sm:text-sm">
            {post.excerpt}
          </p>
        )}
        <Link
          href={`/blog/${post.slug}`}
          className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-accent/10 px-3 text-xs font-bold text-accent transition-colors hover:bg-accent hover:text-white"
        >
          Read Article
          <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </CardContent>
    </Card>
  );
}
