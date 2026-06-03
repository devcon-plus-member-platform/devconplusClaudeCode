import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const REGIONS = ['Luzon', 'Visayas', 'Mindanao'] as const;

export class CreateChapterDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsIn(REGIONS)
  region?: string | null;
}
