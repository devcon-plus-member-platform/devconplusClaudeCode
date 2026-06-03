import { PartialType } from '@nestjs/mapped-types';
import { CreateNewsPostDto } from './create-news-post.dto';

export class UpdateNewsPostDto extends PartialType(CreateNewsPostDto) {}
