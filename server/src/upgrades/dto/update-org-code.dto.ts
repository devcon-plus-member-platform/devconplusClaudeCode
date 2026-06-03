import { IsBoolean, IsISO8601, IsInt, IsOptional, IsPositive, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateOrgCodeDto {
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^DCN-[A-Z]{3}-[0-9]{4}$/, { message: 'Code must match DCN-XXX-XXXX format' })
  code?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  usage_limit?: number;

  @IsOptional()
  @IsISO8601()
  expires_at?: string;
}
