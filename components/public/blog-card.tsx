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
  });

  return (
    <Card className="group overflow-hidden transition-all duration-200 hover:shadow-card-hover hover:border-foreground/15">
      <Link href={`/blog/${post.slug}`} className="block">
        <div className="relative aspect-[16/10] bg-secondary overflow-hidden">
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
              <FileText className="h-10 w-10 text-muted-foreground/25" />
            </div>
          )}
        </div>
      </Link>
      <CardContent className="p-4">
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
        <Link href={`/blog/${post.slug}`} className="block mt-2.5">
          <h3 className="font-semibold text-sm leading-snug line-clamp-2 transition-colors group-hover:text-accent">
            {post.title}
          </h3>
        </Link>
        {post.excerpt && (
          <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {post.excerpt}
          </p>
        )}
        <Link
          href={`/blog/${post.slug}`}
          className="mt-3 flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Read Article
          <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </CardContent>
    </Card>
  );
}
