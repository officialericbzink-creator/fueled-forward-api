export class CheckInStepResponse {
  step: number;
  mood: number;
  notes: string;
}

export class CheckInResponse {
  id: string;
  userId: string;
  date: Date;
  overallMood: number;
  completed: boolean;
  steps: CheckInStepResponse[];
  createdAt: Date;
  updatedAt: Date;
}

export class CheckInHistoryResponse {
  id: string;
  date: Date;
  overallMood: number;
  completed: boolean;
  steps: CheckInStepResponse[];
  createdAt: Date;
}
