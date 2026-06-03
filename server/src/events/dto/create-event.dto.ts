import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  MaxLength,
  ValidateIf,
} from 'class-validator';

const CATEGORIES = [
  'tech_talk', 'hackathon', 'workshop', 'brown_bag',
  'summit', 'social', 'networking',
] as const;

const DEVCON_CATEGORIES = ['devcon', 'she', 'kids', 'campus'] as const;

const VISIBILITIES = ['public', 'unlisted', 'draft'] as const;

export class CreateEventDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  location?: string | null;

  @IsOptional()
  @IsString()
  event_date?: string | null;

  @IsOptional()
  @IsString()
  end_date?: string | null;

  @IsOptional()
  @IsIn(CATEGORIES)
  category?: string | null;

  @IsOptional()
  @IsIn(DEVCON_CATEGORIES)
  devcon_category?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[] | null;

  @IsOptional()
  @IsIn(VISIBILITIES)
  visibility?: string | null;

  @IsOptional()
  @IsBoolean()
  is_free?: boolean | null;

  @IsOptional()
  ticket_price_php?: number | null;

  @IsOptional()
  capacity?: number | null;

  @IsOptional()
  points_value?: number | null;

  @IsOptional()
  volunteer_points?: number | null;

  @IsOptional()
  @IsBoolean()
  requires_approval?: boolean | null;

  @IsOptional()
  @IsBoolean()
  is_chapter_locked?: boolean | null;

  @IsOptional()
  @IsBoolean()
  is_external?: boolean | null;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  external_registration_url?: string | null;

  @IsOptional()
  @ValidateIf((o: CreateEventDto) => o.cover_image_url != null && o.cover_image_url !== '')
  @IsUrl({ require_protocol: true, protocols: ['https', 'http'] })
  @MaxLength(512)
  cover_image_url?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  slug?: string | null;

  @IsOptional()
  custom_form_schema?: unknown;

  /** hq_admin+ only: override the chapter this event belongs to. */
  @IsOptional()
  @IsUUID()
  chapter_id?: string | null;
}
