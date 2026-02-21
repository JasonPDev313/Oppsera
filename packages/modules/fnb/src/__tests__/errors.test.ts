import { describe, it, expect } from 'vitest';
import {
  TableNotFoundError,
  TableStatusConflictError,
  TableVersionConflictError,
  TableNotCombinableError,
  TableAlreadyCombinedError,
  CombineGroupNotFoundError,
  RoomNotFoundError,
  NoPublishedVersionError,
  DuplicateTableNumberError,
} from '../errors';

describe('F&B Errors', () => {
  it('TableNotFoundError has correct status and code', () => {
    const err = new TableNotFoundError('table-1');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('TABLE_NOT_FOUND');
    expect(err.message).toContain('table-1');
  });

  it('TableStatusConflictError has correct status and code', () => {
    const err = new TableStatusConflictError('table-1', 'seated', 'mark available');
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('TABLE_STATUS_CONFLICT');
    expect(err.message).toContain('seated');
  });

  it('TableVersionConflictError has correct status and code', () => {
    const err = new TableVersionConflictError('table-1');
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('TABLE_VERSION_CONFLICT');
  });

  it('TableNotCombinableError has correct status and code', () => {
    const err = new TableNotCombinableError('table-1');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('TABLE_NOT_COMBINABLE');
  });

  it('TableAlreadyCombinedError has correct status and code', () => {
    const err = new TableAlreadyCombinedError('table-1');
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('TABLE_ALREADY_COMBINED');
  });

  it('CombineGroupNotFoundError has correct status and code', () => {
    const err = new CombineGroupNotFoundError('group-1');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('COMBINE_GROUP_NOT_FOUND');
  });

  it('RoomNotFoundError has correct status and code', () => {
    const err = new RoomNotFoundError('room-1');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('ROOM_NOT_FOUND');
  });

  it('NoPublishedVersionError has correct status and code', () => {
    const err = new NoPublishedVersionError('room-1');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('NO_PUBLISHED_VERSION');
  });

  it('DuplicateTableNumberError has correct status and code', () => {
    const err = new DuplicateTableNumberError(5, 'room-1');
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('DUPLICATE_TABLE_NUMBER');
    expect(err.message).toContain('5');
    expect(err.message).toContain('room-1');
  });
});
