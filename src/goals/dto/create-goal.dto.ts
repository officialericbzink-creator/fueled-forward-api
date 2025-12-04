import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateGoalDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  goal: string;
}
