import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { fromNodeHeaders } from 'better-auth/node';
import type { IncomingHttpHeaders } from 'http';
import { auth } from 'src/lib/auth';
import { ALLOW_ANONYMOUS_KEY } from './allow-anonymous.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const allowAnonymous = this.reflector.getAllAndOverride<boolean>(
      ALLOW_ANONYMOUS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (allowAnonymous) return true;

    const req = context.switchToHttp().getRequest<{ headers: unknown }>();
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers as IncomingHttpHeaders),
    });

    if (!session) {
      throw new UnauthorizedException();
    }

    (req as any).session = session;
    return true;
  }
}
