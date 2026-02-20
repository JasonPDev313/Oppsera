'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, MoreHorizontal, Pencil, Copy, Archive, RotateCcw, LayoutDashboard } from 'lucide-react';
import { useRoomLayouts, createRoomApi, archiveRoomApi, unarchiveRoomApi, duplicateRoomApi } from '@/hooks/use-room-layouts';
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

  const { data: rooms, isLoading, mutate } = useRoomLayouts({
    search: debouncedSearch || undefined,
    isActive: true,
  });

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Initial load + reload on search change
  useEffect(() => {
    mutate();
  }, [mutate, debouncedSearch]);

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
    if (!room.isActive) return { label: 'Archived', color: 'bg-gray-100 text-gray-600' };
    if (room.currentVersionId) return { label: 'Published', color: 'bg-green-100 text-green-700' };
    if (room.draftVersionId) return { label: 'Draft Only', color: 'bg-yellow-100 text-yellow-700' };
    return { label: 'No Layout', color: 'bg-gray-100 text-gray-500' };
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
          <h1 className="text-2xl font-semibold text-gray-900">Room Layouts</h1>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          Create Room
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search rooms..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-surface focus:outline-none"
        />
      </div>

      {/* Table */}
      {isLoading && rooms.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <LayoutDashboard className="mx-auto h-12 w-12 text-gray-300 mb-4" />
          <p className="text-lg font-medium">No rooms yet</p>
          <p className="text-sm mt-1">Create your first room layout to get started.</p>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Dimensions</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Capacity</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Last Published</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rooms.map((room) => {
                const status = getRoomStatus(room);
                return (
                  <tr key={room.id} className="hover:bg-gray-200/30">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => router.push(`/settings/room-layouts/${room.id}/editor`)}
                        className="font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
                      >
                        {room.name}
                      </button>
                      {room.description && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">{room.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {Number(room.widthFt)} × {Number(room.heightFt)} {room.unit}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {room.totalCapacity ?? room.capacity ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {formatDate(room.publishedAt)}
                    </td>
                    <td className="px-4 py-3 text-right relative">
                      <button
                        onClick={() => setActionMenuId(actionMenuId === room.id ? null : room.id)}
                        className="p-1 rounded hover:bg-gray-200/50"
                      >
                        <MoreHorizontal className="h-4 w-4 text-gray-500" />
                      </button>
                      {actionMenuId === room.id && (
                        <div className="absolute right-4 top-12 z-10 bg-surface border border-gray-200 rounded-lg shadow-lg py-1 w-48">
                          <button
                            onClick={() => { setActionMenuId(null); router.push(`/settings/room-layouts/${room.id}/editor`); }}
                            className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-200/50"
                          >
                            <LayoutDashboard className="h-4 w-4" /> Edit Layout
                          </button>
                          <button
                            onClick={() => { setActionMenuId(null); setEditRoom(room); }}
                            className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-200/50"
                          >
                            <Pencil className="h-4 w-4" /> Edit Details
                          </button>
                          <button
                            onClick={() => { setActionMenuId(null); setDuplicateRoom(room); }}
                            className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-200/50"
                          >
                            <Copy className="h-4 w-4" /> Duplicate
                          </button>
                          <hr className="my-1 border-gray-200" />
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
