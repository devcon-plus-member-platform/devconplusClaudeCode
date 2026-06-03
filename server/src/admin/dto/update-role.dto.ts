import { IsEnum } from 'class-validator';
import type { ProfileRole } from '../../supabase/types';

export class UpdateRoleDto {
  @IsEnum(['member', 'chapter_officer', 'hq_admin', 'super_admin'])
  role!: ProfileRole;
}
