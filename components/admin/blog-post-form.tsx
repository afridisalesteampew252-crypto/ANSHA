'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Loader2, Upload, X, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/lib/supabase/client';
import { sendWebPush } from '@/lib/web-push';
import { toast } from 'sonner';
import type { BlogCategory, BlogPost } from '@/lib/types';

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

interface BlogPostFormProps {
  initialPost?: BlogPost;
}

export function BlogPostForm({ initialPost }: BlogPostFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [categories, setCategories] = useState<BlogCategory[]>([]);

  const [title, setTitle] = useState(initialPost?.title || '');
  const [slug, setSlug] = useState(initialPost?.slug || '');
  const [slugManual, setSlugManual] = useState(!!initialPost?.slug);
  const [excerpt, setExcerpt] = useState(initialPost?.excerpt || '');
  const [content, setContent] = useState(initialPost?.content || '');
  const [categoryId, setCategoryId] = useState(initialPost?.category_id || '');
  const [featuredImage, setFeaturedImage] = useState(initialPost?.featured_image || '');
  const [status, setStatus] = useState<'draft' | 'published' | 'archived'>(initialPost?.status || 'draft');
  const [isFeatured, setIsFeatured] = useState(initialPost?.is_featured ?? false);
  const [metaTitle, setMetaTitle] = useState(initialPost?.meta_title || '');
  const [metaDesc, setMetaDesc] = useState(initialPost?.meta_description || '');
  const [newCatName, setNewCatName] = useState('');
  const [addingCat, setAddingCat] = useState(false);
  const [notifyPush, setNotifyPush] = useState(false);

  useEffect(() => {
    supabase.from('blog_categories').select('*').order('name').then(({ data }) => {
      setCategories((data || []) as BlogCategory[]);
    });
  }, []);

  useEffect(() => {
    if (!slugManual && title) {
      setSlug(slugify(title));
    }
  }, [title, slugManual]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Only image files are allowed.'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5MB.'); return; }

    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from('blog-images').upload(path, file, { upsert: false });
    if (error) {
      if (error.message?.includes('Bucket not found') || (error as unknown as Record<string, number>).statusCode === 400) {
        toast.error('Blog images bucket not yet created. Please create a "blog-images" bucket in Supabase Storage.');
      } else {
        toast.error('Upload failed. Try again.');
      }
      setUploading(false);
      return;
    }
    setFeaturedImage(path);
    toast.success('Image uploaded.');
    setUploading(false);
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    setAddingCat(true);
    const catSlug = slugify(newCatName.trim());
    const { data, error } = await supabase
      .from('blog_categories')
      .insert({ name: newCatName.trim(), slug: catSlug })
      .select()
      .single();
    if (error) { toast.error('Failed to create category.'); }
    else {
      const newCat = data as BlogCategory;
      setCategories((prev) => [...prev, newCat].sort((a, b) => a.name.localeCompare(b.name)));
      setCategoryId(newCat.id);
      setNewCatName('');
      toast.success('Category created.');
    }
    setAddingCat(false);
  };

  const handleSave = async (targetStatus?: 'draft' | 'published') => {
    if (!title.trim()) { toast.error('Title is required.'); return; }
    if (!slug.trim()) { toast.error('Slug is required.'); return; }

    setSaving(true);
    const finalStatus = targetStatus || status;
    const payload = {
      title: title.trim(),
      slug: slug.trim(),
      excerpt: excerpt.trim() || null,
      content: content.trim() || null,
      featured_image: featuredImage || null,
      category_id: categoryId || null,
      status: finalStatus,
      is_featured: isFeatured,
      meta_title: metaTitle.trim() || null,
      meta_description: metaDesc.trim() || null,
      published_at: finalStatus === 'published' && !initialPost?.published_at
        ? new Date().toISOString()
        : initialPost?.published_at ?? null,
    };

    let error;
    if (initialPost) {
      ({ error } = await supabase.from('blog_posts').update(payload).eq('id', initialPost.id));
    } else {
      ({ error } = await supabase.from('blog_posts').insert(payload));
    }

    if (error) {
      setSaving(false);
      if (error.code === '23505') { toast.error('A post with this slug already exists. Use a different slug.'); }
      else { toast.error('Failed to save. Please try again.'); }
      return;
    }

    if (notifyPush && finalStatus === 'published') {
      try {
        const result = await sendWebPush({
          topic: 'insights',
          title: title.trim().slice(0, 120),
          body: (excerpt.trim() || 'New insight from ANSHA Trading.').slice(0, 300),
          url: `/blog/${slug.trim()}`,
        });
        toast.success(`Article published. Push sent to ${result.sent} devices.`);
      } catch (pushError) {
        toast.error(
          pushError instanceof Error
            ? pushError.message
            : 'Article saved, but push failed. Check VAPID secrets.'
        );
      }
    } else {
      toast.success(initialPost ? 'Article updated.' : 'Article created.');
    }

    setSaving(false);
    router.push('/admin/blog');
  };

  const imageUrl = featuredImage
    ? featuredImage.startsWith('http')
      ? featuredImage
      : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/blog-images/${featuredImage}`
    : null;

  return (
    <div className="max-w-4xl space-y-6">
      {/* Title + Slug */}
      <div className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="space-y-2">
          <Label htmlFor="title">Title *</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Article title"
            className="text-base"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="slug">Slug *</Label>
          <div className="flex gap-2">
            <Input
              id="slug"
              value={slug}
              onChange={(e) => { setSlug(e.target.value); setSlugManual(true); }}
              placeholder="article-slug"
              className="font-mono text-sm"
            />
            {slugManual && (
              <Button variant="ghost" size="sm" onClick={() => { setSlugManual(false); setSlug(slugify(title)); }}>
                Reset
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">URL: /blog/{slug || 'article-slug'}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="excerpt">Excerpt</Label>
              <Textarea
                id="excerpt"
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                rows={3}
                placeholder="Short summary shown in article cards and listings..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="content">Article Content (HTML)</Label>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={20}
                placeholder="<h2>Introduction</h2><p>Your article content here...</p>"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Supports HTML. Use &lt;h2&gt;, &lt;h3&gt;, &lt;p&gt;, &lt;ul&gt;, &lt;ol&gt;, &lt;li&gt;, &lt;strong&gt;, &lt;a&gt;, &lt;img&gt;, &lt;blockquote&gt;.
              </p>
            </div>
          </div>

          {/* SEO */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h3 className="font-semibold text-sm">SEO</h3>
            <div className="space-y-2">
              <Label htmlFor="meta-title">Meta Title</Label>
              <Input
                id="meta-title"
                value={metaTitle}
                onChange={(e) => setMetaTitle(e.target.value)}
                placeholder={title || 'SEO page title'}
              />
              <p className="text-xs text-muted-foreground">{metaTitle.length}/60 characters</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="meta-desc">Meta Description</Label>
              <Textarea
                id="meta-desc"
                value={metaDesc}
                onChange={(e) => setMetaDesc(e.target.value)}
                rows={2}
                placeholder="Short description for search engines..."
              />
              <p className="text-xs text-muted-foreground">{metaDesc.length}/160 characters</p>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Actions */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h3 className="font-semibold text-sm">Publish</h3>
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center justify-between">
              <Label htmlFor="is-featured" className="cursor-pointer">Featured Article</Label>
              <Switch id="is-featured" checked={isFeatured} onCheckedChange={setIsFeatured} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="notify-push" className="cursor-pointer text-sm leading-snug">
                PWA push on publish
              </Label>
              <Switch id="notify-push" checked={notifyPush} onCheckedChange={setNotifyPush} />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Sends to visitors who opted in for insights alerts.
            </p>
            <div className="flex flex-col gap-2 pt-1">
              <Button onClick={() => handleSave()} disabled={saving} className="w-full">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? 'Saving...' : 'Save'}
              </Button>
              {status !== 'published' && (
                <Button
                  variant="accent"
                  onClick={() => handleSave('published')}
                  disabled={saving}
                  className="w-full"
                >
                  Publish Now
                </Button>
              )}
              {initialPost?.status === 'published' && (
                <a href={`/blog/${initialPost.slug}`} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="w-full">
                    <Eye className="h-4 w-4" />
                    Preview Live
                  </Button>
                </a>
              )}
            </div>
          </div>

          {/* Category */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h3 className="font-semibold text-sm">Category</h3>
            <Select value={categoryId || 'none'} onValueChange={(v) => setCategoryId(v === 'none' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No category</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Input
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="New category..."
                className="text-sm"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCategory(); } }}
              />
              <Button variant="outline" size="sm" onClick={handleAddCategory} disabled={addingCat || !newCatName.trim()}>
                {addingCat ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Add'}
              </Button>
            </div>
          </div>

          {/* Featured image */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h3 className="font-semibold text-sm">Featured Image</h3>
            {imageUrl ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt="Featured" className="w-full rounded-lg object-cover aspect-[16/9]" />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2 h-7 w-7"
                  onClick={() => setFeaturedImage('')}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-6 text-center">
                <Upload className="h-8 w-8 text-muted-foreground/40 mb-2" />
                <p className="text-xs text-muted-foreground mb-2">Upload image (max 5MB)</p>
                <label className="cursor-pointer">
                  <Button variant="outline" size="sm" asChild disabled={uploading}>
                    <span>
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      {uploading ? 'Uploading...' : 'Choose Image'}
                    </span>
                  </Button>
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                </label>
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Or enter image URL</Label>
              <Input
                value={featuredImage.startsWith('http') ? featuredImage : ''}
                onChange={(e) => setFeaturedImage(e.target.value)}
                placeholder="https://..."
                className="text-xs"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
