// @ts-check
/**
 * Fuzz target for slug generation.
 * Tests that generateSlug always produces valid URL-safe slugs.
 */

function generateSlug(input) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * @param {Buffer} data
 */
module.exports.fuzz = function (data) {
  const input = data.toString('utf-8');
  const slug = generateSlug(input);

  // Invariant: slug must be <= 60 characters
  if (slug.length > 60) {
    throw new Error(`Slug too long (${slug.length}): "${slug}"`);
  }

  // Invariant: slug must only contain [a-z0-9-]
  if (slug.length > 0 && !/^[a-z0-9-]+$/.test(slug)) {
    throw new Error(`Invalid slug characters: "${slug}"`);
  }

  // Invariant: slug must not start or end with a hyphen
  if (slug.startsWith('-') || slug.endsWith('-')) {
    throw new Error(`Slug has leading/trailing hyphen: "${slug}"`);
  }

  // Invariant: slug must not contain consecutive hyphens
  if (slug.includes('--')) {
    throw new Error(`Slug has consecutive hyphens: "${slug}"`);
  }

  // Invariant: idempotent — generateSlug(slug) === slug (if non-empty)
  if (slug.length > 0) {
    const reslug = generateSlug(slug);
    if (reslug !== slug) {
      throw new Error(`Not idempotent: "${slug}" -> "${reslug}"`);
    }
  }
};
