import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateRewardDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @ValidateIf((o: CreateRewardDto) => o.description !== null)
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsInt()
  @Min(1)
  points_cost!: number;

  @IsIn(['digital', 'physical'])
  type!: 'digital' | 'physical';

  @IsIn(['onsite', 'digital_delivery'])
  claim_method!: 'onsite' | 'digital_delivery';

  @IsOptional()
  @ValidateIf((o: CreateRewardDto) => o.stock_remaining !== null)
  @IsInt()
  @Min(0)
  stock_remaining?: number | null;

  @IsOptional()
  @ValidateIf((o: CreateRewardDto) => o.max_per_user !== null)
  @IsInt()
  @Min(1)
  max_per_user?: number | null;

  @IsBoolean()
  is_active!: boolean;

  @IsBoolean()
  is_coming_soon!: boolean;

  @IsOptional()
  @ValidateIf((o: CreateRewardDto) => o.image_url !== null)
  @IsUrl({ require_protocol: true, protocols: ['https', 'http'] })
  @MaxLength(512)
  image_url?: string | null;

  // Optional time limit — ISO timestamp. When set and in the past, the reward
  // is deactivated (deactivate_expired_rewards cron + redeem_reward guard).
  // null = no deadline (never expires).
  @IsOptional()
  @ValidateIf((o: CreateRewardDto) => o.deadline !== null)
  @IsDateString()
  deadline?: string | null;
}
