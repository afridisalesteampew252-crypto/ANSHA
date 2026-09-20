'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Bold, Code2, Eye, Heading2, Heading3, ImageIcon, Italic, Link2, List, ListOrdered, Quote, Type, Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

type Mode = 'write' | 'html' | 'preview';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
}

function exec(command: string, value?: string) {
  document.execCommand(command, false, value);
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Write your article…',
  className,
}: RichTextEditorProps) {
  const [mode, setMode] = useState<Mode>('write');
  const [uploading, setUploading] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const syncingRef = useRef(false);

  useEffect(() => {
    if (mode !== 'write' || !editorRef.current) return;
    if (syncingRef.current) return;
    if (editorRef.current.innerHTML !== (value || '')) {
      editorRef.current.innerHTML = value || '';
    }
  }, [value, mode]);

  const emitFromEditor = () => {
    const html = editorRef.current?.innerHTML || '';
    syncingRef.current = true;
    onChange(html === '<br>' ? '' : html);
    queueMicrotask(() => {
      syncingRef.current = false;
    });
  };

  const run = (command: string, commandValue?: string) => {
    if (mode !== 'write') setMode('write');
    requestAnimationFrame(() => {
      editorRef.current?.focus();
      exec(command, commandValue);
      emitFromEditor();
    });
  };

  const insertLink = () => {
    const url = window.prompt('Link URL', 'https://');
    if (!url) return;
    run('createLink', url);
  };

  const insertImage = () => {
    const url = window.prompt('Image URL', 'https://');
    if (!url) return;
    run('insertImage', url);
  };

  const uploadInlineImage = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      window.alert('Only image files are allowed.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      window.alert('Image must be under 5MB.');
      return;
    }
    setUploading(true);
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `inline/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from('blog-images').upload(path, file, { upsert: false });
    setUploading(false);
    if (error) {
      window.alert(error.message || 'Upload failed.');
      return;
    }
    const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/blog-images/${path}`;
    run('insertImage', publicUrl);
  };

  const tools: { label: string; icon: typeof Bold; action: () => void }[] = [
    { label: 'Bold', icon: Bold, action: () => run('bold') },
    { label: 'Italic', icon: Italic, action: () => run('italic') },
    { label: 'Heading 2', icon: Heading2, action: () => run('formatBlock', 'h2') },
    { label: 'Heading 3', icon: Heading3, action: () => run('formatBlock', 'h3') },
    { label: 'Paragraph', icon: Type, action: () => run('formatBlock', 'p') },
    { label: 'Bullet list', icon: List, action: () => run('insertUnorderedList') },
    { label: 'Numbered list', icon: ListOrdered, action: () => run('insertOrderedList') },
    { label: 'Quote', icon: Quote, action: () => run('formatBlock', 'blockquote') },
    { label: 'Link', icon: Link2, action: insertLink },
    { label: 'Image URL', icon: ImageIcon, action: insertImage },
  ];

  return (
    <div className={cn('overflow-hidden rounded-xl border border-border', className)}>
      <div className="flex flex-wrap items-center gap-1 border-b border-border bg-secondary/40 p-2">
        <div className="mr-2 flex gap-1">
          {(
            [
              { id: 'write' as const, label: 'Write', icon: Type },
              { id: 'html' as const, label: 'HTML', icon: Code2 },
              { id: 'preview' as const, label: 'Preview', icon: Eye },
            ] as const
          ).map((tab) => (
            <Button
              key={tab.id}
              type="button"
              size="sm"
              variant={mode === tab.id ? 'default' : 'ghost'}
              className="h-8 gap-1.5 px-2.5"
              onClick={() => setMode(tab.id)}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </Button>
          ))}
        </div>
        {mode === 'write' ? (
          <div className="flex flex-wrap gap-0.5 border-l border-border pl-2">
            {tools.map((tool) => (
              <Button
                key={tool.label}
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                title={tool.label}
                aria-label={tool.label}
                onMouseDown={(event) => event.preventDefault()}
                onClick={tool.action}
              >
                <tool.icon className="h-3.5 w-3.5" />
              </Button>
            ))}
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              title="Upload image"
              aria-label="Upload image"
              disabled={uploading}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" />
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void uploadInlineImage(file);
              }}
            />
          </div>
        ) : null}
      </div>

      {mode === 'write' ? (
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline
          aria-label="Article content"
          data-placeholder={placeholder}
          className={cn(
            'min-h-[22rem] max-w-none overflow-y-auto px-4 py-3 text-sm leading-relaxed outline-none',
            'prose prose-sm max-w-none prose-headings:font-bold prose-a:text-accent',
            'empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]'
          )}
          onInput={emitFromEditor}
          onBlur={emitFromEditor}
        />
      ) : null}

      {mode === 'html' ? (
        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={18}
          placeholder="<h2>Introduction</h2><p>Your article…</p>"
          className="min-h-[22rem] rounded-none border-0 font-mono text-sm focus-visible:ring-0"
        />
      ) : null}

      {mode === 'preview' ? (
        value.trim() ? (
          <div
            className="prose prose-sm min-h-[22rem] max-w-none px-4 py-3 prose-headings:font-bold prose-a:text-accent prose-img:rounded-lg"
            dangerouslySetInnerHTML={{ __html: value }}
          />
        ) : (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">Nothing to preview yet.</p>
        )
      ) : null}

      <p className="border-t border-border bg-secondary/20 px-3 py-2 text-[11px] text-muted-foreground">
        Stored as HTML. Use Write for formatting, upload for inline images (blog-images bucket), HTML for raw markup, Preview before publish.
      </p>
    </div>
  );
}
