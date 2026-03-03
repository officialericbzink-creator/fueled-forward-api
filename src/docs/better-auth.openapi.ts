import type { OpenAPIObject } from '@nestjs/swagger';

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

function addPath(
  document: OpenAPIObject,
  path: string,
  method: HttpMethod,
  operation: Record<string, unknown>,
) {
  document.paths ??= {};
  const existing = (document.paths[path] ?? {}) as Record<string, unknown>;
  (existing as any)[method] = operation;
  (document.paths as any)[path] = existing;
}

export function addBetterAuthPaths(
  document: OpenAPIObject,
  opts?: { basePath?: string },
) {
  const base = opts?.basePath ?? '/api/auth';

  document.tags ??= [];
  if (!document.tags.some((t) => t.name === 'auth')) {
    document.tags.push({
      name: 'auth',
      description: 'Better Auth endpoints',
    });
  }

  const cookieSecurity = [{ 'better-auth.session_token': [] as string[] }];

  addPath(document, `${base}/sign-up/email`, 'post', {
    tags: ['auth'],
    summary: 'Sign up with email + password',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['name', 'email', 'password'],
            properties: {
              name: { type: 'string' },
              email: { type: 'string', format: 'email' },
              password: { type: 'string', minLength: 8 },
              image: { type: 'string' },
              callbackURL: { type: 'string' },
            },
          },
        },
      },
    },
    responses: {
      200: {
        description:
          'User created; sets session cookies (default behavior: auto sign-in).',
      },
    },
  });

  addPath(document, `${base}/sign-in/email`, 'post', {
    tags: ['auth'],
    summary: 'Sign in with email + password',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['email', 'password'],
            properties: {
              email: { type: 'string', format: 'email' },
              password: { type: 'string', minLength: 8 },
              rememberMe: { type: 'boolean', default: true },
              callbackURL: { type: 'string' },
            },
          },
        },
      },
    },
    responses: {
      200: { description: 'Signed in; sets session cookies.' },
      401: { description: 'Invalid credentials.' },
    },
  });

  addPath(document, `${base}/sign-out`, 'post', {
    tags: ['auth'],
    summary: 'Sign out',
    security: cookieSecurity,
    responses: {
      200: { description: 'Signed out; clears session cookies.' },
      401: { description: 'Not authenticated.' },
    },
  });

  addPath(document, `${base}/get-session`, 'get', {
    tags: ['auth'],
    summary: 'Get current session',
    security: cookieSecurity,
    responses: {
      200: { description: 'Current session payload.' },
      401: { description: 'Not authenticated.' },
    },
  });

  addPath(document, `${base}/request-password-reset`, 'post', {
    tags: ['auth'],
    summary: 'Request password reset',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['email'],
            properties: {
              email: { type: 'string', format: 'email' },
              redirectTo: { type: 'string' },
            },
          },
        },
      },
    },
    responses: {
      200: { description: 'Reset email triggered (if user exists).' },
    },
  });

  addPath(document, `${base}/reset-password`, 'post', {
    tags: ['auth'],
    summary: 'Reset password (token)',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['newPassword', 'token'],
            properties: {
              newPassword: { type: 'string', minLength: 8 },
              token: { type: 'string' },
            },
          },
        },
      },
    },
    responses: {
      200: { description: 'Password reset successful.' },
      400: { description: 'Invalid/expired token.' },
    },
  });

  addPath(document, `${base}/change-password`, 'post', {
    tags: ['auth'],
    summary: 'Change password',
    security: cookieSecurity,
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['newPassword', 'currentPassword'],
            properties: {
              newPassword: { type: 'string', minLength: 8 },
              currentPassword: { type: 'string' },
              revokeOtherSessions: { type: 'boolean', default: false },
            },
          },
        },
      },
    },
    responses: {
      200: { description: 'Password updated.' },
      401: { description: 'Not authenticated.' },
      403: { description: 'Session not fresh (if configured).' },
    },
  });

  return document;
}

