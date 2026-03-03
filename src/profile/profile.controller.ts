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
  Session,
  Req,
  UseFilters,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiExtraModels,
  ApiOkResponse,
  ApiParam,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from 'src/auth/auth.guard';
import type { UserSession } from 'src/auth/auth.types';
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
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UploadAvatarDto } from './dto/upload-avatar.dto';
import { MediaService } from 'src/media/media.service';
import {
  createAvatarMulterOptions,
  extensionForMimeType,
} from 'src/media/media-upload.validation';
import { MulterExceptionFilter } from 'src/common/filters/multer-exception.filter';

@ApiTags('profile')
@ApiCookieAuth('better-auth.session_token')
@ApiExtraModels(
  OnboardingStep0Dto,
  OnboardingStep1Dto,
  OnboardingStep2Dto,
  OnboardingStep3Dto,
  OnboardingStep4Dto,
  OnboardingStep5Dto,
)
@Controller('profile')
@UseGuards(AuthGuard)
export class ProfileController {
  constructor(
    private readonly profileService: ProfileService,
    private readonly mediaService: MediaService,
  ) {}

  @Get('me')
  @ApiOkResponse({
    schema: {
      example: {
        id: 'user_id',
        name: 'John Doe',
        email: 'john@example.com',
        image: 'https://example.com/avatar.png',
      },
    },
  })
  async getProfile(@Session() session: UserSession) {
    return this.profileService.getUserProfile(session.user.id);
  }

  @Post('update')
  @ApiOkResponse({
    schema: {
      example: {
        id: 'user_id',
        name: 'John Doe',
        image: 'https://example.com/avatar.png',
      },
    },
  })
  async updateProfile(
    @Session() session: UserSession,
    @Body() data: UpdateProfileDto,
  ) {
    return this.profileService.updateProfile(session.user.id, data);
  }

  @Post('avatar')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadAvatarDto })
  @ApiOkResponse({
    schema: {
      example: {
        success: true,
        data: {
          key: 'user-avatars/user_id/123.jpg',
          url: 'https://example.com/user-avatars/user_id/123.jpg',
          type: 'AVATAR',
          userId: 'user_id',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', createAvatarMulterOptions()))
  @UseFilters(MulterExceptionFilter)
  async updateAvatar(
    @UploadedFile() file: Express.Multer.File,
    @Session() session: UserSession,
    @Req() req: { fileValidationError?: string },
  ) {
    try {
      if (req.fileValidationError) {
        throw new BadRequestException(req.fileValidationError);
      }
      if (!file) {
        throw new BadRequestException('File is required.');
      }
      const key = this.mediaService.generateAvatarKey(
        session.user.id,
        extensionForMimeType(file.mimetype),
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(`Avatar upload failed: ${message}`);
    }
  }

  @Post('onboarding/complete')
  @ApiOkResponse({ schema: { example: { success: true } } })
  async completeOnboarding(@Session() session: UserSession) {
    return this.profileService.completeOnboarding(session.user.id);
  }

  @Post('onboarding/:step')
  @ApiParam({
    name: 'step',
    required: true,
    schema: { type: 'integer', minimum: 0, maximum: 5 },
  })
  @ApiBody({
    schema: {
      oneOf: [
        { $ref: getSchemaPath(OnboardingStep0Dto) },
        { $ref: getSchemaPath(OnboardingStep1Dto) },
        { $ref: getSchemaPath(OnboardingStep2Dto) },
        { $ref: getSchemaPath(OnboardingStep3Dto) },
        { $ref: getSchemaPath(OnboardingStep4Dto) },
        { $ref: getSchemaPath(OnboardingStep5Dto) },
      ],
    },
  })
  async completeOnboardingStep(
    @Session() session: UserSession,
    @Param('step', ParseIntPipe) step: number,
    @Body()
    body:
      | OnboardingStep0Dto
      | OnboardingStep1Dto
      | OnboardingStep2Dto
      | OnboardingStep3Dto
      | OnboardingStep4Dto
      | OnboardingStep5Dto,
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
  @ApiOkResponse({
    schema: {
      example: { onboardingStep: 0, completedOnboarding: false },
    },
  })
  async getOnboardingStatus(
    @Session() session: UserSession,
  ): Promise<OnboardingStatusResponse> {
    return this.profileService.getOnboardingStatus(session.user.id);
  }

  @Delete('delete')
  @ApiOkResponse({ schema: { example: { success: true } } })
  async deleteProfile(@Session() session: UserSession) {
    return this.profileService.deleteProfile(session.user.id);
  }
}
