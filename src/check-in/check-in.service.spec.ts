import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/database/database.service';
import { CheckInService } from './check-in.service';

describe('CheckInService', () => {
  let service: CheckInService;
  let db: {
    checkIn: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
    };
  };

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-03T12:00:00.000Z'));

    db = {
      checkIn: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckInService,
        { provide: PrismaService, useValue: db },
      ],
    }).compile();

    service = module.get<CheckInService>(CheckInService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('getCheckInById throws when not found', async () => {
    db.checkIn.findUnique.mockResolvedValue(null);

    await expect(service.getCheckInById('missing', 'user1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('getCheckInById throws when userId mismatches', async () => {
    db.checkIn.findUnique.mockResolvedValue({
      id: 'c1',
      userId: 'other',
      steps: [],
    });

    await expect(service.getCheckInById('c1', 'user1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('hasCheckedInToday returns true/false based on record existence', async () => {
    db.checkIn.findFirst.mockResolvedValueOnce({ id: 'c1' });
    await expect(service.hasCheckedInToday('user1', 'UTC')).resolves.toBe(true);

    db.checkIn.findFirst.mockResolvedValueOnce(null);
    await expect(service.hasCheckedInToday('user1', 'UTC')).resolves.toBe(false);
  });

  it('createCheckIn validates step count', async () => {
    await expect(
      service.createCheckIn(
        'user1',
        {
          date: '2026-03-03T05:00:00.000Z',
          steps: [{ step: 1, mood: 3 }],
        } as any,
        'UTC',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('createCheckIn validates steps are exactly 1..5 once', async () => {
    await expect(
      service.createCheckIn(
        'user1',
        {
          date: '2026-03-03T05:00:00.000Z',
          steps: [
            { step: 1, mood: 3 },
            { step: 2, mood: 3 },
            { step: 3, mood: 3 },
            { step: 4, mood: 3 },
            { step: 4, mood: 3 },
          ],
        } as any,
        'UTC',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('createCheckIn throws when user already checked in today', async () => {
    jest.spyOn(service, 'hasCheckedInToday').mockResolvedValue(true);

    await expect(
      service.createCheckIn(
        'user1',
        {
          date: '2026-03-03T05:00:00.000Z',
          steps: [
            { step: 1, mood: 1 },
            { step: 2, mood: 2 },
            { step: 3, mood: 3 },
            { step: 4, mood: 4 },
            { step: 5, mood: 5 },
          ],
        } as any,
        'UTC',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('createCheckIn validates submitted date is today in timezone', async () => {
    jest.spyOn(service, 'hasCheckedInToday').mockResolvedValue(false);

    await expect(
      service.createCheckIn(
        'user1',
        {
          date: '2026-03-02T23:00:00.000Z',
          steps: [
            { step: 1, mood: 1 },
            { step: 2, mood: 2 },
            { step: 3, mood: 3 },
            { step: 4, mood: 4 },
            { step: 5, mood: 5 },
          ],
        } as any,
        'UTC',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('createCheckIn stores overallMood and creates record', async () => {
    jest.spyOn(service, 'hasCheckedInToday').mockResolvedValue(false);

    db.checkIn.create.mockResolvedValue({
      id: 'c1',
      userId: 'user1',
      date: new Date('2026-03-03T00:00:00.000Z'),
      overallMood: 3,
      completed: true,
      steps: [
        { step: 1, mood: 1 },
        { step: 2, mood: 2 },
        { step: 3, mood: 3 },
        { step: 4, mood: 4 },
        { step: 5, mood: 5 },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.createCheckIn(
      'user1',
      {
        date: '2026-03-03T05:00:00.000Z',
        steps: [
          { step: 1, mood: 1, notes: 'a' },
          { step: 2, mood: 2, notes: 'b' },
          { step: 3, mood: 3, notes: 'c' },
          { step: 4, mood: 4, notes: 'd' },
          { step: 5, mood: 5, notes: 'e' },
        ],
      } as any,
      'UTC',
    );

    expect(db.checkIn.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user1',
          overallMood: 3,
          completed: true,
        }),
      }),
    );
    expect(result.id).toBe('c1');
    expect(result.overallMood).toBe(3);
  });

  it('createCheckIn wraps unexpected db errors', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(service, 'hasCheckedInToday').mockResolvedValue(false);
    db.checkIn.create.mockRejectedValue(new Error('boom'));

    await expect(
      service.createCheckIn(
        'user1',
        {
          date: '2026-03-03T05:00:00.000Z',
          steps: [
            { step: 1, mood: 1 },
            { step: 2, mood: 2 },
            { step: 3, mood: 3 },
            { step: 4, mood: 4 },
            { step: 5, mood: 5 },
          ],
        } as any,
        'UTC',
      ),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
