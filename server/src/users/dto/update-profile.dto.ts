import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

// chapter_id is intentionally absent — chapter changes require the organizer
// upgrade request workflow (pending_chapter_id reviewed by an admin/officer).
// avatar_url is intentionally absent — the dedicated POST /api/users/me/avatar
// endpoint handles upload AND persists the URL server-side, preventing callers
// from injecting arbitrary URLs that bypass the upload pipeline.
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
