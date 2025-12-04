// profile/profile.controller.ts
import {
  Controller,
  Get,
  Post,
  UseGuards,
  Body,
  Param,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import {
  AuthGuard,
  Session,
  type UserSession,
} from '@thallesp/nestjs-better-auth';
import { ProfileService } from './profile.service';
import {
  OnboardingStep0Dto,
  OnboardingStep1Dto,
  OnboardingStep2Dto,
  OnboardingStep3Dto,
  OnboardingStep4Dto,
  OnboardingStep5Dto,
} from './dto/onboarding-step.dto';
import {
  OnboardingStepResponse,
  OnboardingStatusResponse,
} from './dto/onboarding-response.dto';

@Controller('profile')
@UseGuards(AuthGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('me')
  async getProfile(@Session() session: UserSession) {
    return this.profileService.getUserProfile(session.user.id);
  }

  @Post('update')
  async updateProfile() {
    // Logic to update profile
  }

  @Post('avatar')
  async updateAvatar() {
    // Logic to update avatar
  }

  @Post('onboarding/complete')
  async completeOnboarding(@Session() session: UserSession) {
    return this.profileService.completeOnboarding(session.user.id);
  }

  @Post('onboarding/:step')
  async completeOnboardingStep(
    @Session() session: UserSession,
    @Param('step', ParseIntPipe) step: number,
    @Body() body: any,
  ): Promise<OnboardingStepResponse> {
    // Validate step number (0-5)
    if (step < 0 || step > 5) {
      throw new BadRequestException('Step must be between 0 and 5');
    }

    // Validate body based on step
    let validatedData: any;
    switch (step) {
      case 0:
        validatedData = body as OnboardingStep0Dto;
        break;
      case 1:
        validatedData = body as OnboardingStep1Dto;
        break;
      case 2:
        validatedData = body as OnboardingStep2Dto;
        break;
      case 3:
        validatedData = body as OnboardingStep3Dto;
        break;
      case 4:
        validatedData = body as OnboardingStep4Dto;
        break;
      case 5:
        validatedData = body as OnboardingStep5Dto;
        break;
    }

    return this.profileService.completeOnboardingStep(
      session.user.id,
      step,
      validatedData,
    );
  }

  @Get('onboarding/status')
  async getOnboardingStatus(
    @Session() session: UserSession,
  ): Promise<OnboardingStatusResponse> {
    return this.profileService.getOnboardingStatus(session.user.id);
  }
}
