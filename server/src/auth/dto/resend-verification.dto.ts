import { IsEmail, IsOptional, Matches, MaxLength } from 'class-validator';

export class ResendVerificationDto {
  @IsEmail()
  email!: string;

  // See EmailSignupDto.returnTo — carried through so a resent link still
  // redirects to the original destination after verification.
  @IsOptional()
  @MaxLength(500)
  @Matches(/^\/(?!\/)\S*$/, { message: 'Invalid return path' })
  returnTo?: string;
}
