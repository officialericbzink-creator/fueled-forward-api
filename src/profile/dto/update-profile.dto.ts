import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class UpdateProfileDetailsDto {
  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  struggles?: string[];

  @IsOptional()
  @IsBoolean()
  inTherapy?: boolean;

  @IsOptional()
  @IsString()
  therapyDetails?: string;

  @IsOptional()
  @IsString()
  struggleNotes?: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateProfileDetailsDto)
  profile?: UpdateProfileDetailsDto;
}

