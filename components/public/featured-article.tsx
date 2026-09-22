'use client';

import Link from 'next/link';
import { Calendar, ArrowRight, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { blogImageUrl } from '@/lib/blog-image';
import type { PublicBlogCard } from '@/lib/public-card-data';

interface FeaturedArticleProps {
  post: PublicBlogCard;
}

export function FeaturedArticle({ post }: FeaturedArticleProps) {
  const imageUrl = blogImageUrl(post.featured_image);

  const dateStr = post.published_at || post.created_at;
  const date = new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <Link href={`/blog/${post.slug}`} className="group block">
      <div className="grid gap-0 overflow-hidden rounded-xl border border-border bg-card transition-all duration-200 hover:shadow-elevated md:grid-cols-2">
        <div className="relative aspect-[16/10] bg-secondary overflow-hidden md:aspect-auto md:min-h-[320px]">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={post.title}
              loading="eager"
              fetchPriority="high"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <FileText className="h-16 w-16 text-muted-foreground/20" />
            </div>
          )}
          <div className="absolute top-3 left-3">
            <Badge className="bg-accent text-accent-foreground border-accent">Featured</Badge>
          </div>
        </div>
        <div className="flex flex-col justify-center p-6 md:p-8">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {post.blog_categories && (
              <Badge variant="secondary" className="text-xs font-medium">
                {post.blog_categories.name}
              </Badge>
            )}
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {date}
            </span>
          </div>
          <h2 className="mt-3 text-xl font-bold tracking-tight leading-snug line-clamp-3 transition-colors group-hover:text-accent md:text-2xl">
            {post.title}
          </h2>
          {post.excerpt && (
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed line-clamp-3">
              {post.excerpt}
            </p>
          )}
          <span className="mt-5 flex items-center gap-1.5 text-sm font-medium text-foreground">
            Read Article
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </span>
        </div>
      </div>
    </Link>
  );
}
