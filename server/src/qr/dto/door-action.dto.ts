import { IsEnum, IsUUID } from 'class-validator';

export class DoorActionDto {
  @IsUUID('4')
  registrationId!: string;

  @IsEnum(['approve', 'reject'])
  action!: 'approve' | 'reject';
}
