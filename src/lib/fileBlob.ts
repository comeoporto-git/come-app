/**
 * Server Actions reject string arguments longer than ~1M characters
 * ("Maximum array nesting exceeded"), so files must be sent to them as a
 * Blob, never as a base64 string. Blobs travel as multipart parts and are
 * not subject to that limit.
 */
export function base64ToBlob(base64: string, mediaType: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mediaType });
}
