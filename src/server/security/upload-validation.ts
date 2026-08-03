import "server-only";

export const ALLOWED_IMAGE_TYPES = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);

export function validateUpload(file: File, maxBytes: number): { extension: string } {
  const extension = ALLOWED_IMAGE_TYPES.get(file.type);
  if (!extension) throw new Error("Unsupported image format. Use JPG, PNG or WEBP.");
  if (file.size <= 0) throw new Error("The uploaded image is empty.");
  if (file.size > maxBytes) throw new Error(`The image exceeds the ${(maxBytes / 1024 / 1024).toFixed(0)} MB limit.`);
  return { extension };
}

export function assertImageSignature(bytes: Buffer, mime: string): void {
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp = bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  if ((mime === "image/jpeg" && !jpeg) || (mime === "image/png" && !png) || (mime === "image/webp" && !webp)) {
    throw new Error("The file content does not match its image format.");
  }
}
