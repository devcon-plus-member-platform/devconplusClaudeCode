import { IsOptional, IsString } from 'class-validator';

export class ListAnnouncementsQueryDto {
  @IsOptional()
  @IsString()
  event_ids?: string;
}
