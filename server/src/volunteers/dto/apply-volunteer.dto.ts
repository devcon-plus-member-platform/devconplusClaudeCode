import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class ApplyVolunteerDto {
  @IsUUID('4')
  eventId!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone_number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  social_media_handle?: string;
}
