import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

const CODE_PATTERN = /^DCN-[A-Z]{3}-[0-9]{4}$/;

export class CreateOrgCodeDto {
  @IsString()
  @MaxLength(20)
  @Matches(CODE_PATTERN, { message: 'Code must match DCN-XXX-XXXX format' })
  code!: string;

  @IsOptional()
  @IsUUID('4')
  chapter_id?: string;

  @IsEnum(['chapter_officer', 'hq_admin'])
  assigned_role!: 'chapter_officer' | 'hq_admin';

  @IsOptional()
  @IsInt()
  @IsPositive()
  usage_limit?: number;

  @IsOptional()
  @IsISO8601()
  expires_at?: string;
}
