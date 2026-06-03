import { IsOptional, IsString, IsUrl, IsUUID, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  full_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  school_or_company?: string;

  @IsOptional()
  @IsUUID('4')
  chapter_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  avatar_url?: string;

  @IsOptional()
  @IsUrl({ require_tld: true, protocols: ['https', 'http'] })
  @MaxLength(255)
  linkedin_url?: string;

  @IsOptional()
  @IsUrl({ require_tld: true, protocols: ['https', 'http'] })
  @MaxLength(255)
  github_url?: string;

  @IsOptional()
  @IsUrl({ require_tld: true, protocols: ['https', 'http'] })
  @MaxLength(255)
  portfolio_url?: string;
}
