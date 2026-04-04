import 'server-only'
import { supabase } from '@/server/db/supabase/client'

/**
 * Sign a single storage object. Returns an empty string on failure so callers
 * can fall back gracefully (the stored URL is stale for private buckets, but
 * an empty string is at least honest about the failure).
 */
export async function signUrl(bucket: string, key: string, expiresIn = 3600): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(key, expiresIn)
  if (error || !data?.signedUrl) {
    console.error(`[signed-url] failed to sign ${bucket}/${key}:`, error)
    return ''
  }
  return data.signedUrl
}

/**
 * Batch-sign storage objects in a single API call.
 * Returns a Map<storageKey, signedUrl>. Keys that fail to sign are omitted.
 */
export async function signUrls(
  bucket: string,
  keys: string[],
  expiresIn = 3600,
): Promise<Map<string, string>> {
  if (keys.length === 0) return new Map()
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(keys, expiresIn)
  if (error || !data) {
    console.error(`[signed-url] batch sign failed for ${bucket}:`, error)
    return new Map()
  }
  const map = new Map<string, string>()
  for (const item of data) {
    if (item.signedUrl && item.path) map.set(item.path, item.signedUrl)
  }
  return map
}
