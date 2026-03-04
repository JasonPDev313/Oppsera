'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Bold, Italic, Underline, List, ListOrdered, Link, Heading2, Heading3, Check, X } from 'lucide-react';

/** Strip dangerous HTML tags/attributes to prevent XSS from stored content. */
function sanitizeHtml(html: string): string {
  const ALLOWED_TAGS = new Set([
    'p', 'br', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li',
    'h1', 'h2', 'h3', 'h4', 'a', 'span', 'div', 'blockquote',
  ]);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  function walk(node: Node): void {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as Element;
        if (!ALLOWED_TAGS.has(el.tagName.toLowerCase())) {
          el.replaceWith(...Array.from(el.childNodes));
          continue;
        }
        // Strip all attributes except href on <a>
        for (const attr of Array.from(el.attributes)) {
          if (el.tagName.toLowerCase() === 'a' && attr.name === 'href') {
            // Only allow http/https/mailto URLs
            if (!/^(https?:|mailto:)/i.test(attr.value)) el.removeAttribute(attr.name);
          } else if (attr.name !== 'class') {
            el.removeAttribute(attr.name);
          }
        }
        walk(el);
      }
    }
  }
  walk(doc.body);
  return doc.body.innerHTML;
}

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  maxLength?: number;
  placeholder?: string;
  disabled?: boolean;
}

export function RichTextEditor({
  value,
  onChange,
  maxLength = 5000,
  placeholder = 'Start writing...',
  disabled = false,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [charCount, setCharCount] = useState(0);
  const isInitializedRef = useRef(false);
  const [linkInputOpen, setLinkInputOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const linkInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editorRef.current && !isInitializedRef.current) {
      editorRef.current.innerHTML = sanitizeHtml(value);
      setCharCount(editorRef.current.textContent?.length ?? 0);
      isInitializedRef.current = true;
    }
  }, [value]);

  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    const textLen = editorRef.current.textContent?.length ?? 0;
    setCharCount(textLen);
    onChange(html);
  }, [onChange]);

  function execCommand(command: string, value?: string) {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    handleInput();
  }

  function handleLinkButtonClick() {
    setLinkUrl('');
    setLinkInputOpen(true);
    // Focus the input on next tick after render
    setTimeout(() => linkInputRef.current?.focus(), 0);
  }

  function handleLinkSubmit() {
    const url = linkUrl.trim();
    if (url) {
      execCommand('createLink', url);
    }
    setLinkInputOpen(false);
    setLinkUrl('');
  }

  function handleLinkKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleLinkSubmit();
    } else if (e.key === 'Escape') {
      setLinkInputOpen(false);
      setLinkUrl('');
    }
  }

  const charPercent = maxLength > 0 ? (charCount / maxLength) * 100 : 0;
  const counterColor = charPercent >= 100 ? 'text-red-500' : charPercent >= 90 ? 'text-amber-500' : 'text-muted-foreground';

  return (
    <div className={`rounded-md border border-input bg-surface ${disabled ? 'opacity-60 pointer-events-none' : ''}`}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-2 py-1">
        <ToolbarButton icon={<Bold className="h-4 w-4" />} onClick={() => execCommand('bold')} title="Bold" />
        <ToolbarButton icon={<Italic className="h-4 w-4" />} onClick={() => execCommand('italic')} title="Italic" />
        <ToolbarButton icon={<Underline className="h-4 w-4" />} onClick={() => execCommand('underline')} title="Underline" />
        <div className="mx-1 h-5 w-px bg-muted" />
        <ToolbarButton icon={<Heading2 className="h-4 w-4" />} onClick={() => execCommand('formatBlock', 'h2')} title="Heading 2" />
        <ToolbarButton icon={<Heading3 className="h-4 w-4" />} onClick={() => execCommand('formatBlock', 'h3')} title="Heading 3" />
        <div className="mx-1 h-5 w-px bg-muted" />
        <ToolbarButton icon={<List className="h-4 w-4" />} onClick={() => execCommand('insertUnorderedList')} title="Bullet list" />
        <ToolbarButton icon={<ListOrdered className="h-4 w-4" />} onClick={() => execCommand('insertOrderedList')} title="Numbered list" />
        <div className="mx-1 h-5 w-px bg-muted" />
        <ToolbarButton icon={<Link className="h-4 w-4" />} onClick={handleLinkButtonClick} title="Insert link" />
      </div>

      {/* Inline link URL input */}
      {linkInputOpen && (
        <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
          <Link className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            ref={linkInputRef}
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={handleLinkKeyDown}
            placeholder="https://example.com"
            className="min-w-0 flex-1 rounded border border-input bg-surface px-2 py-1 text-xs text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleLinkSubmit}
            title="Insert link"
            className="rounded p-1 text-green-500 hover:bg-green-500/10"
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => { setLinkInputOpen(false); setLinkUrl(''); }}
            title="Cancel"
            className="rounded p-1 text-muted-foreground hover:bg-accent/60 hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Editor area */}
      <div
        ref={editorRef}
        contentEditable={!disabled}
        onInput={handleInput}
        data-placeholder={placeholder}
        className="min-h-[160px] px-3 py-2 text-sm outline-none [&:empty]:before:text-muted-foreground [&:empty]:before:content-[attr(data-placeholder)] prose prose-sm max-w-none"
      />

      {/* Character counter */}
      <div className="flex justify-end border-t border-border px-3 py-1">
        <span className={`text-xs ${counterColor}`}>
          {charCount.toLocaleString()}/{maxLength.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

function ToolbarButton({
  icon,
  onClick,
  title,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="rounded p-1.5 text-muted-foreground hover:bg-accent/60 hover:text-foreground"
    >
      {icon}
    </button>
  );
}
