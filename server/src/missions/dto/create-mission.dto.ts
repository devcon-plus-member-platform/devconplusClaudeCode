import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateMissionDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsInt()
  @Min(0)
  xp_reward!: number;

  @IsString()
  difficulty!: string;

  @IsEnum(['proof_upload', 'link', 'self_attest'])
  submission_type!: 'proof_upload' | 'link' | 'self_attest';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  github_url?: string | null;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
