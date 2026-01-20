import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { PrismaClient } from '../../generated/prisma';
import { admin, customSession } from 'better-auth/plugins';
import { expo } from '@better-auth/expo';

const prisma = new PrismaClient();

export const auth = betterAuth({
  advanced: {
    disableOriginCheck: process.env.NODE_ENV !== 'production',
    useSecureCookies: process.env.NODE_ENV === 'production',
  },
  trustedOrigins: [
    'fueled-forward-app://',
    'https://auth.fueledforwardapp.com',
  ],
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  user: {
    additionalFields: {
      completedOnboarding: {
        type: 'boolean',
        required: false,
        defaultValue: false,
        input: false,
        returned: true,
      },
      onboardingStep: {
        type: 'number',
        required: false,
        defaultValue: 0,
        input: false,
        returned: true,
      },
      role: {
        type: 'string',
        required: false,
        defaultValue: 'user',
        input: false,
        returned: true,
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    // sendResetPassword: async ({ url, user, token }, request) => {},
  },
  emailVerification: {
    sendOnSignUp: false,
    expiresIn: 1000 * 60 * 60 * 24,
    autoSignInAfterVerification: true,
    // sendVerificationEmail: async ({ user, url, token }, request) => {},
  },
  plugins: [
    expo(),
    admin({
      defaultBanReason: 'Misconduct/Inappropriate Behavior',
      adminRoles: ['admin', 'superadmin'],
    }),
    customSession(async ({ session, user }, ctx) => {
      const userData = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          completedOnboarding: true,
          onboardingStep: true,
          role: true,
        },
      });
      return {
        session,
        user: {
          ...user,
          completedOnboarding: userData?.completedOnboarding,
          onboardingStep: userData?.onboardingStep,
          role: userData?.role,
        },
      };
    }),
  ],
});
