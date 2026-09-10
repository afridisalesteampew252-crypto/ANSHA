'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ChevronRight, Calendar, FileText, Link2, MessageCircle, Facebook, Linkedin, ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { BlogCard } from '@/components/public/blog-card';
import { supabase } from '@/lib/supabase/client';
import { siteConfig } from '@/lib/site-config';
import type { BlogPostWithCategory, BlogCategory } from '@/lib/types';

export default function BlogPostPage({ params }: { params: { slug: string } }) {
  const { slug } = params;
  const [post, setPost] = useState<BlogPostWithCategory | null>(null);
  const [related, setRelated] = useState<BlogPostWithCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFoundFlag, setNotFoundFlag] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('blog_posts')
        .select('*, blog_categories(*)')
        .eq('slug', slug)
        .eq('status', 'published')
        .maybeSingle();

      if (error || !data) {
        setNotFoundFlag(true);
        setLoading(false);
        return;
      }

      const typedPost = data as unknown as BlogPostWithCategory;
      setPost(typedPost);
      setLoading(false);

      if (typedPost.category_id) {
        const { data: relData } = await supabase
          .from('blog_posts')
          .select('*, blog_categories(*)')
          .eq('status', 'published')
          .eq('category_id', typedPost.category_id)
          .neq('id', typedPost.id)
          .order('published_at', { ascending: false, nullsFirst: false })
          .limit(3);

        if (relData && relData.length > 0) {
          setRelated(relData as unknown as BlogPostWithCategory[]);
        } else {
          const { data: latestData } = await supabase
            .from('blog_posts')
            .select('*, blog_categories(*)')
            .eq('status', 'published')
            .neq('id', typedPost.id)
            .order('published_at', { ascending: false, nullsFirst: false })
            .limit(3);
          setRelated((latestData || []) as unknown as BlogPostWithCategory[]);
        }
      } else {
        const { data: latestData } = await supabase
          .from('blog_posts')
          .select('*, blog_categories(*)')
          .eq('status', 'published')
          .neq('id', typedPost.id)
          .order('published_at', { ascending: false, nullsFirst: false })
          .limit(3);
        setRelated((latestData || []) as unknown as BlogPostWithCategory[]);
      }
    })();
  }, [slug]);

  if (notFoundFlag) {
    notFound();
  }

  if (loading || !post) {
    return (
      <div className="container-page py-8 max-w-3xl">
        <Skeleton className="h-5 w-48 mb-6" />
        <Skeleton className="h-10 w-3/4 mb-4" />
        <Skeleton className="h-5 w-1/2 mb-6" />
        <Skeleton className="aspect-[16/9] w-full rounded-xl mb-6" />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const imageUrl = post.featured_image
    ? post.featured_image.startsWith('http')
      ? post.featured_image
      : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/blog-images/${post.featured_image}`
    : null;

  const dateStr = post.published_at || post.created_at;
  const date = new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
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
      {/* Breadcrumb */}
      <div className="border-b border-border bg-secondary/30">
        <div className="container-page py-3">
          <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground">Home</Link>
            <ChevronRight className="h-4 w-4" />
            <Link href="/blog" className="hover:text-foreground">Blog</Link>
            {category && (
              <>
                <ChevronRight className="h-4 w-4" />
                <Link href={`/blog?category=${category.slug}`} className="hover:text-foreground">
                  {category.name}
                </Link>
              </>
            )}
            <ChevronRight className="h-4 w-4" />
            <span className="text-foreground font-medium truncate">{post.title}</span>
          </nav>
        </div>
      </div>

      <article className="container-page py-8">
        <div className="mx-auto max-w-3xl">
          {/* Header */}
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

          {/* Featured image */}
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

          {/* Content */}
          {post.content ? (
            <div
              className="prose prose-sm max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-h2:text-xl prose-h3:text-lg prose-a:text-accent prose-img:rounded-lg prose-blockquote:border-accent"
              dangerouslySetInnerHTML={{ __html: post.content }}
            />
          ) : (
            <p className="text-muted-foreground">No content available.</p>
          )}

          {/* Share */}
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

          {/* CTA */}
          <div className="mt-10 rounded-xl bg-foreground p-6 text-center text-background md:p-8">
            <h2 className="text-lg font-bold">Looking for Japanese Auto Parts?</h2>
            <p className="mt-2 text-background/60 text-sm">
              Search our available stock or contact Ansha Trading for assistance.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <Link href="/parts">
                <Button variant="accent">
                  Browse Parts
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/contact">
                <Button variant="outline" className="bg-transparent border-background/25 text-background hover:bg-background/10 hover:text-background">
                  Contact Us
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </article>

      {/* Related */}
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
