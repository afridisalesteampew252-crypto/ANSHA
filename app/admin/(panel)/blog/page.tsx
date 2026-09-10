'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  PlusCircle, Pencil, Trash2, Eye, Star, StarOff,
  CheckCircle, Archive, FileText, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { BlogPostWithCategory } from '@/lib/types';

const statusColors: Record<string, string> = {
  published: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  draft: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  archived: 'bg-stone-100 text-stone-600 border-stone-200',
};

export default function AdminBlogPage() {
  const [posts, setPosts] = useState<BlogPostWithCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchPosts = useCallback(async () => {
    const { data } = await supabase
      .from('blog_posts')
      .select('*, blog_categories(*)')
      .order('created_at', { ascending: false });
    setPosts((data || []) as unknown as BlogPostWithCategory[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const handleTogglePublish = async (post: BlogPostWithCategory) => {
    setActionLoading(post.id);
    const newStatus = post.status === 'published' ? 'draft' : 'published';
    const { error } = await supabase
      .from('blog_posts')
      .update({
        status: newStatus,
        published_at: newStatus === 'published' ? new Date().toISOString() : null,
      })
      .eq('id', post.id);
    if (error) { toast.error('Failed to update status.'); }
    else {
      toast.success(newStatus === 'published' ? 'Article published.' : 'Article moved to draft.');
      fetchPosts();
    }
    setActionLoading(null);
  };

  const handleToggleFeatured = async (post: BlogPostWithCategory) => {
    setActionLoading(post.id + '_f');
    const { error } = await supabase
      .from('blog_posts')
      .update({ is_featured: !post.is_featured })
      .eq('id', post.id);
    if (error) { toast.error('Failed to update.'); }
    else { toast.success('Updated.'); fetchPosts(); }
    setActionLoading(null);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('blog_posts').delete().eq('id', deleteId);
    if (error) { toast.error('Failed to delete article.'); }
    else { toast.success('Article deleted.'); fetchPosts(); }
    setDeleteId(null);
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Blog Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{posts.length} article{posts.length !== 1 ? 's' : ''}</p>
        </div>
        <Link href="/admin/blog/new">
          <Button variant="accent" size="sm">
            <PlusCircle className="h-4 w-4" />
            New Article
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center border border-dashed border-border rounded-xl">
          <FileText className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <h3 className="font-semibold">No articles yet</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-4">Create your first blog article to get started.</p>
          <Link href="/admin/blog/new">
            <Button variant="accent" size="sm">
              <PlusCircle className="h-4 w-4" />
              New Article
            </Button>
          </Link>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Published</TableHead>
                <TableHead>Featured</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {posts.map((post) => {
                const dateStr = post.published_at || post.created_at;
                const date = new Date(dateStr).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric',
                });
                return (
                  <TableRow key={post.id}>
                    <TableCell className="font-medium max-w-xs">
                      <span className="line-clamp-2 text-sm">{post.title}</span>
                    </TableCell>
                    <TableCell>
                      {post.blog_categories ? (
                        <Badge variant="secondary" className="text-xs">{post.blog_categories.name}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`capitalize text-xs ${statusColors[post.status] || ''}`}>
                        {post.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{date}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={actionLoading === post.id + '_f'}
                        onClick={() => handleToggleFeatured(post)}
                        title={post.is_featured ? 'Remove featured' : 'Set featured'}
                      >
                        {post.is_featured
                          ? <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                          : <StarOff className="h-4 w-4 text-muted-foreground" />}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {post.status === 'published' && (
                          <a href={`/blog/${post.slug}`} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="icon" title="Preview">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </a>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          title={post.status === 'published' ? 'Unpublish' : 'Publish'}
                          disabled={actionLoading === post.id}
                          onClick={() => handleTogglePublish(post)}
                        >
                          {actionLoading === post.id
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : post.status === 'published'
                              ? <Archive className="h-4 w-4" />
                              : <CheckCircle className="h-4 w-4" />}
                        </Button>
                        <Link href={`/admin/blog/${post.id}/edit`}>
                          <Button variant="ghost" size="icon" title="Edit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Delete"
                          onClick={() => setDeleteId(post.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Article?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The article will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
