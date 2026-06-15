import { PartialType } from '@nestjs/mapped-types';
import { CreateRewardDto } from './create-reward.dto';

// All fields optional — same validations as CreateRewardDto apply when present.
export class UpdateRewardDto extends PartialType(CreateRewardDto) {}
