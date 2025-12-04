export class OnboardingStepResponse {
  success: boolean;
  currentStep: number;
}

export class OnboardingStatusResponse {
  completedOnboarding: boolean;
  currentStep: number;
  profile?: {
    struggles?: string[];
    struggleTimestamp: Date | null;
    struggleNotes: string | null;
    inTherapy: boolean;
    therapyDetails: string | null;
  };
}
