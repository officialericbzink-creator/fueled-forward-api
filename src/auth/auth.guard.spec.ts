jest.mock('better-auth/node', () => ({
  fromNodeHeaders: (headers: any) => headers,
}));

const getSession = jest.fn();
jest.mock('src/lib/auth', () => ({
  auth: { api: { getSession } },
}));

import { UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from './auth.guard';

describe('AuthGuard', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  function makeContext(req: any) {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    } as any;
  }

  it('allows anonymous routes', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(true),
    } as any;
    const guard = new AuthGuard(reflector);

    const req: any = { headers: {} };
    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true);
    expect(getSession).not.toHaveBeenCalled();
  });

  it('rejects when session is missing', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as any;
    const guard = new AuthGuard(reflector);

    getSession.mockResolvedValue(null);

    const req: any = { headers: {} };
    await expect(guard.canActivate(makeContext(req))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('attaches session to request when present', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as any;
    const guard = new AuthGuard(reflector);

    getSession.mockResolvedValue({ user: { id: 'u1' } });

    const req: any = { headers: {} };
    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true);
    expect(req.session).toEqual({ user: { id: 'u1' } });
  });
});

