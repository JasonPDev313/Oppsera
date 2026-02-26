'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, MoreHorizontal, Pencil, Copy, Archive, RotateCcw, LayoutDashboard } from 'lucide-react';
import { useRoomLayouts, archiveRoomApi, unarchiveRoomApi } from '@/hooks/use-room-layouts';
import type { RoomRow } from '@/types/room-layouts';
import { CreateRoomDialog } from '@/components/room-layouts/dialogs/create-room-dialog';
import { EditRoomDialog } from '@/components/room-layouts/dialogs/edit-room-dialog';
import { DuplicateRoomDialog } from '@/components/room-layouts/dialogs/duplicate-room-dialog';

export default function RoomLayoutsContent() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editRoom, setEditRoom] = useState<RoomRow | null>(null);
  const [duplicateRoom, setDuplicateRoom] = useState<RoomRow | null>(null);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const { data: rooms, isLoading, mutate } = useRoomLayouts({
    search: debouncedSearch || undefined,
    isActive: showArchived ? undefined : true,
  });

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Initial load + reload on search/filter change
  useEffect(() => {
    mutate();
  }, [mutate, debouncedSearch, showArchived]);

  const handleArchive = useCallback(async (roomId: string) => {
    if (!confirm('Archive this room? It can be restored later.')) return;
    try {
      await archiveRoomApi(roomId);
      mutate();
    } catch {
      alert('Failed to archive room');
    }
  }, [mutate]);

  const handleRestore = useCallback(async (roomId: string) => {
    try {
      await unarchiveRoomApi(roomId);
      mutate();
    } catch {
      alert('Failed to restore room');
    }
  }, [mutate]);

  const getRoomStatus = (room: RoomRow) => {
    if (!room.isActive) return { label: 'Archived', color: 'bg-muted text-muted-foreground' };
    if (room.currentVersionId) return { label: 'Published', color: 'bg-green-500/10 text-green-500' };
    if (room.draftVersionId) return { label: 'Draft Only', color: 'bg-yellow-500/10 text-yellow-500' };
    return { label: 'No Layout', color: 'bg-muted text-muted-foreground' };
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 30) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LayoutDashboard className="h-6 w-6 text-indigo-600" />
          <h1 className="text-2xl font-semibold text-foreground">Room Layouts</h1>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          Create Room
        </button>
      </div>

      {/* Search + Filter */}
      <div className="flex items-center gap-3">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search rooms..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-border rounded-lg text-sm text-foreground focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-surface focus:outline-none"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="rounded border-border text-indigo-600 focus:ring-indigo-500"
          />
          Show archived
        </label>
      </div>

      {/* Table */}
      {isLoading && rooms.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 bg-muted rounded animate-pulse" />
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <LayoutDashboard className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-lg font-medium">No rooms yet</p>
          <p className="text-sm mt-1">Create your first room layout to get started.</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Dimensions</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Capacity</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Last Published</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rooms.map((room) => {
                const status = getRoomStatus(room);
                return (
                  <tr key={room.id} className="hover:bg-accent/30">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => router.push(`/settings/room-layouts/${room.id}/editor`)}
                        className="font-medium text-indigo-600 hover:text-indigo-500 hover:underline"
                      >
                        {room.name}
                      </button>
                      {room.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{room.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {Number(room.widthFt)} × {Number(room.heightFt)} {room.unit}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {room.totalCapacity ?? room.capacity ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(room.publishedAt)}
                    </td>
                    <td className="px-4 py-3 text-right relative">
                      <button
                        onClick={() => setActionMenuId(actionMenuId === room.id ? null : room.id)}
                        className="p-1 rounded hover:bg-accent/50"
                      >
                        <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                      </button>
                      {actionMenuId === room.id && (
                        <div className="absolute right-4 top-12 z-10 bg-surface border border-border rounded-lg shadow-lg py-1 w-48">
                          <button
                            onClick={() => { setActionMenuId(null); router.push(`/settings/room-layouts/${room.id}/editor`); }}
                            className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent/50"
                          >
                            <LayoutDashboard className="h-4 w-4" /> Edit Layout
                          </button>
                          <button
                            onClick={() => { setActionMenuId(null); setEditRoom(room); }}
                            className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent/50"
                          >
                            <Pencil className="h-4 w-4" /> Edit Details
                          </button>
                          <button
                            onClick={() => { setActionMenuId(null); setDuplicateRoom(room); }}
                            className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent/50"
                          >
                            <Copy className="h-4 w-4" /> Duplicate
                          </button>
                          <hr className="my-1 border-border" />
                          {room.isActive ? (
                            <button
                              onClick={() => { setActionMenuId(null); handleArchive(room.id); }}
                              className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-red-500 hover:bg-red-500/10"
                            >
                              <Archive className="h-4 w-4" /> Archive
                            </button>
                          ) : (
                            <button
                              onClick={() => { setActionMenuId(null); handleRestore(room.id); }}
                              className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-green-500 hover:bg-green-500/10"
                            >
                              <RotateCcw className="h-4 w-4" /> Restore
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialogs */}
      {showCreate && (
        <CreateRoomDialog
          onClose={() => setShowCreate(false)}
          onCreated={(roomId) => { setShowCreate(false); if (roomId) router.push(`/settings/room-layouts/${roomId}/editor`); else mutate(); }}
        />
      )}
      {editRoom && (
        <EditRoomDialog
          room={editRoom}
          onClose={() => setEditRoom(null)}
          onUpdated={() => { setEditRoom(null); mutate(); }}
        />
      )}
      {duplicateRoom && (
        <DuplicateRoomDialog
          room={duplicateRoom}
          onClose={() => setDuplicateRoom(null)}
          onDuplicated={(newId) => { setDuplicateRoom(null); router.push(`/settings/room-layouts/${newId}/editor`); }}
        />
      )}
    </div>
  );
}
