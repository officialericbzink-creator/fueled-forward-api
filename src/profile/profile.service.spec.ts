import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/database/database.service';
import { ProfileService } from './profile.service';

describe('ProfileService', () => {
  let service: ProfileService;
  let db: any;

  beforeEach(async () => {
    db = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      profile: {
        upsert: jest.fn(),
        delete: jest.fn(),
      },
      conversation: {
        delete: jest.fn(),
      },
      message: {
        deleteMany: jest.fn(),
      },
      checkIn: {
        deleteMany: jest.fn(),
      },
      dailyGoal: {
        deleteMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ProfileService, { provide: PrismaService, useValue: db }],
    }).compile();

    service = module.get<ProfileService>(ProfileService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('getOnboardingStatus throws when user not found', async () => {
    db.user.findUnique.mockResolvedValue(null);

    await expect(service.getOnboardingStatus('user1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('completeOnboardingStep prevents skipping steps', async () => {
    db.user.findUnique.mockResolvedValue({
      onboardingStep: 1,
      completedOnboarding: false,
    });

    await expect(
      service.completeOnboardingStep('user1', 3, {}),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('completeOnboardingStep validates paywall step', async () => {
    db.user.findUnique.mockResolvedValue({
      onboardingStep: 3,
      completedOnboarding: false,
    });

    await expect(
      service.completeOnboardingStep('user1', 4, { paywallCompleted: false }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('completeOnboardingStep advances step and persists onboardingStep', async () => {
    db.user.findUnique.mockResolvedValue({
      onboardingStep: 0,
      completedOnboarding: false,
    });
    db.user.update.mockResolvedValue({ id: 'user1' });

    const result = await service.completeOnboardingStep('user1', 0, {
      name: 'Jane',
    });

    // Step handler updates name
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 'user1' },
      data: { name: 'Jane' },
    });

    // Then onboardingStep advances to 1
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 'user1' },
      data: { onboardingStep: 1 },
    });

    expect(result).toEqual({ success: true, currentStep: 1 });
  });

  it('updateProfile updates user fields and upserts profile', async () => {
    db.user.update.mockResolvedValue({ id: 'user1' });
    db.profile.upsert.mockResolvedValue({ userId: 'user1' });

    await expect(
      service.updateProfile('user1', {
        name: 'New Name',
        profile: { bio: 'hi', struggles: ['a'] },
      } as any),
    ).resolves.toEqual({ success: true });

    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 'user1' },
      data: { name: 'New Name' },
    });
    expect(db.profile.upsert).toHaveBeenCalledWith({
      where: { userId: 'user1' },
      create: { userId: 'user1', bio: 'hi', struggles: ['a'] },
      update: { bio: 'hi', struggles: ['a'] },
    });
  });

  it('deleteProfile deletes related records in order', async () => {
    db.message.deleteMany.mockResolvedValue({ count: 1 });
    db.conversation.delete.mockResolvedValue({ id: 'c1' });
    db.checkIn.deleteMany.mockResolvedValue({ count: 1 });
    db.dailyGoal.deleteMany.mockResolvedValue({ count: 1 });
    db.profile.delete.mockResolvedValue({ userId: 'user1' });
    db.user.delete.mockResolvedValue({ id: 'user1' });

    await expect(service.deleteProfile('user1')).resolves.toEqual({ success: true });

    expect(db.message.deleteMany).toHaveBeenCalled();
    expect(db.user.delete).toHaveBeenCalledWith({ where: { id: 'user1' } });
  });
});
