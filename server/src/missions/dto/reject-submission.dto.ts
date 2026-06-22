import { IsString, MaxLength, MinLength } from 'class-validator';

export class RejectSubmissionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  adminRemarks!: string;
}
