/**
 * Generate a URL-safe slug from a string.
 * "Sunset Golf & Grill" → "sunset-golf-grill"
 * "Bob's Burgers" → "bobs-burgers"
 */
export function generateSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
