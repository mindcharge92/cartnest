import type { VendorMediaDto } from "@repo/contracts";
import { catalogApi } from "../../lib/api";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export interface UploadProductImageInput {
  readonly productId: string;
  readonly file: File;
  readonly altText?: string;
  readonly displayOrder?: number;
}

async function imageDimensions(file: File): Promise<{ width?: number; height?: number }> {
  if (typeof createImageBitmap !== "function") return {};
  try {
    const bitmap = await createImageBitmap(file);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  } catch {
    return {};
  }
}

export async function uploadProductImage(input: UploadProductImageInput): Promise<VendorMediaDto> {
  if (!ALLOWED_IMAGE_TYPES.has(input.file.type)) {
    throw new Error("Choose a JPEG, PNG, or WebP image.");
  }
  if (input.file.size < 1 || input.file.size > MAX_IMAGE_BYTES) {
    throw new Error("Product images must be between 1 byte and 10 MB.");
  }

  const intent = await catalogApi.createMediaUploadIntent({
    ownerType: "PRODUCT",
    ownerId: input.productId,
    mimeType: input.file.type as "image/jpeg" | "image/png" | "image/webp",
    sizeBytes: input.file.size,
    originalFilename: input.file.name,
    ...(input.altText !== undefined ? { altText: input.altText } : {}),
    ...(input.displayOrder !== undefined ? { displayOrder: input.displayOrder } : {}),
  });

  const uploadResponse = await fetch(intent.upload.url, {
    method: intent.upload.method,
    headers: intent.upload.headers,
    body: input.file,
    credentials: "omit",
    mode: "cors",
  });
  if (!uploadResponse.ok) {
    throw new Error(`Image upload failed before completion (${uploadResponse.status}).`);
  }

  return catalogApi.completeMediaUpload(intent.media.id, await imageDimensions(input.file));
}
