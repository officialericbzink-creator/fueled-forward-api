import { IsUUID } from 'class-validator';

export class CheckInParamDto {
  @IsUUID()
  id: string;
}
