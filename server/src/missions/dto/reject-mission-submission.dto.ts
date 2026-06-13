import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectMissionSubmissionDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
