'use client';

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BlogPostForm } from '@/components/admin/blog-post-form';

export default function NewBlogPostPage() {
  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href="/admin/blog">
          <Button variant="ghost" size="icon">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold tracking-tight">New Article</h1>
          <p className="text-sm text-muted-foreground">Create a new blog article</p>
        </div>
      </div>
      <BlogPostForm />
    </div>
  );
}
