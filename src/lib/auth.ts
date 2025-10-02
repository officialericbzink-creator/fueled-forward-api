import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { PrismaClient } from '@prisma/client';
import { admin } from 'better-auth/plugins';
import { expo } from '@better-auth/expo';

const prisma = new PrismaClient();

export const auth = betterAuth({
  trustedOrigins: ['fueled-forward-app://'],
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  user: {
    additionalFields: {
      completedOnboarding: {
        type: 'boolean',
        default: false,
        fieldName: 'completedOnboarding',
      },
      onboardingStep: { type: 'string', default: '' },
      role: { type: 'string', default: 'user' },
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async () => {},
  },
  emailVerification: {
    sendOnSignUp: true,
    expiresIn: 1000 * 60 * 60 * 24, // 1 day
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url, token }, request) => {},
  },
  plugins: [
    expo(),
    admin({
      defaultBanReason: 'Misconduct/Inappropriate Behavior',
      adminRoles: ['admin', 'superadmin'],
    }),
  ],
});
