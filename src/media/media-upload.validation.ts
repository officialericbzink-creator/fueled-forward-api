import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { memoryStorage } from 'multer';

const DEFAULT_MAX_AVATAR_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB

export const AVATAR_ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

export function getMaxAvatarUploadBytes(): number {
  const raw = process.env.MAX_AVATAR_UPLOAD_BYTES;
  if (!raw) return DEFAULT_MAX_AVATAR_UPLOAD_BYTES;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_AVATAR_UPLOAD_BYTES;
  return Math.floor(parsed);
}

export function extensionForMimeType(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'image/heic':
      return 'heic';
    case 'image/heif':
      return 'heif';
    default:
      return 'bin';
  }
}

export function createAvatarMulterOptions(): MulterOptions {
  const maxBytes = getMaxAvatarUploadBytes();

  return {
    storage: memoryStorage(),
    limits: { fileSize: maxBytes, files: 1 },
    fileFilter: (req, file, cb) => {
      if (!AVATAR_ALLOWED_MIME_TYPES.has(file.mimetype)) {
        (req as any).fileValidationError = `Unsupported file type. Allowed: ${Array.from(
          AVATAR_ALLOWED_MIME_TYPES,
        ).join(', ')}`;
        return cb(null, false);
      }
      cb(null, true);
    },
  };
}
