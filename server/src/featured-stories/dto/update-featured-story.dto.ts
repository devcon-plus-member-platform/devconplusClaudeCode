import { PartialType } from '@nestjs/mapped-types';
import { CreateFeaturedStoryDto } from './create-featured-story.dto';

export class UpdateFeaturedStoryDto extends PartialType(CreateFeaturedStoryDto) {}
