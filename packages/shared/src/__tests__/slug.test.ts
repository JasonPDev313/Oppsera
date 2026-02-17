import { describe, it, expect } from 'vitest';
import { generateSlug } from '../utils/slug';

describe('generateSlug', () => {
  it('converts to lowercase and replaces spaces with hyphens', () => {
    expect(generateSlug('Sunset Golf Club')).toBe('sunset-golf-club');
  });

  it('removes apostrophes', () => {
    expect(generateSlug("Bob's Burgers")).toBe('bobs-burgers');
  });

  it('handles ampersands and special chars', () => {
    expect(generateSlug('Sunset Golf & Grill')).toBe('sunset-golf-grill');
  });

  it('trims leading/trailing hyphens', () => {
    expect(generateSlug(' -Hello World- ')).toBe('hello-world');
  });

  it('truncates to 60 chars', () => {
    const long = 'a'.repeat(100);
    const slug = generateSlug(long);
    expect(slug.length).toBeLessThanOrEqual(60);
  });

  it('collapses multiple hyphens', () => {
    expect(generateSlug('foo---bar')).toBe('foo-bar');
  });

  it('handles empty string', () => {
    expect(generateSlug('')).toBe('');
  });
});
