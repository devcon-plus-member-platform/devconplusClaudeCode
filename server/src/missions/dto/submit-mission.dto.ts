import { IsString, MaxLength } from 'class-validator';

export class SubmitMissionDto {
  @IsString()
  @MaxLength(500)
  link!: string;
}
