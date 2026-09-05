import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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
      return {
        sizeBytes: Number(result.ContentLength ?? 0),
        contentType: result.ContentType,
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

  publicUrl(objectKey: string): string {
    const encodedKey = objectKey.split("/").map(encodeURIComponent).join("/");
    return `${this.publicBaseUrl}/${encodedKey}`;
  }
}
