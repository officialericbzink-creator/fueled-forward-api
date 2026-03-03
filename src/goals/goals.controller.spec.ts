jest.mock('src/auth/auth.guard', () => ({
  AuthGuard: class AuthGuard {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { GoalsController } from './goals.controller';
import { GoalsService } from './goals.service';

describe('GoalsController', () => {
  let controller: GoalsController;
  let goalsService: {
    getTodaysGoals: jest.Mock;
    createGoal: jest.Mock;
    toggleGoalCompletion: jest.Mock;
    getGoalRecommendations: jest.Mock;
    deleteGoal: jest.Mock;
  };

  beforeEach(async () => {
    goalsService = {
      getTodaysGoals: jest.fn(),
      createGoal: jest.fn(),
      toggleGoalCompletion: jest.fn(),
      getGoalRecommendations: jest.fn(),
      deleteGoal: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GoalsController],
      providers: [{ provide: GoalsService, useValue: goalsService }],
    }).compile();

    controller = module.get<GoalsController>(GoalsController);
  });

  it('getGoals returns data + count', async () => {
    goalsService.getTodaysGoals.mockResolvedValue([{ id: 'g1' }]);

    const res = await controller.getGoals({ user: { id: 'u1' } } as any);

    expect(goalsService.getTodaysGoals).toHaveBeenCalledWith('u1');
    expect(res).toEqual({ data: [{ id: 'g1' }], count: 1 });
  });

  it('toggleGoal calls service and returns message', async () => {
    goalsService.toggleGoalCompletion.mockResolvedValue({ id: 'g1', completed: true });

    const res = await controller.toggleGoal({ user: { id: 'u1' } } as any, 'g1');

    expect(goalsService.toggleGoalCompletion).toHaveBeenCalledWith('u1', 'g1');
    expect(res).toEqual({
      data: { id: 'g1', completed: true },
      message: 'Goal updated successfully',
    });
  });

  it('getGoalRecommendations returns data + count', async () => {
    goalsService.getGoalRecommendations.mockReturnValue([{ goal: 'Walk' }]);

    const res = await controller.getGoalRecommendations({ count: 1 } as any);

    expect(goalsService.getGoalRecommendations).toHaveBeenCalledWith(1);
    expect(res).toEqual({ data: [{ goal: 'Walk' }], count: 1 });
  });
});
