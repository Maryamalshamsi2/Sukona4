/**
 * Client-side image compression for receipt uploads.
 *
 * Phone-camera photos of receipts are typically 3–8 MB at full
 * resolution, but a receipt only needs to be legible at on-screen
 * scale — ~1200 px wide JPEG @ 0.85 quality compresses the same
 * receipt to ~200–500 KB with no perceptible quality loss for the
 * use case (reading printed text on a phone screen).
 *
 * This runs entirely in the browser. The compressed File replaces
 * the original before the upload server-action is called — the
 * server never sees the raw 5 MB blob, so the upload finishes
 * 10×–20× faster on cellular networks.
 *
 * The function is defensive: if compression fails for any reason
 * (HEIC, GIF, decoder error, OOM on a low-end phone), it returns
 * the original file unchanged. We never *block* the upload on a
 * compression failure — slower is better than broken.
 */

type CompressOptions = {
  /** Longest edge in pixels. Default 1200. */
  maxWidth?: number;
  /** JPEG quality 0–1. Default 0.85. */
  quality?: number;
  /** Skip compression if the file is already smaller than this many bytes. */
  skipBelowBytes?: number;
};

export async function compressImage(
  file: File,
  opts: CompressOptions = {},
): Promise<File> {
  const maxWidth = opts.maxWidth ?? 1200;
  const quality = opts.quality ?? 0.85;
  const skipBelowBytes = opts.skipBelowBytes ?? 600 * 1024; // 600 KB

  // Already small — uploading as-is is faster than recompressing.
  if (file.size < skipBelowBytes) return file;

  // We only compress raster formats the browser can decode in canvas.
  // HEIC/HEIF from iPhones is the obvious gap; Safari can decode it
  // but not reliably across versions, so we skip and let the server
  // upload the original.
  if (!/^image\/(jpeg|jpg|png|webp)$/i.test(file.type)) return file;

  try {
    // createImageBitmap is faster + more memory-efficient than
    // <img> + URL.createObjectURL on modern phones. Safari has
    // supported it since 16.4.
    const bitmap = await createImageBitmap(file);

    // If the source is already at or below maxWidth, recompressing
    // at lower quality might still help (the original could be a
    // high-quality JPEG or PNG), so we proceed — but skip if both
    // small dimensions AND small file size.
    if (bitmap.width <= maxWidth && file.size < skipBelowBytes * 2) {
      bitmap.close();
      return file;
    }

    // Compute target dimensions preserving aspect ratio. We only
    // downscale; never upscale a smaller image.
    const targetW = Math.min(bitmap.width, maxWidth);
    const targetH = Math.round((bitmap.height * targetW) / bitmap.width);

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }

    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    bitmap.close();

    const blob: Blob | null = await new Promise((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", quality);
    });
    if (!blob) return file;

    // If our "compressed" version somehow ended up bigger (rare —
    // happens with already-optimized JPEGs), keep the original.
    if (blob.size >= file.size) return file;

    // Rewrite the name to .jpg since the content is now JPEG.
    const newName = file.name.replace(/\.(png|webp|heic|heif|jpeg)$/i, ".jpg");

    return new File([blob], newName.endsWith(".jpg") ? newName : `${newName}.jpg`, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } catch {
    // Any decode/encode failure: fall back to the original.
    return file;
  }
}
