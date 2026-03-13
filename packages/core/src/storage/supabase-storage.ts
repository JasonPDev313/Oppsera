import { createSupabaseAdmin } from '../auth/supabase-client';

const BUCKET = 'documents';

/**
 * Upload a file to Supabase Storage.
 * Returns the storage key (path within the bucket).
 */
export async function uploadFile(
  tenantId: string,
  fileName: string,
  fileBuffer: Buffer,
  contentType: string,
): Promise<string> {
  const supabase = createSupabaseAdmin();
  const storageKey = `${tenantId}/${Date.now()}-${fileName}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storageKey, fileBuffer, {
      contentType,
      upsert: false,
    });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  return storageKey;
}

/**
 * Generate a signed download URL (valid for 1 hour).
 */
export async function getSignedUrl(storageKey: string): Promise<string> {
  const supabase = createSupabaseAdmin();

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storageKey, 3600);

  if (error || !data?.signedUrl) {
    throw new Error(`Failed to create signed URL: ${error?.message ?? 'Unknown error'}`);
  }

  return data.signedUrl;
}

/**
 * Delete a file from Supabase Storage.
 */
export async function deleteFile(storageKey: string): Promise<void> {
  const supabase = createSupabaseAdmin();

  const { error } = await supabase.storage
    .from(BUCKET)
    .remove([storageKey]);

  if (error) {
    throw new Error(`Storage delete failed: ${error.message}`);
  }
}
