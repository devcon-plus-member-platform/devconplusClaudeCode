import { IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateAnnouncementDto {
  @IsUUID()
  event_id!: string;

  @IsString()
  @MaxLength(500)
  message!: string;
}
