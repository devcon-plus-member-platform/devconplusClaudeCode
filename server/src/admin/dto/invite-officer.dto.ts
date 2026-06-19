import { IsEmail, IsUUID } from 'class-validator';

export class InviteOfficerDto {
  @IsEmail()
  email!: string;

  @IsUUID()
  chapter_id!: string;
}
