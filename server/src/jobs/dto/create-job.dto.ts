import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateIf,
} from 'class-validator';

const WORK_TYPES = ['remote', 'onsite', 'hybrid', 'full_time', 'part_time'] as const;

export class CreateJobDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  company!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  location?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @ValidateIf((o: CreateJobDto) => o.apply_url != null && o.apply_url !== '')
  @IsUrl({ require_protocol: true, protocols: ['https', 'http'] })
  @MaxLength(512)
  apply_url?: string | null;

  @IsOptional()
  @ValidateIf((o: CreateJobDto) => o.logo_url != null && o.logo_url !== '')
  @IsUrl({ require_protocol: true, protocols: ['https', 'http'] })
  @MaxLength(512)
  logo_url?: string | null;

  @IsOptional()
  @IsIn(WORK_TYPES)
  work_type?: string | null;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean | null;

  @IsOptional()
  @IsBoolean()
  is_promoted?: boolean | null;
}
