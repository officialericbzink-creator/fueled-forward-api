// profile/profile.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/database/database.service';
import {
  OnboardingStep0Dto,
  OnboardingStep1Dto,
  OnboardingStep2Dto,
  OnboardingStep3Dto,
  OnboardingStep4Dto,
  OnboardingStep5Dto,
} from './dto/onboarding-step.dto';
import { User } from 'generated/prisma';

@Injectable()
export class ProfileService {
  constructor(private readonly db: PrismaService) {}

  async getUserProfile(userId: string) {
    return this.db.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
  }

  async updateProfile(
    userId: string,
    data: {
      name?: string;
      image?: string;
      profile?: {
        bio?: string;
        struggles?: string[];
        inTherapy?: boolean;
        therapyDetails?: string;
        struggleNotes?: string;
      };
    },
  ) {
    const userUpdateData: Partial<User> = {};
    if (data.name !== undefined) userUpdateData.name = data.name;
    if (data.image !== undefined) userUpdateData.image = data.image;

    if (Object.keys(userUpdateData).length > 0) {
      await this.db.user.update({
        where: { id: userId },
        data: userUpdateData,
      });
    }

    if (data.profile && Object.keys(data.profile).length > 0) {
      await this.db.profile.upsert({
        where: { userId },
        create: {
          userId,
          ...data.profile,
        },
        update: data.profile,
      });
    }

    return { success: true };
  }

  async getOnboardingStatus(userId: string) {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: {
        completedOnboarding: true,
        onboardingStep: true,
        profile: {
          select: {
            struggles: true,
            struggleTimestamp: true,
            struggleNotes: true,
            inTherapy: true,
            therapyDetails: true,
          },
        },
      },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    console.log('Onboarding status for user', userId, user);

    return {
      completedOnboarding: user.completedOnboarding,
      currentStep: user.onboardingStep,
      profile: user.profile || undefined,
    };
  }

  async completeOnboardingStep(
    userId: string,
    step: number,
    data: any,
  ): Promise<{ success: boolean; currentStep: number }> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { onboardingStep: true, completedOnboarding: true },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.completedOnboarding) {
      throw new BadRequestException('Onboarding already completed');
    }

    // Allow submitting any step up to the max they've reached
    if (step > user.onboardingStep + 1) {
      throw new BadRequestException(
        `Cannot skip steps. Current step is ${user.onboardingStep}`,
      );
    }

    switch (step) {
      case 0:
        await this.handleStep0(userId, data as OnboardingStep0Dto);
        break;
      case 1:
        await this.handleStep1(userId, data as OnboardingStep1Dto);
        break;
      case 2:
        await this.handleStep2(userId, data as OnboardingStep2Dto);
        break;
      case 3:
        await this.handleStep3(userId, data as OnboardingStep3Dto);
        break;
      case 4:
        await this.handleStep4(userId, data as OnboardingStep4Dto);
        break;
      // case 5:
      //   await this.handleStep5(userId, data as OnboardingStep5Dto);
      //   break;
      default:
        throw new BadRequestException('Invalid step');
    }

    // Always move to next step after submission
    const nextStep = Math.min(step + 1, 4);

    // Only update DB if we're at or past the current saved step
    if (nextStep > user.onboardingStep) {
      await this.db.user.update({
        where: { id: userId },
        data: { onboardingStep: nextStep },
      });
    }

    return {
      success: true,
      currentStep: nextStep, // Always return next step
    };
  }

  // Step 0: Name (on User model)
  private async handleStep0(userId: string, data: OnboardingStep0Dto) {
    await this.db.user.update({
      where: { id: userId },
      data: { name: data.name },
    });
  }

  // Step 1: Struggles (on Profile model)
  private async handleStep1(userId: string, data: OnboardingStep1Dto) {
    await this.db.profile.upsert({
      where: { userId },
      create: {
        userId,
        struggles: data.struggles,
      },
      update: {
        struggles: data.struggles,
      },
    });
  }

  // Step 2: Important Date (on Profile model)
  private async handleStep2(userId: string, data: OnboardingStep2Dto) {
    const updateData: any = {};

    if (data.importantDate) {
      updateData.struggleTimestamp = new Date(data.importantDate);
    }

    if (data.importantDateText) {
      updateData.struggleNotes = data.importantDateText;
    }

    await this.db.profile.upsert({
      where: { userId },
      create: {
        userId,
        ...updateData,
      },
      update: updateData,
    });
  }

  // Step 3: Therapy (on Profile model)
  private async handleStep3(userId: string, data: OnboardingStep3Dto) {
    await this.db.profile.upsert({
      where: { userId },
      create: {
        userId,
        inTherapy: data.inTherapy,
        therapyDetails: data.therapyDetails,
      },
      update: {
        inTherapy: data.inTherapy,
        therapyDetails: data.therapyDetails,
      },
    });
  }

  // Step 4: Paywall (frontend only, just validation)
  private async handleStep4(userId: string, data: OnboardingStep4Dto) {
    if (!data.paywallCompleted) {
      throw new BadRequestException('Paywall step must be completed');
    }
    // No database update needed
  }

  // Step 5: Biometric (on User model)
  private async handleStep5(userId: string, data: OnboardingStep5Dto) {
    await this.db.user.update({
      where: { id: userId },
      data: { localSecurityEnabled: data.biometricEnabled },
    });
  }

  async completeOnboarding(userId: string) {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { onboardingStep: true, completedOnboarding: true },
    });

    if (!user) {
      console.log('User not found during onboarding completion');
      throw new BadRequestException('User not found');
    }

    if (user.completedOnboarding) {
      console.log('Onboarding already completed');
      throw new BadRequestException('Onboarding already completed');
    }

    // if (user.onboardingStep < 5) {
    //   console.log('All steps must be complete');
    //   throw new BadRequestException('All onboarding steps must be completed');
    // }

    await this.db.user.update({
      where: { id: userId },
      data: { completedOnboarding: true },
    });

    return { success: true };
  }

  async deleteProfile(userId: string) {
    try {
      await this.db.message.deleteMany({ where: { conversation: { userId } } });
      await this.db.conversation.delete({ where: { userId } });
      await this.db.checkIn.deleteMany({ where: { userId } });
      await this.db.dailyGoal.deleteMany({ where: { userId } });
      await this.db.profile.delete({ where: { userId } });
      await this.db.user.delete({ where: { id: userId } });

      return { success: true };
    } catch (error) {
      console.error('Error deleting profile for user', userId, error);
      throw new BadRequestException(
        `Failed to delete profile: ${error.message}`,
      );
    }
  }
}
