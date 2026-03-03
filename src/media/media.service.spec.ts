jest.mock('@aws-sdk/client-s3', () => {
  class S3Client {
    send = jest.fn();
    constructor() {}
  }
  class PutObjectCommand {
    input: any;
    constructor(input: any) {
      this.input = input;
    }
  }
  class DeleteObjectCommand {
    input: any;
    constructor(input: any) {
      this.input = input;
    }
  }
  return { S3Client, PutObjectCommand, DeleteObjectCommand };
});

import { MediaService } from './media.service';

describe('MediaService', () => {
  let service: MediaService;

  beforeEach(async () => {
    process.env.CLOUDFLARE_BUCKET_NAME = 'bucket';
    process.env.CLOUDFLARE_BUCKET_URL = 'https://r2.example.com';
    process.env.ADMIN_S3_ACCESS_KEY_ID = 'key';
    process.env.ADMIN_S3_SECRET_KEY = 'secret';
    process.env.CLOUDFLARE_PUBLIC_DOMAIN_DEV = 'https://dev.example.com';
    delete process.env.CLOUDFLARE_PUBLIC_DOMAIN_LIVE;

    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-03T12:00:00.000Z'));
    jest.spyOn(Math, 'random').mockReturnValue(0.123456);

    service = new MediaService();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('getPublicUrl uses dev domain when live/custom not set', () => {
    expect(service.getPublicUrl('x/y.jpg')).toBe('https://dev.example.com/x/y.jpg');
  });

  it('getPublicUrl uses configured public domain when present', () => {
    process.env.CLOUDFLARE_PUBLIC_DOMAIN_LIVE = 'https://cdn.example.com';
    const s2 = new MediaService();
    expect(s2.getPublicUrl('a.png')).toBe('https://cdn.example.com/a.png');
  });

  it('generateAvatarKey sanitizes extension and includes userId', () => {
    const key = service.generateAvatarKey('user1', 'JpG???');
    expect(key).toMatch(/^user-avatars\/user1\/\d+-[a-z0-9]{6}\.jpg$/);
  });

  it('generateBrandMediaKey sanitizes filename', () => {
    const key = service.generateBrandMediaKey('My Cool/Logo!!.PNG');
    expect(key).toMatch(/^brand-assets\/[A-Za-z0-9-]+-\d+-[a-z0-9]{6}\.png$/);
  });

  it('uploadFile sends PutObjectCommand and returns public url', async () => {
    const url = await service.uploadFile(
      'user-avatars/user1/a.jpg',
      Buffer.from('hi'),
      'image/jpeg',
    );

    const send = (service as any).s3Client.send as jest.Mock;
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].input).toEqual(
      expect.objectContaining({
        Bucket: 'bucket',
        Key: 'user-avatars/user1/a.jpg',
        ContentType: 'image/jpeg',
      }),
    );
    expect(url).toBe('https://dev.example.com/user-avatars/user1/a.jpg');
  });

  it('uploadFile wraps errors with "Upload failed"', async () => {
    const send = (service as any).s3Client.send as jest.Mock;
    send.mockRejectedValueOnce(new Error('nope'));

    await expect(
      service.uploadFile('x.jpg', Buffer.from('x'), 'image/jpeg'),
    ).rejects.toThrow(/Upload failed: nope/);
  });

  it('deleteFile strips public domain and deletes key', async () => {
    await service.deleteFile('https://dev.example.com/brand-assets/x.jpg');

    const send = (service as any).s3Client.send as jest.Mock;
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].input).toEqual(
      expect.objectContaining({
        Bucket: 'bucket',
        Key: 'brand-assets/x.jpg',
      }),
    );
  });

  it('deleteFile wraps errors with "Delete failed"', async () => {
    const send = (service as any).s3Client.send as jest.Mock;
    send.mockRejectedValueOnce(new Error('nope'));

    await expect(service.deleteFile('https://dev.example.com/x.jpg')).rejects.toThrow(
      /Delete failed: nope/,
    );
  });
});
