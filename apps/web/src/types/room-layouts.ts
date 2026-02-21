'use client';

export interface RoomRow {
  id: string;
  tenantId: string;
  locationId: string;
  name: string;
  slug: string;
  description: string | null;
  widthFt: string;
  heightFt: string;
  unit: string;
  capacity: number | null;
  sortOrder: number;
  isActive: boolean;
  archivedAt: string | null;
  currentVersionId: string | null;
  draftVersionId: string | null;
  createdAt: string;
  updatedAt: string;
  objectCount: number | null;
  totalCapacity: number | null;
  publishedAt: string | null;
}

export interface RoomDetail {
  id: string;
  tenantId: string;
  locationId: string;
  name: string;
  slug: string;
  description: string | null;
  widthFt: string;
  heightFt: string;
  gridSizeFt: string;
  scalePxPerFt: number;
  unit: string;
  defaultMode: string | null;
  capacity: number | null;
  sortOrder: number;
  isActive: boolean;
  archivedAt: string | null;
  archivedBy: string | null;
  currentVersionId: string | null;
  draftVersionId: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  hasDraft: boolean;
  currentVersion: {
    id: string;
    versionNumber: number;
    objectCount: number;
    totalCapacity: number;
    publishedAt: string | null;
    publishedBy: string | null;
  } | null;
  recentVersions: VersionRow[];
}

export interface VersionRow {
  id: string;
  versionNumber: number;
  status: string;
  objectCount: number;
  totalCapacity: number;
  publishedAt: string | null;
  publishedBy: string | null;
  publishNote: string | null;
  createdAt: string;
}

export interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  widthFt: string;
  heightFt: string;
  objectCount: number;
  totalCapacity: number;
  isSystemTemplate: boolean;
  thumbnailUrl: string | null;
  createdAt: string;
}

export interface RoomEditorData {
  id: string;
  name: string;
  slug: string;
  locationId: string;
  widthFt: number;
  heightFt: number;
  gridSizeFt: number;
  scalePxPerFt: number;
  unit: string;
  defaultMode: string | null;
  currentVersionId: string | null;
  draftVersionId: string | null;
  versionNumber: number;
  snapshotJson: Record<string, unknown>;
}
