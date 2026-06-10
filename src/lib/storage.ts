import { ref, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';

/**
 * Resolve a driver/store document to a viewable URL (RNF03).
 *
 * Documents must NOT be served from open public URLs. When a value is a Storage
 * path (or gs:// URI) we mint a tokenized download URL via the Firebase SDK —
 * this is the signed, time-bound access the operator uses to view the file.
 * Already-resolved https/data URLs are returned as-is (backwards compatible
 * with the entregador app, which may inline small images as data: URIs).
 */
export async function resolveDocUrl(value?: string | null): Promise<string | null> {
  if (!value) return null;
  if (value.startsWith('http') || value.startsWith('data:')) return value;
  try {
    const path = value.startsWith('gs://') ? value : value.replace(/^\/+/, '');
    return await getDownloadURL(ref(storage, path));
  } catch (e) {
    console.warn('resolveDocUrl failed', e);
    return null;
  }
}

export function isImageUrl(url?: string | null): boolean {
  if (!url) return false;
  if (url.startsWith('data:image')) return true;
  return /\.(png|jpe?g|webp|gif|bmp|heic)(\?|$)/i.test(url);
}
