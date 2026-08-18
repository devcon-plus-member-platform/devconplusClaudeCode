import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { ProfileRole } from '../../supabase/types';
import type { UserSortColumn } from '../admin.repository';

/**
 * Query params for GET /api/admin/users.
 *
 * `pageSize` is deliberately optional: omitting it returns every match (paged
 * through server-side), which is what callers that need the whole set — e.g. the
 * Chapter Officers page listing all chapter_officers — rely on. Supplying it
 * returns just that window plus the total match count.
 */
export class ListUsersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsIn(['member', 'chapter_officer', 'hq_admin', 'super_admin'])
  role?: ProfileRole;

  @IsOptional()
  @IsIn(['name', 'email', 'role', 'points'])
  sort?: UserSortColumn;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  dir?: 'asc' | 'desc';
}
