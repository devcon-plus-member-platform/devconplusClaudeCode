import { IsIn, IsOptional, IsString } from 'class-validator';

export class ExportAttendanceQueryDto {
  @IsOptional()
  @IsIn(['all', 'event'])
  scope?: 'all' | 'event';

  @IsOptional()
  @IsString()
  eventId?: string;

  @IsOptional()
  @IsIn(['all', 'approved', 'pending', 'rejected', 'checked_in', 'not_checked_in'])
  status?: 'all' | 'approved' | 'pending' | 'rejected' | 'checked_in' | 'not_checked_in';
}
