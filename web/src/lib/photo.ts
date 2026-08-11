import type { PersonPhoto } from "../../../models/types.js";

export const ACCEPTED_PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
const THUMB_SIZE = 160;
const PRINT_SIZE = 640;
const THUMB_QUALITY = 0.82;
const PRINT_QUALITY = 0.85;

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function isAcceptedPhotoType(type: string): boolean {
  return (ACCEPTED_PHOTO_TYPES as readonly string[]).includes(type);
}

/** The largest centered square crop. If a face box is given, center the square on the face
 * center instead, clamped so it never leaves the image. Pure — no canvas, so it is unit-tested. */
export function computeSquareCrop(
  width: number,
  height: number,
  face?: FaceBox
): { sx: number; sy: number; size: number } {
  const size = Math.min(width, height);
  let sx = (width - size) / 2;
  let sy = (height - size) / 2;
  if (face) {
    const fcx = face.x + face.width / 2;
    const fcy = face.y + face.height / 2;
    sx = Math.min(Math.max(0, fcx - size / 2), width - size);
    sy = Math.min(Math.max(0, fcy - size / 2), height - size);
  }
  return { sx, sy, size };
}

/** Best-effort face box via the experimental FaceDetector (Chromium). Returns undefined when
 * unavailable or on any error, so callers fall back to a center crop. */
async function detectFace(bitmap: ImageBitmap): Promise<FaceBox | undefined> {
  const FD = (
    globalThis as unknown as {
      FaceDetector?: new () => {
        detect(src: ImageBitmap): Promise<Array<{ boundingBox: FaceBox }>>;
      };
    }
  ).FaceDetector;
  if (!FD) return undefined;
  try {
    const faces = await new FD().detect(bitmap);
    return faces[0]?.boundingBox;
  } catch {
    return undefined;
  }
}

async function encodeSquare(
  bitmap: ImageBitmap,
  crop: { sx: number; sy: number; size: number },
  out: number,
  quality: number
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(bitmap, crop.sx, crop.sy, crop.size, crop.size, 0, 0, out, out);
  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/webp", quality)
  );
  if (!blob) throw new Error("Image encoding failed");
  return await blobToDataUri(blob);
}

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read image data"));
    reader.readAsDataURL(blob);
  });
}

/** Validate → decode → square-crop (face-centered if possible) → encode two WebP sizes.
 * The original is never retained. Throws on unsupported type, oversize input, OR a
 * corrupt/undecodable image (createImageBitmap rejects). Callers (the inspector) catch and
 * fall back to the placeholder, so a bad file is never stored and never reaches the renderer
 * (refinement 3). */
export async function processImageFile(file: File): Promise<PersonPhoto> {
  if (!isAcceptedPhotoType(file.type)) {
    throw new Error("Unsupported image type — please use PNG, JPEG, or WebP.");
  }
  if (file.size > MAX_PHOTO_BYTES) {
    throw new Error("Image is too large — please use a file under 20 MB.");
  }
  const bitmap = await createImageBitmap(file);
  try {
    const face = await detectFace(bitmap);
    const crop = computeSquareCrop(bitmap.width, bitmap.height, face);
    const thumb = await encodeSquare(bitmap, crop, THUMB_SIZE, THUMB_QUALITY);
    const print = await encodeSquare(bitmap, crop, PRINT_SIZE, PRINT_QUALITY);
    return { thumb, print };
  } finally {
    bitmap.close();
  }
}
