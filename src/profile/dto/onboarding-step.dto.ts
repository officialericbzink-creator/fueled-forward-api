// profile/dto/onboarding-step.dto.ts
import {
  IsString,
  IsArray,
  IsBoolean,
  IsOptional,
  IsDateString,
  IsInt,
  Min,
  Max,
} from 'class-validator';

export class OnboardingStepParamDto {
  @IsInt()
  @Min(0)
  @Max(5)
  step: number;
}

// Step 0: Name
export class OnboardingStep0Dto {
  @IsString()
  name: string;
}

// Step 1: Struggles
export class OnboardingStep1Dto {
  @IsArray()
  @IsString({ each: true })
  struggles: string[];
}

// Step 2: Important Date
export class OnboardingStep2Dto {
  @IsOptional()
  @IsDateString()
  importantDate?: string;

  @IsOptional()
  @IsString()
  importantDateText?: string;
}

// Step 3: Therapy
export class OnboardingStep3Dto {
  @IsBoolean()
  inTherapy: boolean;

  @IsOptional()
  @IsString()
  therapyDetails?: string; // Will contain duration if yes, or why not if no
}

// Step 4: Paywall (handled on frontend, just confirms completion)
export class OnboardingStep4Dto {
  @IsBoolean()
  paywallCompleted: boolean;
}

// Step 5: Biometric
export class OnboardingStep5Dto {
  @IsBoolean()
  biometricEnabled: boolean;
}

// Union type for all step DTOs
export type OnboardingStepDto =
  | OnboardingStep0Dto
  | OnboardingStep1Dto
  | OnboardingStep2Dto
  | OnboardingStep3Dto
  | OnboardingStep4Dto
  | OnboardingStep5Dto;
