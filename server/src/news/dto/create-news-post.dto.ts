import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

const NEWS_CATEGORIES = ['devcon', 'tech_community'] as const;

export class CreateNewsPostDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  body?: string | null;

  @IsOptional()
  @IsIn(NEWS_CATEGORIES)
  category?: string | null;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['https', 'http'] })
  @MaxLength(512)
  cover_image_url?: string | null;

  @IsOptional()
  @IsBoolean()
  is_featured?: boolean | null;

  @IsOptional()
  @IsBoolean()
  is_promoted?: boolean | null;
}
