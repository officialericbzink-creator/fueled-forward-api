import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MinLength } from 'class-validator';

export const ENTRY_TYPES = ['journal_entry', 'activity_log', 'vent'] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

export class CreateEntryDto {
  @ApiProperty({ enum: ENTRY_TYPES, description: 'Kind of entry' })
  @IsString()
  @IsIn(ENTRY_TYPES)
  type!: EntryType;

  @ApiProperty({ description: 'Entry body text', minLength: 1 })
  @IsString()
  @MinLength(1, { message: 'content is required' })
  content!: string;
}
