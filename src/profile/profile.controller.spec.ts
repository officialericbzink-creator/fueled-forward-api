jest.mock('src/auth/auth.guard', () => ({
  AuthGuard: class AuthGuard {},
}));

import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { MediaService } from 'src/media/media.service';

describe('ProfileController', () => {
  let controller: ProfileController;
  let profileService: { updateProfile: jest.Mock; getUserProfile: jest.Mock };
  let mediaService: { generateAvatarKey: jest.Mock; uploadFile: jest.Mock };

  beforeEach(async () => {
    profileService = {
      updateProfile: jest.fn(),
      getUserProfile: jest.fn(),
    };
    mediaService = {
      generateAvatarKey: jest.fn(),
      uploadFile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfileController],
      providers: [
        { provide: ProfileService, useValue: profileService },
        { provide: MediaService, useValue: mediaService },
      ],
    }).compile();

    controller = module.get<ProfileController>(ProfileController);
  });

  it('updateAvatar throws when file validation failed', async () => {
    await expect(
      controller.updateAvatar(
        undefined as any,
        { user: { id: 'u1' } } as any,
        { fileValidationError: 'bad file' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updateAvatar uploads and updates profile image', async () => {
    mediaService.generateAvatarKey.mockReturnValue('user-avatars/u1/x.jpg');
    mediaService.uploadFile.mockResolvedValue('https://cdn/x.jpg');
    profileService.updateProfile.mockResolvedValue({ success: true });

    const res = await controller.updateAvatar(
      {
        buffer: Buffer.from('x'),
        mimetype: 'image/jpeg',
        originalname: 'a.jpg',
      } as any,
      { user: { id: 'u1' } } as any,
      {},
    );

    expect(mediaService.generateAvatarKey).toHaveBeenCalledWith('u1', expect.any(String));
    expect(mediaService.uploadFile).toHaveBeenCalledWith(
      'user-avatars/u1/x.jpg',
      expect.any(Buffer),
      'image/jpeg',
    );
    expect(profileService.updateProfile).toHaveBeenCalledWith('u1', {
      image: 'https://cdn/x.jpg',
    });

    expect(res).toEqual({
      success: true,
      data: {
        key: 'user-avatars/u1/x.jpg',
        url: 'https://cdn/x.jpg',
        type: 'AVATAR',
        userId: 'u1',
      },
    });
  });
});
