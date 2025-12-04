import {
  IsString,
  IsISO8601,
  IsArray,
  ValidateNested,
  IsInt,
  Min,
  Max,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CheckInStepDto {
  @IsInt()
  @Min(1)
  @Max(5)
  step: number;

  @IsInt()
  @Min(1)
  @Max(5)
  mood: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

// ✅ BODY DTO - For POST request
export class CreateCheckInDto {
  @IsISO8601()
  date: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CheckInStepDto)
  steps: CheckInStepDto[];
}
