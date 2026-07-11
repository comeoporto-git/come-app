export type NormalizedImage = {
  dataUrl: string;
  base64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  normalizedFile: File;
};

const MAX_PX = 2048;

// NOTE: do NOT include HEIC in accept attrs — iOS auto-converts to JPEG,
// which means this function will never see a real HEIC file. The check
// below is a safety net for edge-cases only.
export async function normalizeImage(file: File): Promise<NormalizedImage> {
  const isHeic = file.type === "image/heic" || file.type === "image/heif" ||
    file.name.toLowerCase().endsWith(".heic") || file.name.toLowerCase().endsWith(".heif");

  // Step 1: FileReader → data URL  (works on iOS 5+, unlike createImageBitmap)
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target!.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  // Step 2: HTMLImageElement decode (iOS handles HEIC natively here)
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = rawDataUrl;
  });

  // Step 3: Draw to canvas at reduced size
  const scale = Math.min(1, MAX_PX / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  const canvas = document.createElement("canvas");
  canvas.width  = Math.round((img.naturalWidth  || 1) * scale);
  canvas.height = Math.round((img.naturalHeight || 1) * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const mediaType = (!isHeic && file.type === "image/png") ? "image/png" : "image/jpeg";
  const quality   = mediaType === "image/jpeg" ? 0.85 : undefined;

  // Step 4: toBlob for the upload File (more memory-efficient than toDataURL on iOS)
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), mediaType, quality)
  );

  // Step 5: toDataURL for preview + AI — fall back to rawDataUrl if canvas
  // returns empty (iOS low-memory symptom: returns "data:," without throwing)
  const dataUrl = (() => {
    const d = canvas.toDataURL(mediaType, quality);
    return d.length > 50 ? d : rawDataUrl; // rawDataUrl is always valid
  })();

  // Build the normalized File — prefer the canvas blob, fall back to original
  const ext = mediaType === "image/png" ? "png" : "jpg";
  const normalizedFile = blob
    ? new File([blob], `invoice.${ext}`, { type: mediaType })
    : file; // last-resort fallback: upload original

  return { dataUrl, base64: dataUrl.split(",")[1], mediaType, normalizedFile };
}
