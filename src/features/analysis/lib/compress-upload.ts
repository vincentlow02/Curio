const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_DIMENSION = 1600;

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function compressUpload(file: File): Promise<File> {
  if (file.size <= MAX_UPLOAD_BYTES) return file;
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare the image for upload.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const type of ["image/webp", "image/jpeg"] as const) {
      for (const quality of [0.85, 0.75, 0.65, 0.55, 0.45]) {
        const blob = await toBlob(canvas, type, quality);
        if (blob && blob.size <= MAX_UPLOAD_BYTES) {
          const extension = type === "image/webp" ? "webp" : "jpg";
          return new File([blob], file.name.replace(/\.[^.]+$/, "") + `.${extension}`, { type, lastModified: file.lastModified });
        }
      }
    }
    throw new Error("The image could not be reduced below 4 MB. Try a smaller photo.");
  } finally {
    bitmap.close();
  }
}
