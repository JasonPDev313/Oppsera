'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Bold, Italic, Underline, List, ListOrdered, Link, Heading2, Heading3 } from 'lucide-react';

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

  useEffect(() => {
    if (editorRef.current && !isInitializedRef.current) {
      editorRef.current.innerHTML = value;
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

  function handleLink() {
    const url = window.prompt('Enter URL:');
    if (url) {
      execCommand('createLink', url);
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
        <ToolbarButton icon={<Link className="h-4 w-4" />} onClick={handleLink} title="Insert link" />
      </div>

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
