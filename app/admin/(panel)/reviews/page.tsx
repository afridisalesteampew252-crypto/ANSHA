'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronDown, Eye, EyeOff, Loader2, Pencil, Plus, Star, Trash2, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { isOpsRole } from '@/lib/admin-rbac';
import { supabase } from '@/lib/supabase/client';
import type { AdminProfile, Review } from '@/lib/types';

type FormState = {
  name: string;
  role: string;
  location: string;
  quote: string;
  rating: number;
  sort_order: number;
  is_published: boolean;
  avatar_url: string;
};

const emptyForm = (): FormState => ({
  name: '',
  role: '',
  location: '',
  quote: '',
  rating: 5,
  sort_order: 100,
  is_published: true,
  avatar_url: '',
});

function toForm(row: Review): FormState {
  return {
    name: row.name,
    role: row.role || '',
    location: row.location || '',
    quote: row.quote,
    rating: row.rating,
    sort_order: row.sort_order,
    is_published: row.is_published,
    avatar_url: row.avatar_url || '',
  };
}

export default function AdminReviewsPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [rows, setRows] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/admin');
        return;
      }
      const { data: prof } = await supabase
        .from('admin_profiles')
        .select('role,is_active')
        .eq('id', session.user.id)
        .maybeSingle();
      const profile = prof as Pick<AdminProfile, 'role' | 'is_active'> | null;
      if (!profile || profile.is_active === false || !isOpsRole(profile.role)) {
        toast.error('Reviews are limited to admin and staff.');
        router.replace('/admin/dashboard');
        return;
      }
      setAllowed(true);
    })();
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('reviews')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });
    if (error) toast.error(error.message);
    setRows((data || []) as Review[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      ...emptyForm(),
      sort_order: rows.length ? Math.max(...rows.map((r) => r.sort_order)) + 10 : 10,
    });
    setFormOpen(true);
  };

  const openEdit = (row: Review) => {
    setEditingId(row.id);
    setForm(toForm(row));
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm());
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.quote.trim()) {
      toast.error('Name and quote are required.');
      return;
    }
    if (form.rating < 1 || form.rating > 5) {
      toast.error('Rating must be between 1 and 5.');
      return;
    }

    setSaving(true);
    const payload = {
      name: form.name.trim(),
      role: form.role.trim() || null,
      location: form.location.trim() || null,
      quote: form.quote.trim(),
      rating: form.rating,
      sort_order: Number.isFinite(form.sort_order) ? form.sort_order : 0,
      is_published: form.is_published,
      avatar_url: form.avatar_url.trim() || null,
    };

    const { error } = editingId
      ? await supabase.from('reviews').update(payload).eq('id', editingId)
      : await supabase.from('reviews').insert(payload);

    setSaving(false);
    if (error) {
      toast.error(error.message || 'Failed to save review.');
      return;
    }
    toast.success(editingId ? 'Review updated.' : 'Review created.');
    closeForm();
    void load();
  };

  const togglePublished = async (row: Review) => {
    setActionId(row.id);
    const { error } = await supabase
      .from('reviews')
      .update({ is_published: !row.is_published })
      .eq('id', row.id);
    setActionId(null);
    if (error) toast.error(error.message);
    else {
      toast.success(row.is_published ? 'Unpublished.' : 'Published.');
      void load();
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setActionId(deleteId);
    const { error } = await supabase.from('reviews').delete().eq('id', deleteId);
    setActionId(null);
    setDeleteId(null);
    if (error) toast.error(error.message);
    else {
      toast.success('Review deleted.');
      void load();
    }
  };

  if (!allowed) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Customer reviews</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Curated testimonials shown on the home page and{' '}
            <a href="/reviews" target="_blank" rel="noopener noreferrer" className="text-accent underline-offset-2 hover:underline">
              /reviews
            </a>
            .
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Add review
        </Button>
      </div>

      {formOpen ? (
        <form onSubmit={handleSave} className="space-y-4 rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">{editingId ? 'Edit review' : 'New review'}</h2>
            <Button type="button" variant="ghost" size="icon" onClick={closeForm} aria-label="Close form">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="review-name">Name *</Label>
              <Input
                id="review-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Customer name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="review-role">Role / title</Label>
              <Input
                id="review-role"
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                placeholder="Importer, workshop manager…"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="review-location">Location</Label>
              <Input
                id="review-location"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="Dubai, UAE"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="review-rating">Rating (1–5)</Label>
              <Input
                id="review-rating"
                type="number"
                min={1}
                max={5}
                value={form.rating}
                onChange={(e) => setForm((f) => ({ ...f, rating: Number(e.target.value) || 5 }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="review-sort">Sort order</Label>
              <Input
                id="review-sort"
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) || 0 }))}
              />
              <p className="text-xs text-muted-foreground">Lower numbers appear first.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="review-avatar">Avatar URL (optional)</Label>
              <Input
                id="review-avatar"
                value={form.avatar_url}
                onChange={(e) => setForm((f) => ({ ...f, avatar_url: e.target.value }))}
                placeholder="https://…"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="review-quote">Quote *</Label>
            <Textarea
              id="review-quote"
              rows={4}
              value={form.quote}
              onChange={(e) => setForm((f) => ({ ...f, quote: e.target.value }))}
              placeholder="What the customer said…"
              required
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Switch
                id="review-published"
                checked={form.is_published}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, is_published: checked }))}
              />
              <Label htmlFor="review-published" className="cursor-pointer">Published</Label>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={closeForm}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {saving ? 'Saving…' : editingId ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </form>
      ) : null}

      <div className="rounded-xl border border-border bg-card">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-muted-foreground">
            No reviews yet. Add the first customer testimonial.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="hidden md:table-cell">Quote</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{row.sort_order}</TableCell>
                  <TableCell>
                    <div className="font-medium">{row.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {[row.role, row.location].filter(Boolean).join(' · ')}
                    </div>
                  </TableCell>
                  <TableCell className="hidden max-w-md md:table-cell">
                    <p className="line-clamp-2 text-sm text-muted-foreground">&ldquo;{row.quote}&rdquo;</p>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1 text-sm">
                      <Star className="h-3.5 w-3.5 fill-accent text-accent" />
                      {row.rating}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        row.is_published
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-stone-200 bg-stone-100 text-stone-600'
                      }
                    >
                      {row.is_published ? 'Published' : 'Draft'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" variant="outline" size="sm" className="gap-1">
                            Actions
                            <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem disabled={actionId === row.id} onSelect={() => void togglePublished(row)}>
                            {row.is_published ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            {row.is_published ? 'Unpublish' : 'Publish'}
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => openEdit(row)}>
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() => setDeleteId(row.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this review?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the testimonial from the site. You can unpublish instead if you may want it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
