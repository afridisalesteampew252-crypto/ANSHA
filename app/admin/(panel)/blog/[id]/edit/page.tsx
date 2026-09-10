'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BlogPostForm } from '@/components/admin/blog-post-form';
import { supabase } from '@/lib/supabase/client';
import type { BlogPost } from '@/lib/types';

export default function EditBlogPostPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFoundFlag, setNotFoundFlag] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('blog_posts')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error || !data) {
        setNotFoundFlag(true);
      } else {
        setPost(data as BlogPost);
      }
      setLoading(false);
    })();
  }, [id]);

  if (notFoundFlag) notFound();

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href="/admin/blog">
          <Button variant="ghost" size="icon">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Edit Article</h1>
          <p className="text-sm text-muted-foreground line-clamp-1">{post?.title || 'Loading...'}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : post ? (
        <BlogPostForm initialPost={post} />
      ) : null}
    </div>
  );
}
