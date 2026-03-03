jest.mock('src/auth/auth.guard', () => ({
  AuthGuard: class AuthGuard {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { CheckInController } from './check-in.controller';
import { CheckInService } from './check-in.service';

describe('CheckInController', () => {
  let controller: CheckInController;
  let service: {
    getCheckInHistory: jest.Mock;
    getTodaysCheckIn: jest.Mock;
    hasCheckedInToday: jest.Mock;
    getCheckInById: jest.Mock;
    createCheckIn: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      getCheckInHistory: jest.fn(),
      getTodaysCheckIn: jest.fn(),
      hasCheckedInToday: jest.fn(),
      getCheckInById: jest.fn(),
      createCheckIn: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CheckInController],
      providers: [{ provide: CheckInService, useValue: service }],
    }).compile();

    controller = module.get<CheckInController>(CheckInController);
  });

  it('getCheckInHistory returns data + count', async () => {
    service.getCheckInHistory.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);

    const res = await controller.getCheckInHistory(
      { user: { id: 'u1' } } as any,
      { limit: 30 } as any,
      'UTC',
    );

    expect(service.getCheckInHistory).toHaveBeenCalledWith('u1', 'UTC', 30);
    expect(res).toEqual({ data: [{ id: 'c1' }, { id: 'c2' }], count: 2 });
  });

  it('createCheckIn returns message + data', async () => {
    service.createCheckIn.mockResolvedValue({ id: 'c1' });

    const res = await controller.createCheckIn(
      { date: '2026-03-03T00:00:00.000Z', steps: [] } as any,
      { user: { id: 'u1' } } as any,
      'UTC',
    );

    expect(service.createCheckIn).toHaveBeenCalledWith(
      'u1',
      expect.any(Object),
      'UTC',
    );
    expect(res).toEqual({
      message: 'Check-in created successfully',
      data: { id: 'c1' },
    });
  });
});
