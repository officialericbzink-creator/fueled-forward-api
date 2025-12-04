import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class GetHistoryQueryDto {
  @IsOptional()
  @Type(() => Number) // Convert "30" string to 30 number
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 30;
}
