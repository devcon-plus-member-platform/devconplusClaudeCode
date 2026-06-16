import { IsNotEmpty, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

// One-time profile completion for OAuth (Google) users whose profile row was
// created during /auth/firebase/exchange with a null username. Unlike
// UpdateProfileDto, this DTO accepts chapter_id — but the service only honours
// it while the profile is still incomplete (username unset), so it cannot be
// abused to bypass the organizer-upgrade chapter-change workflow afterwards.
export class CompleteProfileDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  full_name!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(20)
  @Matches(/^[a-z0-9_]+$/, {
    message: 'Username may only contain lowercase letters, numbers, and underscores',
  })
  username!: string;

  @IsUUID()
  chapter_id!: string;
}
