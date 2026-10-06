'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Calendar, Link2, MessageCircle, Facebook, Linkedin, ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BlogCard } from '@/components/public/blog-card';
import { PageBreadcrumbs } from '@/components/seo/page-breadcrumbs';
import { blogImageUrl } from '@/lib/blog-image';
import { sanitizeBlogHtml } from '@/lib/sanitize-html';
import { siteConfig } from '@/lib/site-config';
import type { BlogPostWithCategory, BlogCategory } from '@/lib/types';

/** Article view. Post + related posts are loaded on the server (ISR) and passed in. */
export function BlogPostClient({
  post,
  related,
}: {
  post: BlogPostWithCategory;
  related: BlogPostWithCategory[];
}) {
  const [copied, setCopied] = useState(false);

  const imageUrl = blogImageUrl(post.featured_image);

  const dateStr = post.published_at || post.created_at;
  const date = new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    // Fixed zone so server HTML and client hydration render the same date.
    timeZone: 'UTC',
  });

  const articleUrl = `${siteConfig.url}/blog/${post.slug}`;
  const category = post.blog_categories as BlogCategory | null;

  const shareLinks = [
    {
      icon: MessageCircle,
      label: 'WhatsApp',
      href: `https://wa.me/?text=${encodeURIComponent(`${post.title} — ${articleUrl}`)}`,
    },
    {
      icon: Facebook,
      label: 'Facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(articleUrl)}`,
    },
    {
      icon: Linkedin,
      label: 'LinkedIn',
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(articleUrl)}`,
    },
  ];

  const copyLink = () => {
    navigator.clipboard.writeText(articleUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <div className="border-b border-border bg-secondary/30">
        <div className="container-page py-3">
          <PageBreadcrumbs
            variant="muted"
            includeJsonLd={false}
            items={[
              { name: 'Home', href: '/' },
              { name: 'Insights', href: '/blog' },
              ...(category ? [{ name: category.name, href: `/blog?category=${category.slug}` }] : []),
              { name: post.title },
            ]}
          />
        </div>
      </div>

      <article className="container-page py-8">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6">
            {category && (
              <Link href={`/blog?category=${category.slug}`}>
                <Badge variant="secondary" className="mb-3">{category.name}</Badge>
              </Link>
            )}
            <h1 className="text-2xl font-bold tracking-tight leading-tight md:text-3xl text-balance">
              {post.title}
            </h1>
            {post.excerpt && (
              <p className="mt-3 text-muted-foreground leading-relaxed">{post.excerpt}</p>
            )}
            <div className="mt-4 flex items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                {date}
              </span>
            </div>
          </div>

          {imageUrl && (
            <div className="mb-8 overflow-hidden rounded-xl border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt={post.title}
                className="w-full object-cover"
              />
            </div>
          )}

          {post.content ? (
            <div
              className="prose prose-sm max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-h2:text-xl prose-h3:text-lg prose-a:text-accent prose-img:rounded-lg prose-blockquote:border-accent"
              dangerouslySetInnerHTML={{ __html: sanitizeBlogHtml(post.content) }}
            />
          ) : (
            <p className="text-muted-foreground">No content available.</p>
          )}

          <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-border pt-6">
            <span className="text-sm font-medium text-muted-foreground">Share:</span>
            <Button
              variant="outline"
              size="sm"
              onClick={copyLink}
              className="gap-1.5"
            >
              <Link2 className="h-3.5 w-3.5" />
              {copied ? 'Copied!' : 'Copy Link'}
            </Button>
            {shareLinks.map((s) => (
              <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <s.icon className="h-3.5 w-3.5" />
                  {s.label}
                </Button>
              </a>
            ))}
          </div>

          <div className="mt-10 rounded-xl bg-foreground p-6 text-center text-background md:p-8">
            <h2 className="text-lg font-bold">Looking for stock to export?</h2>
            <p className="mt-2 text-background/60 text-sm">
              Browse published vehicles and parts, or contact ANSHA for sourcing support from Dubai.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <Link href="/vehicles">
                <Button variant="accent">
                  Browse vehicles
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/parts">
                <Button variant="outline" className="bg-transparent border-background/25 text-background hover:bg-background/10 hover:text-background">
                  Browse parts
                </Button>
              </Link>
              <Link href="/machinery">
                <Button variant="outline" className="bg-transparent border-background/25 text-background hover:bg-background/10 hover:text-background">
                  Machinery
                </Button>
              </Link>
              <Link href="/contact">
                <Button variant="outline" className="bg-transparent border-background/25 text-background hover:bg-background/10 hover:text-background">
                  Contact us
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </article>

      {related.length > 0 && (
        <section className="border-t border-border bg-secondary/30 py-12">
          <div className="container-page">
            <h2 className="mb-6 text-xl font-bold tracking-tight">You May Also Like</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((rp) => (
                <BlogCard key={rp.id} post={rp} />
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
