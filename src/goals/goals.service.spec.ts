import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../database/database.service';
import { GOAL_RECOMMENDATIONS } from './constants';
import { GoalsService } from './goals.service';

describe('GoalsService', () => {
  let service: GoalsService;
  let prisma: {
    dailyGoal: {
      findMany: jest.Mock;
      create: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-03T12:00:00.000Z'));

    prisma = {
      dailyGoal: {
        findMany: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [GoalsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<GoalsService>(GoalsService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('getTodaysGoals queries for incomplete + today completed', async () => {
    prisma.dailyGoal.findMany.mockResolvedValue([{ id: 'g1' }]);

    await service.getTodaysGoals('user1');

    const call = prisma.dailyGoal.findMany.mock.calls[0]?.[0];
    expect(call.where.userId).toBe('user1');
    expect(call.where.OR).toHaveLength(2);
    expect(call.orderBy).toEqual([{ completed: 'asc' }, { createdAt: 'desc' }]);
    expect(call.where.OR[1].completedAt.gte).toBeInstanceOf(Date);
  });

  it('toggleGoalCompletion throws when goal not found', async () => {
    prisma.dailyGoal.findFirst.mockResolvedValue(null);

    await expect(
      service.toggleGoalCompletion('user1', 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('toggleGoalCompletion flips completed and sets completedAt', async () => {
    prisma.dailyGoal.findFirst.mockResolvedValue({
      id: 'g1',
      userId: 'user1',
      completed: false,
    });
    prisma.dailyGoal.update.mockResolvedValue({
      id: 'g1',
      completed: true,
      completedAt: new Date('2026-03-03T12:00:00.000Z'),
    });

    const result = await service.toggleGoalCompletion('user1', 'g1');

    expect(prisma.dailyGoal.update).toHaveBeenCalledWith({
      where: { id: 'g1' },
      data: {
        completed: true,
        completedAt: new Date('2026-03-03T12:00:00.000Z'),
      },
    });
    expect(result.completed).toBe(true);
  });

  it('deleteGoal throws when goal not found', async () => {
    prisma.dailyGoal.findFirst.mockResolvedValue(null);

    await expect(service.deleteGoal('user1', 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('deleteGoal deletes and returns success message', async () => {
    prisma.dailyGoal.findFirst.mockResolvedValue({ id: 'g1', userId: 'user1' });
    prisma.dailyGoal.delete.mockResolvedValue({ id: 'g1' });

    await expect(service.deleteGoal('user1', 'g1')).resolves.toEqual({
      message: 'Goal deleted successfully',
    });
    expect(prisma.dailyGoal.delete).toHaveBeenCalledWith({ where: { id: 'g1' } });
  });

  it('getGoalRecommendations returns requested count from constants', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.42);

    const recs = service.getGoalRecommendations(3);

    expect(recs).toHaveLength(3);
    recs.forEach((r) => expect(GOAL_RECOMMENDATIONS).toContain(r));
  });
});
