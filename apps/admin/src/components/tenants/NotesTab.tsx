'use client';

import { useEffect, useState } from 'react';
import {
  Pin,
  PinOff,
  Trash2,
  Edit3,
  Loader2,
  MessageSquare,
  Plus,
} from 'lucide-react';
import { useTenantNotes } from '@/hooks/use-tenant-management';
import type { NoteType } from '@/types/tenant';

const NOTE_TYPE_CONFIG: Record<NoteType, { label: string; color: string; bg: string }> = {
  general: { label: 'General', color: 'text-slate-400', bg: 'bg-slate-500/10' },
  support_ticket: { label: 'Support', color: 'text-blue-400', bg: 'bg-blue-500/10' },
  escalation: { label: 'Escalation', color: 'text-red-400', bg: 'bg-red-500/10' },
  implementation: { label: 'Implementation', color: 'text-purple-400', bg: 'bg-purple-500/10' },
  financial: { label: 'Financial', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
};

interface Props {
  tenantId: string;
}

export function NotesTab({ tenantId }: Props) {
  const { notes, isLoading, error, load, create, update, remove } = useTenantNotes(tenantId);
  const [showForm, setShowForm] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newType, setNewType] = useState<NoteType>('general');
  const [newPinned, setNewPinned] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    if (!newContent.trim()) return;
    await create(newContent.trim(), newType, newPinned);
    setNewContent('');
    setNewType('general');
    setNewPinned(false);
    setShowForm(false);
  }

  async function handleSaveEdit(noteId: string) {
    if (!editContent.trim()) return;
    await update(noteId, { content: editContent.trim() });
    setEditingId(null);
    setEditContent('');
  }

  if (isLoading && notes.length === 0) {
    return <div className="flex items-center gap-2 text-slate-400 text-sm py-8"><Loader2 size={16} className="animate-spin" /> Loading notes...</div>;
  }

  if (error) {
    return <p className="text-red-400 text-sm">{error}</p>;
  }

  return (
    <div className="space-y-4">
      {/* Create note button */}
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-colors"
        >
          <Plus size={14} />
          Add Note
        </button>
      )}

      {/* Create note form */}
      {showForm && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 space-y-3">
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Write a note..."
            rows={3}
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 resize-none focus:outline-none focus:border-indigo-500"
          />
          <div className="flex items-center gap-3">
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as NoteType)}
              className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white"
            >
              {Object.entries(NOTE_TYPE_CONFIG).map(([key, cfg]) => (
                <option key={key} value={key}>{cfg.label}</option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-sm text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={newPinned}
                onChange={(e) => setNewPinned(e.target.checked)}
                className="rounded border-slate-600 bg-slate-900 text-indigo-500"
              />
              Pin
            </label>
            <div className="flex-1" />
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 text-sm text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!newContent.trim()}
              className="px-4 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Notes list */}
      {notes.length === 0 && !showForm && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-8 text-center">
          <MessageSquare size={32} className="text-slate-600 mx-auto mb-2" />
          <p className="text-sm text-slate-400">No notes yet. Add one to get started.</p>
        </div>
      )}

      {notes.map((note) => {
        const cfg = NOTE_TYPE_CONFIG[note.noteType as NoteType] ?? NOTE_TYPE_CONFIG.general;
        const isEditing = editingId === note.id;

        return (
          <div key={note.id} className={`bg-slate-800 rounded-xl border ${note.isPinned ? 'border-amber-500/30' : 'border-slate-700'} p-5 group`}>
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                {/* Header */}
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                  {note.isPinned && <Pin size={12} className="text-amber-400" />}
                  <span className="text-xs text-slate-500">
                    {note.authorName} · {new Date(note.createdAt).toLocaleString()}
                  </span>
                </div>

                {/* Content */}
                {isEditing ? (
                  <div className="space-y-2">
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={3}
                      className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white resize-none focus:outline-none focus:border-indigo-500"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSaveEdit(note.id)}
                        className="px-3 py-1 text-xs font-medium rounded bg-indigo-600 text-white hover:bg-indigo-500"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1 text-xs text-slate-400 hover:text-white"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-300 whitespace-pre-wrap">{note.content}</p>
                )}
              </div>

              {/* Actions */}
              {!isEditing && (
                <div className="shrink-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => update(note.id, { isPinned: !note.isPinned })}
                    className="p-1.5 rounded hover:bg-slate-700 text-slate-500 hover:text-white transition-colors"
                    title={note.isPinned ? 'Unpin' : 'Pin'}
                  >
                    {note.isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                  </button>
                  <button
                    onClick={() => { setEditingId(note.id); setEditContent(note.content); }}
                    className="p-1.5 rounded hover:bg-slate-700 text-slate-500 hover:text-white transition-colors"
                    title="Edit"
                  >
                    <Edit3 size={14} />
                  </button>
                  <button
                    onClick={() => { if (confirm('Delete this note?')) remove(note.id); }}
                    className="p-1.5 rounded hover:bg-slate-700 text-slate-500 hover:text-red-400 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
