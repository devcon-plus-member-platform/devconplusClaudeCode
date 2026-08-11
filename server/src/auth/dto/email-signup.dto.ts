import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class EmailSignupDto {
  @IsEmail()
  email!: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  password!: string;

  @IsNotEmpty()
  @IsString()
  full_name!: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsUUID()
  chapter_id?: string;

  @IsOptional()
  @IsString()
  school_or_company?: string;

  // Cloudflare Turnstile token — verified server-side when TURNSTILE_SECRET_KEY is set.
  @IsOptional()
  @IsString()
  captchaToken?: string;

  // Optional referrer code. Confirmed server-side after the profile row is created
  // (replaces the former direct supabase.rpc('confirm_referral') browser call).
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9]{6,12}$/i, { message: 'Invalid referral code' })
  referral_code?: string;

  // Where to send the user after they click the emailed verification link
  // (e.g. back to the event registration page they signed up from). Embedded
  // in the verification JWT so it survives being opened on a different device.
  @IsOptional()
  @MaxLength(500)
  @Matches(/^\/(?!\/)\S*$/, { message: 'Invalid return path' })
  returnTo?: string;
}
