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
  UploadedFile,
  UseInterceptors,
  Delete,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
import { MediaService } from 'src/media/media.service';

@Controller('profile')
@UseGuards(AuthGuard)
export class ProfileController {
  constructor(
    private readonly profileService: ProfileService,
    private readonly mediaService: MediaService,
  ) {}

  @Get('me')
  async getProfile(@Session() session: UserSession) {
    return this.profileService.getUserProfile(session.user.id);
  }

  @Post('update')
  async updateProfile(
    @Session() session: UserSession,
    @Body()
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
    return this.profileService.updateProfile(session.user.id, data);
  }

  @Post('avatar')
  @UseInterceptors(FileInterceptor('file'))
  async updateAvatar(
    @UploadedFile() file: Express.Multer.File,
    @Session() session: UserSession,
  ) {
    try {
      const key = this.mediaService.generateAvatarKey(
        session.user.id,
        file.originalname,
      );
      const url = await this.mediaService.uploadFile(
        key,
        file.buffer,
        file.mimetype,
      );

      await this.profileService.updateProfile(session.user.id, { image: url });
      return {
        success: true,
        data: {
          key,
          url,
          type: 'AVATAR',
          userId: session.user.id,
        },
      };
    } catch (error) {
      throw new BadRequestException(`Avatar upload failed: ${error.message}`);
    }
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

  @Delete('delete')
  async deleteProfile(@Session() session: UserSession) {
    return this.profileService.deleteProfile(session.user.id);
  }
}
