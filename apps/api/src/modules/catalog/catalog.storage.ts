import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface MediaObjectMetadata {
  readonly sizeBytes: number;
  readonly contentType: string | undefined;
}

export interface MediaUploadAuthorization {
  readonly method: "PUT";
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly expiresAt: Date;
}

export interface MediaStorage {
  readonly bucket: string;
  createUploadAuthorization(objectKey: string, mimeType: string): Promise<MediaUploadAuthorization>;
  headObject(objectKey: string): Promise<MediaObjectMetadata | null>;
  readObjectPrefix(objectKey: string, byteCount: number): Promise<Uint8Array>;
  deleteObject(objectKey: string): Promise<void>;
  publicUrl(objectKey: string): string;
}

export interface R2MediaStorageOptions {
  readonly accountId: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly bucket: string;
  readonly publicBaseUrl: string;
  readonly uploadTtlSeconds?: number;
}

function bytesEqual(bytes: Uint8Array, expected: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + expected.length) return false;
  return expected.every((value, index) => bytes[offset + index] === value);
}

function matchesDeclaredImageType(bytes: Uint8Array, contentType: string | undefined): boolean {
  if (contentType === "image/jpeg") return bytesEqual(bytes, [0xff, 0xd8, 0xff]);
  if (contentType === "image/png") {
    return bytesEqual(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }
  if (contentType === "image/webp") {
    return bytesEqual(bytes, [0x52, 0x49, 0x46, 0x46]) && bytesEqual(bytes, [0x57, 0x45, 0x42, 0x50], 8);
  }
  return false;
}

export class R2MediaStorage implements MediaStorage {
  readonly bucket: string;
  private readonly client: S3Client;
  private readonly publicBaseUrl: string;
  private readonly uploadTtlSeconds: number;

  constructor(options: R2MediaStorageOptions) {
    this.bucket = options.bucket;
    this.publicBaseUrl = options.publicBaseUrl.replace(/\/+$/, "");
    this.uploadTtlSeconds = options.uploadTtlSeconds ?? 10 * 60;
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${options.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
  }

  async createUploadAuthorization(
    objectKey: string,
    mimeType: string,
  ): Promise<MediaUploadAuthorization> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      ContentType: mimeType,
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: this.uploadTtlSeconds,
      signableHeaders: new Set(["content-type"]),
    });
    return {
      method: "PUT",
      url,
      headers: { "content-type": mimeType },
      expiresAt: new Date(Date.now() + this.uploadTtlSeconds * 1000),
    };
  }

  async headObject(objectKey: string): Promise<MediaObjectMetadata | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      );
      const prefix = await this.readObjectPrefix(objectKey, 16);
      const declaredType = result.ContentType;
      return {
        sizeBytes: Number(result.ContentLength ?? 0),
        // A browser-controlled Content-Type header is not sufficient evidence that
        // the stored bytes are an allowed image. Returning an octet-stream marker
        // causes the catalog completion boundary to reject mismatched signatures.
        contentType: matchesDeclaredImageType(prefix, declaredType)
          ? declaredType
          : "application/octet-stream",
      };
    } catch (error) {
      const status =
        error && typeof error === "object" && "$metadata" in error
          ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
          : undefined;
      if (status === 404) return null;
      throw error;
    }
  }

  async readObjectPrefix(objectKey: string, byteCount: number): Promise<Uint8Array> {
    if (!Number.isInteger(byteCount) || byteCount < 1 || byteCount > 4096) {
      throw new Error("Media prefix byte count must be between 1 and 4096.");
    }
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Range: `bytes=0-${byteCount - 1}`,
      }),
    );
    if (!result.Body) return new Uint8Array();
    return result.Body.transformToByteArray();
  }

  async deleteObject(objectKey: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }));
  }

  publicUrl(objectKey: string): string {
    const encodedKey = objectKey.split("/").map(encodeURIComponent).join("/");
    return `${this.publicBaseUrl}/${encodedKey}`;
  }
}
