// src/media/cloudflare.service.ts
import { Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly publicDomain: string;

  constructor() {
    this.bucketName = process.env.CLOUDFLARE_BUCKET_NAME!;
    this.publicDomain =
      process.env.CLOUDFLARE_PUBLIC_DOMAIN_LIVE ??
      (process.env.CLOUDFLARE_PUBLIC_DOMAIN_DEV || '');

    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: process.env.CLOUDFLARE_BUCKET_URL || '',
      credentials: {
        accessKeyId: process.env.ADMIN_S3_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.ADMIN_S3_SECRET_KEY || '',
      },
    });
  }

  /**
   * Upload a file and return public URL
   */
  async uploadFile(
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000', // 1 year cache for images
      });

      await this.s3Client.send(command);
      this.logger.log(`File uploaded: ${key}`);

      return this.getPublicUrl(key);
    } catch (error) {
      this.logger.error(`Failed to upload file ${key}:`, error);
      throw new Error(`Upload failed: ${error.message}`);
    }
  }

  /**
   * Delete a file
   */
  async deleteFile(url: string): Promise<void> {
    const finalKey = url.replace(
      `${process.env.CLOUDFLARE_PUBLIC_DOMAIN_LIVE ?? process.env.CLOUDFLARE_PUBLIC_DOMAIN_DEV}/`,
      '',
    );
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: finalKey,
      });

      await this.s3Client.send(command);
      this.logger.log(`File deleted: ${finalKey}`);
    } catch (error) {
      this.logger.error(`Failed to delete file ${finalKey}:`, error);
      throw new Error(`Delete failed: ${error.message}`);
    }
  }

  /**
   * Generate public URL - works immediately after upload
   */
  getPublicUrl(key: string): string {
    // Use custom domain if configured (recommended for production)
    if (this.publicDomain) {
      return `${this.publicDomain}/${key}`;
    }

    // Use R2.dev subdomain (auto-generated public URL)
    return `${process.env.CLOUDFLARE_PUBLIC_DOMAIN_DEV}/${key}`;
  }

  /**
   * Generate avatar key: /avatars/:userId/avatar.jpg
   */
  generateAvatarKey(userId: string, originalName: string): string {
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 8);
    const extension = originalName.split('.').pop()?.toLowerCase() || 'jpg';
    return `user-avatars/${userId}/${timestamp}-${randomString}.${extension}`;
  }

  /**
   * Generate platform media key: /uploads/upload.jpg
   */
  generateBrandMediaKey(originalName: string): string {
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 8);
    const extension = originalName.split('.').pop()?.toLowerCase() || 'jpg';
    const baseName = originalName.replace(/\.[^/.]+$/, '');
    return `brand-assets/${baseName}-${timestamp}-${randomString}.${extension}`;
  }
}
