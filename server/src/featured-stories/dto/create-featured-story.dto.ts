import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

const STORY_TYPES = ['article', 'video'] as const;

export class CreateFeaturedStoryDto {
  @IsOptional()
  @IsIn(STORY_TYPES)
  type?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  youtube_id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  article_url?: string | null;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
