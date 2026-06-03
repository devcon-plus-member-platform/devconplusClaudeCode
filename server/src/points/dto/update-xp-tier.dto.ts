import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateXpTierDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  min_points?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  max_points?: number | null;

  @IsOptional()
  @IsString()
  badge_color?: string | null;
}
