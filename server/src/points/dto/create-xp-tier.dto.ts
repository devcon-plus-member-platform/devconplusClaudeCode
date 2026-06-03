import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateXpTierDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsInt()
  @Min(0)
  min_points!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  max_points?: number | null;

  @IsOptional()
  @IsString()
  badge_color?: string | null;
}
